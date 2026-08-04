import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  BODY_COMPOSITION_RESPONSE_SCHEMA,
  BodyCompositionRequestError,
  buildBodyCompositionPrompt,
  normalizeBodyCompositionRequest,
  normalizeBodyCompositionResult
} from "../../shared/bodyCompositionDomain.js";
import {
  PREMIUM_FEATURES,
  resolvePremiumAccess
} from "../../shared/premiumDomain.js";

const MAX_REQUEST_BYTES = 10_000;
const ENTITLEMENT_PAGE_SIZE = 500;
const SIGNED_URL_TTL_SECONDS = 300;

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeErrorDetails(error) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}

async function listAllEntitlements(base44, ownerId) {
  const records = [];
  let skip = 0;
  while (true) {
    const page = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: ownerId },
      "-created_date",
      ENTITLEMENT_PAGE_SIZE,
      skip,
      ["product_id", "source", "status", "expires_at"]
    );
    if (!Array.isArray(page)) throw new Error("Invalid entitlement response");
    records.push(...page);
    if (page.length < ENTITLEMENT_PAGE_SIZE) return records;
    skip += page.length;
  }
}

async function ownedRecords(base44, entityName, userId, sort, limit) {
  return await base44.entities[entityName].filter(
    { created_by_id: userId },
    sort,
    limit
  );
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("analyzeBodyComposition auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let request;
  try {
    request = normalizeBodyCompositionRequest(await req.json());
  } catch (error) {
    if (error instanceof BodyCompositionRequestError || error instanceof SyntaxError) {
      return json({
        error: error instanceof BodyCompositionRequestError
          ? error.message
          : "A JSON request body is required"
      }, { status: 400 });
    }
    throw error;
  }

  try {
    // Premium authorization happens before profile records, photos, or paid inference are touched.
    const entitlements = await listAllEntitlements(base44, user.id);
    const access = resolvePremiumAccess(entitlements);
    if (access.features[PREMIUM_FEATURES.VISUAL_PROGRESS] !== true) {
      return json({ error: "Premium visual progress access is required" }, { status: 403 });
    }

    const [profiles, preferencesList, strategies] = await Promise.all([
      ownedRecords(base44, "UserProfile", user.id, "-created_date", 1),
      ownedRecords(base44, "UserPreferences", user.id, "-created_date", 1),
      ownedRecords(base44, "CurrentStrategy", user.id, "-created_date", 1)
    ]);
    const profile = profiles[0] ?? null;
    const preferences = preferencesList[0] ?? null;
    const strategy = strategies[0] ?? null;
    if (!profile || !strategy) {
      return json({ error: "Complete onboarding before requesting an estimate" }, { status: 409 });
    }
    if (Array.isArray(preferences?.safety_flags) && preferences.safety_flags.length > 0) {
      return json({
        error: "Photo-based estimates are paused while safety guidance is active. Use your progress trends and qualified guidance instead."
      }, { status: 409 });
    }

    const fileUrls = await Promise.all(
      ["front", "side", "back"].map(async (pose) => {
        const signed = await base44.integrations.Core.CreateFileSignedUrl({
          file_uri: request.photoRefs[pose],
          expires_in: SIGNED_URL_TTL_SECONDS
        });
        if (!signed?.signed_url) throw new Error("Could not create a temporary image link");
        return signed.signed_url;
      })
    );

    const rawResult = await base44.integrations.Core.InvokeLLM({
      prompt: buildBodyCompositionPrompt({ profile, strategy }),
      model: "gemini_3_flash",
      file_urls: fileUrls,
      response_json_schema: BODY_COMPOSITION_RESPONSE_SCHEMA
    });
    return json(normalizeBodyCompositionResult(rawResult, profile.current_weight_lbs));
  } catch (error) {
    if (error instanceof BodyCompositionRequestError) {
      return json({ error: error.message }, { status: 502 });
    }
    console.error("analyzeBodyComposition failed", safeErrorDetails(error));
    return json({ error: "The body-composition estimate could not run right now" }, { status: 502 });
  }
}
