import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { verifyAppleNotificationJws, verifyInnerJws } from "../../shared/appleJwsVerify.js";
import { appleNotificationTarget, planAppleNotificationUpdates } from "../../shared/appleNotificationDomain.js";

// App Store Server Notifications V2 webhook.
// Configure in App Store Connect to POST to:
//   https://recomp-iq.base44.app/functions/appleStoreNotification
//
// The notification body and signedTransactionInfo are JWS signed by Apple
// with an x5c certificate chain that terminates at Apple Root CA G3.  Both
// the signature and the full certificate chain are verified before any
// entitlement update is applied — without this, any caller could craft a
// payload and revoke user entitlements.

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

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

  // Verify the JWS signature and certificate chain before trusting the payload.
  let notification;
  let leafKey;
  try {
    const verified = await verifyAppleNotificationJws(raw);
    notification = verified.payload;
    leafKey = verified.leafKey;
  } catch {
    return json({ error: "Notification signature verification failed" }, { status: 401 });
  }

  const notificationType = notification?.notificationType;
  const data = notification?.data || {};

  let transactionInfo = null;
  if (data.signedTransactionInfo) {
    try {
      transactionInfo = await verifyInnerJws(data.signedTransactionInfo, leafKey);
    } catch {
      return json({ error: "Transaction info signature verification failed" }, { status: 401 });
    }
  }

  // Nothing actionable without a transaction; acknowledge so Apple doesn't retry.
  if (!transactionInfo) return json({ ok: true });

  // Unknown products, missing ids, and a bundleId that does not match the
  // configured app (or a missing configuration) are acknowledged untouched.
  const target = appleNotificationTarget(transactionInfo, secrets.get("APPLE_BUNDLE_ID"));
  if (!target) return json({ ok: true });

  try {
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      target.query,
      "-created_date",
      50
    );

    if (!existing?.length) return json({ ok: true });

    // Revoke / expire / renew rules, including out-of-order and replayed
    // notifications, are decided in the shared domain.
    for (const update of planAppleNotificationUpdates(notificationType, transactionInfo, existing)) {
      await base44.asServiceRole.entities.PremiumEntitlement.update(update.id, update.data);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("appleStoreNotification processing failed", error?.message);
    return json({ error: "Could not process notification" }, { status: 500 });
  }
}
