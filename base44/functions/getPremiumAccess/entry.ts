import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolvePremiumAccess, PREMIUM_PRODUCTS } from "../../shared/premiumDomain.js";

const ENTITLEMENT_PAGE_SIZE = 500;
const MAX_ENTITLEMENT_RECORDS = 1_000;
const BODY_COMPOSITION_SCAN_ENABLED =
  Deno.env.get("ENABLE_BODY_COMPOSITION_SCAN") === "true";

// Server-side testing bypass. Set PREMIUM_TESTER_EMAILS in Base44 app Secrets to a
// comma-separated list of account emails. Matching users get full bundle tester access
// without requiring a PremiumEntitlement DB record. Clear this before production launch.
const TESTER_EMAIL_SET = (() => {
  const raw = Deno.env.get("PREMIUM_TESTER_EMAILS") ?? "";
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
})();

const TESTER_FULL_RECORD = Object.freeze({
  product_id: PREMIUM_PRODUCTS.BUNDLE,
  source: "tester",
  status: "active",
  expires_at: null
});

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

  while (records.length < MAX_ENTITLEMENT_RECORDS) {
    const remaining = MAX_ENTITLEMENT_RECORDS - records.length;
    const pageSize = Math.min(ENTITLEMENT_PAGE_SIZE, remaining);
    const page = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: ownerId },
      "-created_date",
      pageSize,
      skip,
      ["product_id", "source", "status", "expires_at"]
    );
    if (!Array.isArray(page)) throw new Error("Invalid entitlement response");
    records.push(...page);
    if (page.length < pageSize) return records;
    skip += page.length;
  }
  throw new Error("Entitlement response exceeded the safe record limit");
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("getPremiumAccess auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  if (TESTER_EMAIL_SET.size > 0 && user.email &&
      TESTER_EMAIL_SET.has(String(user.email).trim().toLowerCase())) {
    return json({
      ...resolvePremiumAccess([TESTER_FULL_RECORD]),
      releaseFlags: { bodyCompositionScan: BODY_COMPOSITION_SCAN_ENABLED }
    });
  }

  try {
    const records = await listAllEntitlements(base44, user.id);
    return json({
      ...resolvePremiumAccess(records),
      releaseFlags: { bodyCompositionScan: BODY_COMPOSITION_SCAN_ENABLED }
    });

  } catch (error) {
    console.error("getPremiumAccess failed", safeErrorDetails(error));
    return json({ error: "Premium access could not be verified" }, { status: 502 });
  }
}
