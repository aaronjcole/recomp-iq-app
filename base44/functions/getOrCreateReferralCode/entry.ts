import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { json, statusOf } from "../../shared/httpUtils.js";

// Ambiguous-character-free alphabet for readable codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_ATTEMPTS = 12;

function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("getOrCreateReferralCode auth check failed", error);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const existing = await base44.asServiceRole.entities.ReferralCode.filter(
      { owner_id: user.id },
      "-created_date",
      1
    );
    if (existing?.length) {
      return json({ code: existing[0].code });
    }

    let code = generateCode();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const collision = await base44.asServiceRole.entities.ReferralCode.filter(
        { code },
        "-created_date",
        1
      );
      if (!collision?.length) break;
      code = generateCode();
    }

    await base44.asServiceRole.entities.ReferralCode.create({
      owner_id: user.id,
      code
    });
    return json({ code });
  } catch (error) {
    console.error("getOrCreateReferralCode failed", error);
    return json({ error: "Could not create referral code" }, { status: 500 });
  }
}