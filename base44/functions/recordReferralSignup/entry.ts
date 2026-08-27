import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const MAX_REQUEST_BYTES = 4096;
const CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("recordReferralSignup auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const code = typeof body?.code === "string" ? body.code.trim() : "";
  // Invalid or unknown codes are silent no-ops so the signup flow never breaks.
  if (!CODE_PATTERN.test(code)) {
    return Response.json({ ok: true, recorded: false });
  }

  try {
    const codes = await base44.asServiceRole.entities.ReferralCode.filter(
      { code },
      "-created_date",
      1
    );
    if (!codes?.length) {
      return Response.json({ ok: true, recorded: false });
    }
    const referrerId = codes[0].owner_id;

    // Anti-abuse: a user cannot refer themselves.
    if (referrerId === user.id) {
      return Response.json({ ok: true, recorded: false });
    }

    // Idempotent: one referral record per referee.
    const existing = await base44.asServiceRole.entities.Referral.filter(
      { referee_id: user.id },
      "-created_date",
      1
    );
    if (existing?.length) {
      return Response.json({ ok: true, recorded: false });
    }

    await base44.asServiceRole.entities.Referral.create({
      referrer_id: referrerId,
      referee_id: user.id,
      code,
      status: "pending"
    });
    return Response.json({ ok: true, recorded: true });
  } catch (error) {
    console.error("recordReferralSignup failed", error);
    return Response.json({ error: "Could not record referral" }, { status: 500 });
  }
}