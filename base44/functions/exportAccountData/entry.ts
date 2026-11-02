import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";
import { collectAccountExport } from "../../shared/accountExportDomain.js";

// Returns everything RecompOne stores for the signed-in account, as JSON:
// exactly the records the deleteAccount cascade removes (see
// base44/shared/accountExportDomain.js). The service role is needed for the
// server-owned entities (entitlements, referrals, usage), and every query is
// bound to the authenticated user's id or email by accountDeletionPlan.

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
    console.error("exportAccountData auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    return json(await collectAccountExport(base44.asServiceRole.entities, user));
  } catch (error) {
    console.error("exportAccountData failed", { userId: user.id, ...safeErrorDetails(error) });
    return json({ error: "Your export could not be prepared. Try again." }, { status: 500 });
  }
}
