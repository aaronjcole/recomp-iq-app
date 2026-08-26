import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// App Store Server Notifications V2 webhook.
// Configure in App Store Connect to POST to:
//   https://recomp-iq.base44.app/functions/appleStoreNotification
//
// SECURITY: This scaffold decodes the JWS payload but does NOT yet verify the
// JWS signature or the x5c certificate chain against Apple Root CA G3. Add
// signature verification before relying on this in production — without it,
// any caller reaching the endpoint could revoke entitlements.

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function decodeJwsPayload(jws) {
  const parts = String(jws).split(".");
  if (parts.length < 2) throw new Error("Invalid JWS");
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

const REVOKE_TYPES = new Set(["REFUND", "REVOKE"]);
const EXPIRE_TYPES = new Set(["EXPIRED", "GRACE_PERIOD_EXPIRED"]);

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const base44 = createClientFromRequest(req);

  let raw;
  try {
    raw = await req.text();
  } catch {
    return json({ error: "Could not read request body" }, { status: 400 });
  }

  let notification;
  try {
    notification = decodeJwsPayload(raw);
  } catch {
    return json({ error: "Invalid notification payload" }, { status: 400 });
  }

  const notificationType = notification?.notificationType;
  const data = notification?.data || {};

  let transactionInfo = null;
  try {
    if (data.signedTransactionInfo) {
      transactionInfo = decodeJwsPayload(data.signedTransactionInfo);
    }
  } catch {
    transactionInfo = null;
  }

  // Nothing actionable without a transaction; acknowledge so Apple doesn't retry.
  if (!transactionInfo) return json({ ok: true });

  const productId = transactionInfo.productId;
  const originalTransactionId = transactionInfo.originalTransactionId;
  if (!productId || !originalTransactionId) return json({ ok: true });

  try {
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { product_id: productId, external_transaction_id: originalTransactionId, source: "apple_store" },
      "-created_date",
      50
    );

    if (!existing?.length) return json({ ok: true });

    for (const record of existing) {
      if (REVOKE_TYPES.has(notificationType)) {
        await base44.asServiceRole.entities.PremiumEntitlement.update(record.id, { status: "revoked" });
      } else if (EXPIRE_TYPES.has(notificationType)) {
        await base44.asServiceRole.entities.PremiumEntitlement.update(record.id, { status: "expired" });
      } else if (notificationType === "DID_RENEW" && transactionInfo.expiresDate) {
        const expiresAt = new Date(Number(transactionInfo.expiresDate)).toISOString();
        await base44.asServiceRole.entities.PremiumEntitlement.update(record.id, {
          status: "active",
          expires_at: expiresAt
        });
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error("appleStoreNotification processing failed", error?.message);
    return json({ error: "Could not process notification" }, { status: 500 });
  }
}