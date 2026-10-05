// Pure decisions for the App Store Server Notifications V2 webhook
// (base44/functions/appleStoreNotification). The entry verifies the JWS
// signatures and performs the reads and writes; everything that decides
// *whether* and *how* an entitlement changes lives here so it can be tested.

import { isAppleStoreProduct, mapAppleProductId } from "./premiumDomain.js";

// Apple notification types we act on. Turning auto-renew off does NOT
// revoke or expire access — the user keeps premium until the period ends
// and Apple sends EXPIRED. Only refunds/revocations revoke; only actual
// expiration expires.
export const REVOKE_TYPES = new Set(["REFUND", "REVOKE"]);
export const EXPIRE_TYPES = new Set(["EXPIRED", "GRACE_PERIOD_EXPIRED"]);

/**
 * The entitlement lookup a verified transaction is allowed to drive, or null
 * when the notification must only be acknowledged: no transaction ids, an
 * unknown Apple product, or a bundleId that does not match the configured app
 * (a missing or empty configuration never matches).
 */
export function appleNotificationTarget(transactionInfo, expectedBundleId) {
  if (!transactionInfo) return null;
  const productId = transactionInfo.productId;
  const originalTransactionId = transactionInfo.originalTransactionId;
  if (!productId || !originalTransactionId) return null;
  if (!isAppleStoreProduct(productId)) return null;

  // Verify the signed transaction bundleId matches the configured app to
  // prevent a legitimate Apple notification for a different app from
  // revoking or expiring entitlements here.
  if (
    typeof expectedBundleId !== "string" ||
    expectedBundleId.length === 0 ||
    transactionInfo.bundleId !== expectedBundleId
  ) {
    return null;
  }

  // Map the Apple StoreKit product to the internal recompone_premium
  // entitlement before locating the record.
  const entitlementProductId = mapAppleProductId(productId);
  if (!entitlementProductId) return null;

  // Match by external_transaction_id (Apple originalTransactionId), which is
  // stable across notifications. The entitlement product_id is the internal
  // recompone_premium ID, not the Apple StoreKit product ID.
  return {
    query: { external_transaction_id: originalTransactionId, product_id: entitlementProductId, source: "apple_store" },
    originalTransactionId,
    entitlementProductId
  };
}

/**
 * The PremiumEntitlement updates one notification causes, in record order,
 * as `{ id, data }`. Records that must not change are left out.
 *
 * Apple may deliver notifications late, retried, or out of order, and there
 * is no stored "last applied signedDate", so ordering is enforced through
 * expires_at: a renewal only ever moves expiry forward, and an expiration for
 * an older period than the one on record is ignored.
 */
export function planAppleNotificationUpdates(notificationType, transactionInfo, records) {
  const txnExpiresMs = Number(transactionInfo.expiresDate);
  const txnRevoked = Boolean(transactionInfo.revocationDate || transactionInfo.revocationReason);
  const updates = [];

  for (const record of records) {
    const recordExpiresMs = record.expires_at ? Date.parse(record.expires_at) : NaN;

    if (REVOKE_TYPES.has(notificationType)) {
      if (record.status === "revoked") continue;
      updates.push({ id: record.id, data: { status: "revoked" } });
    } else if (EXPIRE_TYPES.has(notificationType)) {
      // Never downgrade a revoked record, and ignore a stale EXPIRED for a
      // period that a later renewal has already superseded.
      if (record.status !== "active") continue;
      if (
        Number.isFinite(recordExpiresMs) &&
        Number.isFinite(txnExpiresMs) &&
        recordExpiresMs > txnExpiresMs
      ) continue;
      updates.push({ id: record.id, data: { status: "expired" } });
    } else if (notificationType === "DID_RENEW" && Number.isFinite(txnExpiresMs) && txnExpiresMs > 0) {
      // A refunded/revoked entitlement is never re-activated by a renewal
      // notification, and a revoked transaction never renews.
      if (record.status === "revoked" || txnRevoked) continue;
      // Only move expiry forward; an older (replayed or reordered) renewal
      // must not shorten access or flip an expired record back on.
      if (Number.isFinite(recordExpiresMs) && txnExpiresMs <= recordExpiresMs) continue;
      updates.push({
        id: record.id,
        data: { status: "active", expires_at: new Date(txnExpiresMs).toISOString() }
      });
    }
  }
  return updates;
}
