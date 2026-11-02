import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { json, statusOf } from "../../shared/httpUtils.js";
import {
  isReferralCode,
  recordReferralAttribution,
  referralEligibility
} from "../../shared/referralDomain.js";

const MAX_REQUEST_BYTES = 4096;

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
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
    console.error("recordReferralSignup auth check failed", error);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code.trim() : "";
  // Invalid or unknown codes are silent no-ops so the signup flow never breaks.
  if (!isReferralCode(code)) {
    return json({ ok: true, recorded: false });
  }

  try {
    const codes = await base44.asServiceRole.entities.ReferralCode.filter(
      { code },
      "-created_date",
      1
    );
    if (!codes?.length) {
      return json({ ok: true, recorded: false });
    }
    const referrerId = codes[0].owner_id;

    // Anti-abuse: a user cannot refer themselves, and only an account created
    // within the attribution window counts as a referred signup.
    if (!referralEligibility(user, referrerId).eligible) {
      return json({ ok: true, recorded: false });
    }

    // One referral record per referee, enforced by rank-after-insert so
    // parallel calls cannot create several.
    const result = await recordReferralAttribution(
      base44.asServiceRole.entities.Referral,
      { referrerId, refereeId: user.id, code }
    );
    if (result.outcome === "retry") {
      // A same-instant parallel attribution; the client keeps the code and retries.
      return json({ error: "Referral is being recorded, try again" }, { status: 409 });
    }
    return json({ ok: true, recorded: result.recorded });
  } catch (error) {
    console.error("recordReferralSignup failed", error);
    return json({ error: "Could not record referral" }, { status: 500 });
  }
}