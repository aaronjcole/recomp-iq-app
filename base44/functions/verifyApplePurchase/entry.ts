import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { secrets } from 'base44:runtime';
import { mapAppleProductId, isAppleStoreProduct } from "../../shared/premiumDomain.js";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";

// Required Base44 app Secrets (set before going live):
//   APPLE_BUNDLE_ID      — iOS app bundle ID configured in App Store Connect
//                           (com.fitnesstrackerapps.recompone)
//   APPLE_PRIVATE_KEY    — contents of the Apple .p8 private key (PEM body,
//                           no BEGIN/END lines)
//   APPLE_ISSUER_ID      — App Store Connect API issuer ID
//   APPLE_KEY_ID         — App Store Connect API key ID tied to the .p8 key
//   APPLE_APP_ID         — numeric App Store Connect app ID (6803546092),
//                           if used by the implementation
//
// This endpoint handles BOTH initial purchase verification AND restore.
// The native client calls it with { transactionId, productId } after any
// StoreKit purchase or restore completes. The server verifies the
// transaction with Apple's App Store Server API and upserts the
// entitlement idempotently.

function b64url(obj) {
  return btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeJwsPayload(jws) {
  const parts = String(jws).split(".");
  if (parts.length < 2) throw new Error("Invalid JWS");
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64));
}

// Signs an App Store Server API JWT (ES256) using the Apple .p8 key.
// Docs: https://developer.apple.com/documentation/appstoreserverapi/generating_json_web_signatures_for_the_app_store_server_api
async function makeAppleServerJwt() {
  const issuerId = secrets.get("APPLE_ISSUER_ID");
  const keyId = secrets.get("APPLE_KEY_ID");
  const bundleId = secrets.get("APPLE_BUNDLE_ID");
  const privateKeyPem = secrets.get("APPLE_PRIVATE_KEY");
  if (!issuerId || !keyId || !bundleId || !privateKeyPem) {
    throw new Error("Apple App Store Server API credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: bundleId
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const pemBody = privateKeyPem
    .split("\n")
    .filter((line) => !line.startsWith("-----"))
    .join("");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign(
    "ECDSA",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${sigB64}`;
}

// Fetches transaction info from the App Store Server API and decodes the signed payload.
// Returns { isValid, expiresAt, originalTransactionId, bundleId }.
// Docs: https://developer.apple.com/documentation/appstoreserverapi/get_transaction_info
async function verifyWithApple(transactionId, expectedProductId) {
  const jwt = await makeAppleServerJwt();
  const url = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
  if (res.status === 404) return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null };
  if (!res.ok) throw new Error(`App Store Server API returned ${res.status}`);

  const body = await res.json();
  const transactionInfo = body?.signedTransactionInfo
    ? decodeJwsPayload(body.signedTransactionInfo)
    : null;
  if (!transactionInfo) return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null };

  // Verify the product ID matches what the client claims.
  if (transactionInfo.productId !== expectedProductId) {
    return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null };
  }

  // Verify the bundle ID matches the configured app to prevent cross-app replay.
  const expectedBundleId = secrets.get("APPLE_BUNDLE_ID");
  if (expectedBundleId && transactionInfo.bundleId && transactionInfo.bundleId !== expectedBundleId) {
    return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: transactionInfo.bundleId };
  }

  // Revocation indicates a refund or voided purchase.
  const revoked = Boolean(transactionInfo.revocationDate || transactionInfo.revocationReason);
  const expiresMs = transactionInfo.expiresDate ? Number(transactionInfo.expiresDate) : null;
  const expired = expiresMs !== null && Number.isFinite(expiresMs) && expiresMs <= Date.now();

  const isValid = !revoked && !expired;
  const expiresAt = expiresMs !== null && Number.isFinite(expiresMs)
    ? new Date(expiresMs).toISOString()
    : null;

  return {
    isValid,
    expiresAt,
    originalTransactionId: transactionInfo.originalTransactionId ?? transactionId,
    bundleId: transactionInfo.bundleId ?? null
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
    console.error("verifyApplePurchase auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  const MAX_BODY_BYTES = 4_000;
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";

  if (!transactionId) return json({ error: "transactionId is required" }, { status: 400 });
  // Only the two configured Apple StoreKit product IDs are accepted.
  if (!productId || !isAppleStoreProduct(productId)) {
    return json({ error: "productId is not recognized" }, { status: 400 });
  }

  // Map the Apple StoreKit product to the internal entitlement product.
  // Both recompone_premium_monthly and recompone_premium_annual map to recompone_premium.
  const entitlementProductId = mapAppleProductId(productId);

  let verification;
  try {
    verification = await verifyWithApple(transactionId, productId);
  } catch (error) {
    console.error("verifyApplePurchase Apple API failed", safeErrorDetails(error));
    return json({ error: "Could not verify the purchase with Apple" }, { status: 502 });
  }

  // Fail closed: an unavailable or failed validation must not unlock Premium.
  if (!verification.isValid) {
    return json({ error: "Purchase is not active" }, { status: 402 });
  }

  try {
    // Upsert: update an existing apple_store entitlement for this user+product, or create one.
    // This is idempotent — duplicate calls for the same transaction update the same record.
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: user.id, product_id: entitlementProductId, source: "apple_store" },
      "-created_date",
      1
    );

    if (existing?.length) {
      await base44.asServiceRole.entities.PremiumEntitlement.update(existing[0].id, {
        status: "active",
        expires_at: verification.expiresAt ?? undefined,
        external_transaction_id: verification.originalTransactionId ?? undefined
      });
    } else {
      await base44.asServiceRole.entities.PremiumEntitlement.create({
        owner_id: user.id,
        product_id: entitlementProductId,
        source: "apple_store",
        status: "active",
        ...(verification.expiresAt ? { expires_at: verification.expiresAt } : {}),
        ...(verification.originalTransactionId ? { external_transaction_id: verification.originalTransactionId } : {})
      });
    }

    return json({ ok: true, entitlementProductId });
  } catch (error) {
    console.error("verifyApplePurchase entitlement write failed", safeErrorDetails(error));
    return json({ error: "Could not record the entitlement" }, { status: 500 });
  }
}