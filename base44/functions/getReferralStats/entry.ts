import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("getReferralStats auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const codes = await base44.asServiceRole.entities.ReferralCode.filter(
      { owner_id: user.id },
      "-created_date",
      1
    );
    const code = codes?.length ? codes[0].code : null;

    const referrals = await base44.asServiceRole.entities.Referral.filter(
      { referrer_id: user.id },
      "-created_date",
      100
    );
    const signups = referrals.length;
    const converted = referrals.filter(
      (r) => r.status === "converted" || r.status === "rewarded"
    ).length;
    const rewarded = referrals.filter((r) => r.status === "rewarded").length;

    return Response.json({ code, signups, converted, rewarded });
  } catch (error) {
    console.error("getReferralStats failed", error);
    return Response.json({ error: "Could not load referral stats" }, { status: 500 });
  }
}