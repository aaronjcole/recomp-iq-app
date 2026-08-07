import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  MealPlanRequestError,
  buildAdaptiveMealPlan,
  normalizeMealPlanRequest
} from "../../shared/adaptiveMealPlanDomain.js";
import {
  PREMIUM_FEATURES,
  resolvePremiumAccess
} from "../../shared/premiumDomain.js";

const MAX_REQUEST_BYTES = 2_000;
const ENTITLEMENT_PAGE_SIZE = 500;

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
    console.error("generateAdaptiveMealPlan auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let request;
  try {
    request = normalizeMealPlanRequest(await req.json());
  } catch (error) {
    if (error instanceof MealPlanRequestError || error instanceof SyntaxError) {
      return json({ error: error instanceof MealPlanRequestError ? error.message : "A JSON request body is required" }, { status: 400 });
    }
    throw error;
  }

  try {
    // Authorization is deliberately checked before any nutrition or check-in
    // data is read. The UI badge is never treated as proof of Premium access.
    const entitlements = await listAllEntitlements(base44, user.id);
    const access = resolvePremiumAccess(entitlements);
    if (access.features[PREMIUM_FEATURES.MEAL_PLANNING] !== true) {
      return json({ error: "Premium meal planning access is required" }, { status: 403 });
    }

    const [strategies, preferencesList, checkIns] = await Promise.all([
      ownedRecords(base44, "CurrentStrategy", user.id, "-created_date", 1),
      ownedRecords(base44, "UserPreferences", user.id, "-created_date", 1),
      ownedRecords(base44, "WeeklyCheckIn", user.id, "-created_date", 1)
    ]);
    const strategy = strategies[0] ?? null;
    const preferences = preferencesList[0] ?? null;
    if (!strategy) {
      return json({ error: "Complete onboarding before creating a meal plan" }, { status: 409 });
    }
    if (Array.isArray(preferences?.safety_flags) && preferences.safety_flags.length > 0) {
      return json({
        error: "Meal planning is paused while safety guidance is active. Review your plan with a qualified professional."
      }, { status: 409 });
    }

    return json(buildAdaptiveMealPlan({
      weekStart: request.weekStart,
      strategy,
      preferences,
      checkIn: checkIns[0] ?? null
    }));
  } catch (error) {
    if (error instanceof MealPlanRequestError) {
      return json({ error: error.message }, { status: 409 });
    }
    console.error("generateAdaptiveMealPlan failed", safeErrorDetails(error));
    return json({ error: "The meal plan could not be created right now" }, { status: 502 });
  }
}
