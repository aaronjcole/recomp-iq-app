import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { deriveAppleAppAccountToken } from "../../shared/appleAppAccountToken.js";
import { appleEnvironmentDecision, mapAppleProductId, isAppleStoreProduct } from "../../shared/premiumDomain.js";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";
import {
  appAccountTokenMatches,
  appleEntitlementWrite,
  appleTransactionVerification,
  verifiedTransactionInfo
} from "../../shared/applePurchaseDomain.js";

// Required Base44 app Secrets (set before going live):
//   APPLE_BUNDLE_ID      — iOS app bundle ID configured in App Store Connect
//                           (com.base6a68bb922bf88da5ec767da3.app)
//   APPLE_PRIVATE_KEY    — contents of the Apple .p8 private key (PEM body,
//                           no BEGIN/END lines)
//   APPLE_ISSUER_ID      — App Store Connect API issuer ID
//   APPLE_KEY_ID         — App Store Connect API key ID tied to the .p8 key
//   APPLE_APP_ID         — numeric App Store Connect app ID (6803546092),
//                           if used by the implementation
//
// Optional:
//   APPLE_SANDBOX_ALLOWED_USER_IDS — comma-separated Base44 user ids that may
//                           get Premium from a sandbox (free) purchase:
//                           testers and the App Review demo account. Unset
//                           accepts every sandbox purchase, as before.
//
// This endpoint handles BOTH initial purchase verification AND restore.
// The native client calls it with { transactionId, productId } after any
// StoreKit purchase or restore completes. The server verifies the
// transaction with Apple's App Store Server API and upserts the
// entitlement idempotently.

function b64url(obj) {
  return btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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

// Fetches transaction info from the App Store Server API and verifies the signed payload.
// Returns the verified transaction fields needed for entitlement ownership.
// Docs: https://developer.apple.com/documentation/appstoreserverapi/get_transaction_info
async function verifyWithApple(transactionId, expectedProductId) {
  const jwt = await makeAppleServerJwt();
  const encodedTransactionId = encodeURIComponent(transactionId);
  const hosts = [
    "https://api.storekit.itunes.apple.com",
    "https://api.storekit-sandbox.itunes.apple.com"
  ];
  let res = null;
  let answeredBySandbox = false;

  // TestFlight and sandbox transactions are not visible at the production
  // endpoint. Apple recommends trying production first, then sandbox only when
  // the transaction is not found, so production purchases never depend on the
  // sandbox service.
  for (const host of hosts) {
    const candidate = await fetch(
      `${host}/inApps/v1/transactions/${encodedTransactionId}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
    if (candidate.status === 404) continue;
    res = candidate;
    answeredBySandbox = host.includes("storekit-sandbox");
    break;
  }

  if (!res) return { isValid: false, expiresAt: null, originalTransactionId: null, bundleId: null, appAccountToken: null, environment: null };
  if (!res.ok) throw new Error(`App Store Server API returned ${res.status}`);

  const body = await res.json();
  // Apple signs the transaction; verify the signature and certificate chain
  // before trusting any field in it. A failure throws, so the caller answers
  // 502 and never grants Premium.
  const transactionInfo = await verifiedTransactionInfo(body?.signedTransactionInfo);
  // Product, bundle ID, revocation and expiry checks fail closed in the
  // shared domain.
  return appleTransactionVerification(transactionInfo, {
    transactionId,
    expectedProductId,
    expectedBundleId: secrets.get("APPLE_BUNDLE_ID"),
    answeredBySandbox
  });
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

  // StoreKit signs appAccountToken into the transaction. Recompute the token
  // from the authenticated Base44 account and require an exact match. This is
  // the ownership authority: a transaction for one account cannot be replayed
  // onto another account, including during concurrent requests.
  const expectedAccountToken = await deriveAppleAppAccountToken(user.id);
  if (!appAccountTokenMatches(verification.appAccountToken, expectedAccountToken)) {
    return json({ error: "Purchase is already linked to another account" }, { status: 409 });
  }

  // A sandbox purchase costs nothing (TestFlight, sandbox Apple IDs), so it
  // only grants Premium to the accounts allowed to test with one.
  const environmentDecision = appleEnvironmentDecision({
    environment: verification.environment,
    userId: user.id,
    allowlistRaw: secrets.get("APPLE_SANDBOX_ALLOWED_USER_IDS")
  });
  if (environmentDecision.unconfigured) {
    console.warn("verifyApplePurchase accepted a sandbox purchase; APPLE_SANDBOX_ALLOWED_USER_IDS is not set", {
      userId: user.id
    });
  }
  if (!environmentDecision.allowed) {
    return json({ error: "Sandbox purchases are not accepted for this account" }, { status: 403 });
  }

  try {
    // Upsert: update an existing apple_store entitlement for this user+product, or create one.
    // This is idempotent — duplicate calls for the same transaction update the same record.
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: user.id, product_id: entitlementProductId, source: "apple_store" },
      "-created_date",
      1
    );

    const write = appleEntitlementWrite(existing, {
      ownerId: user.id,
      entitlementProductId,
      verification
    });
    if (write.op === "update") {
      await base44.asServiceRole.entities.PremiumEntitlement.update(write.id, write.data);
    } else {
      await base44.asServiceRole.entities.PremiumEntitlement.create(write.data);
    }

    return json({ ok: true, entitlementProductId });
  } catch (error) {
    console.error("verifyApplePurchase entitlement write failed", safeErrorDetails(error));
    return json({ error: "Could not record the entitlement" }, { status: 500 });
  }
}
