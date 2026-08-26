import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { secrets } from 'base44:runtime';
import { PREMIUM_PRODUCTS } from "../../shared/premiumDomain.js";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";

// Required Base44 app Secrets (set before going live):
//   APPLE_ISSUER_ID      — App Store Connect API issuer ID
//   APPLE_KEY_ID         — App Store Connect API key ID tied to the .p8 private key
//   APPLE_BUNDLE_ID      — iOS app bundle ID configured in App Store Connect
//   APPLE_PRIVATE_KEY    — contents of the Apple .p8 private key (PEM body, no header/footer)

const VALID_PRODUCT_IDS = new Set(Object.values(PREMIUM_PRODUCTS));

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
// Returns { isValid, expiresAt, originalTransactionId }.
// Docs: https://developer.apple.com/documentation/appstoreserverapi/get_transaction_info
async function verifyWithApple(transactionId, expectedProductId) {
  const jwt = await makeAppleServerJwt();
  const url = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
  if (res.status === 404) return { isValid: false, expiresAt: null, originalTransactionId: null };
  if (!res.ok) throw new Error(`App Store Server API returned ${res.status}`);

  const body = await res.json();
  const transactionInfo = body?.signedTransactionInfo
    ? decodeJwsPayload(body.signedTransactionInfo)
    : null;
  if (!transactionInfo) return { isValid: false, expiresAt: null, originalTransactionId: null };

  if (transactionInfo.productId !== expectedProductId) {
    return { isValid: false, expiresAt: null, originalTransactionId: null };
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
    originalTransactionId: transactionInfo.originalTransactionId ?? transactionId
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
  if (!productId || !VALID_PRODUCT_IDS.has(productId)) {
    return json({ error: "productId is not recognized" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyWithApple(transactionId, productId);
  } catch (error) {
    console.error("verifyApplePurchase Apple API failed", safeErrorDetails(error));
    return json({ error: "Could not verify the purchase with Apple" }, { status: 502 });
  }

  if (!verification.isValid) {
    return json({ error: "Purchase is not active" }, { status: 402 });
  }

  try {
    // Upsert: update an existing apple_store entitlement for this user+product, or create one.
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: user.id, product_id: productId, source: "apple_store" },
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
        product_id: productId,
        source: "apple_store",
        status: "active",
        ...(verification.expiresAt ? { expires_at: verification.expiresAt } : {}),
        ...(verification.originalTransactionId ? { external_transaction_id: verification.originalTransactionId } : {})
      });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("verifyApplePurchase entitlement write failed", safeErrorDetails(error));
    return json({ error: "Could not record the entitlement" }, { status: 500 });
  }
}