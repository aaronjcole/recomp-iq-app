import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { resolvePremiumAccess } from "../../shared/premiumDomain.js";
import { loadPremiumAccessRecords } from "../../shared/entitlementAccess.js";

const BODY_COMPOSITION_SCAN_ENABLED =
  Deno.env.get("ENABLE_BODY_COMPOSITION_SCAN") === "true";

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

  try {
    // Listed testers (PREMIUM_TESTER_EMAILS) resolve to the bundle inside the
    // shared loader, the same one every gated function uses.
    const records = await loadPremiumAccessRecords(base44, user, { testerEmails: Deno.env.get("PREMIUM_TESTER_EMAILS") });
    return json({
      ...resolvePremiumAccess(records),
      releaseFlags: { bodyCompositionScan: BODY_COMPOSITION_SCAN_ENABLED }
    });

  } catch (error) {
    console.error("getPremiumAccess failed", safeErrorDetails(error));
    return json({ error: "Premium access could not be verified" }, { status: 502 });
  }
}
