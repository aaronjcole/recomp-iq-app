// Pure decisions for base44/functions/verifyApplePurchase. The entry signs the
// App Store Server API request, fetches the transaction and writes the
// entitlement; what counts as a valid, owned purchase and what gets written
// is decided here so it can be tested.

/**
 * Turns the decoded transaction Apple returned (or null) into the
 * verification result the entry acts on. Fails closed: a product other than
 * the one the client claimed, a bundleId other than the configured app (or a
 * missing configuration), a revocation, or an expiry at/before `nowMs` is
 * never valid.
 */
export function appleTransactionVerification(transactionInfo, {
  transactionId,
  expectedProductId,
  expectedBundleId,
  answeredBySandbox = false,
  nowMs = Date.now()
}) {
  if (!transactionInfo) return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null, appAccountToken: null };

  // Verify the product ID matches what the client claims.
  if (transactionInfo.productId !== expectedProductId) {
    return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null, appAccountToken: null };
  }

  // Verify the bundle ID matches the configured app to prevent cross-app replay.
  if (
    typeof expectedBundleId !== "string" ||
    expectedBundleId.length === 0 ||
    transactionInfo.bundleId !== expectedBundleId
  ) {
    return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: transactionInfo.bundleId, appAccountToken: null };
  }

  // Revocation indicates a refund or voided purchase.
  const revoked = Boolean(transactionInfo.revocationDate || transactionInfo.revocationReason);
  const expiresMs = transactionInfo.expiresDate ? Number(transactionInfo.expiresDate) : null;
  const expired = expiresMs !== null && Number.isFinite(expiresMs) && expiresMs <= nowMs;

  const isValid = !revoked && !expired;
  const expiresAt = expiresMs !== null && Number.isFinite(expiresMs)
    ? new Date(expiresMs).toISOString()
    : null;

  return {
    isValid,
    expiresAt,
    originalTransactionId: transactionInfo.originalTransactionId ?? transactionId,
    bundleId: transactionInfo.bundleId ?? null,
    appAccountToken: transactionInfo.appAccountToken ?? null,
    // Apple signs the environment into the transaction; the endpoint that
    // answered is the fallback if it is ever absent.
    environment: typeof transactionInfo.environment === "string" && transactionInfo.environment
      ? transactionInfo.environment
      : answeredBySandbox ? "Sandbox" : "Production"
  };
}

/**
 * StoreKit signs appAccountToken into the transaction; the expected token is
 * derived server-side from the authenticated account. Only an exact
 * (case-insensitive) string match proves the purchase belongs to the caller.
 */
export function appAccountTokenMatches(signedToken, expectedToken) {
  return typeof signedToken === "string" && signedToken.toLowerCase() === expectedToken;
}

/**
 * The idempotent entitlement write for a verified purchase: update the
 * caller's newest apple_store row for the internal product, or create one.
 * The owner always comes from the authenticated user and the product is the
 * internal entitlement id, never the Apple StoreKit id.
 */
export function appleEntitlementWrite(existing, { ownerId, entitlementProductId, verification }) {
  if (existing?.length) {
    return {
      op: "update",
      id: existing[0].id,
      data: {
        status: "active",
        expires_at: verification.expiresAt ?? undefined,
        external_transaction_id: verification.originalTransactionId ?? undefined
      }
    };
  }
  return {
    op: "create",
    data: {
      owner_id: ownerId,
      product_id: entitlementProductId,
      source: "apple_store",
      status: "active",
      ...(verification.expiresAt ? { expires_at: verification.expiresAt } : {}),
      ...(verification.originalTransactionId ? { external_transaction_id: verification.originalTransactionId } : {})
    }
  };
}
