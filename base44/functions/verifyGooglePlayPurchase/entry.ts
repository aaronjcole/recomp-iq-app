import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { PREMIUM_PRODUCTS } from "../../shared/premiumDomain.js";

// Required Base44 app Secrets (set before going live):
//   PLAY_PACKAGE_NAME         — your Android package name, e.g. com.recompone.app
//   GOOGLE_PLAY_SA_JSON       — full contents of your Google service account key file
//                               (JSON string). The account needs the Android Publisher
//                               API scope: https://www.googleapis.com/auth/androidpublisher

const PLAY_PACKAGE_NAME = Deno.env.get("PLAY_PACKAGE_NAME");
const GOOGLE_PLAY_SA_JSON = Deno.env.get("GOOGLE_PLAY_SA_JSON");
const VALID_PRODUCT_IDS = new Set(Object.values(PREMIUM_PRODUCTS));

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeErrorDetails(error) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}

// Exchanges a Google service account key for a short-lived OAuth2 bearer token.
// Uses the RS256 JWT flow documented at:
// https://developers.google.com/identity/protocols/oauth2/service-account#jwt-auth
async function getGoogleAccessToken(serviceAccountJson) {
  let sa;
  try {
    sa = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error("GOOGLE_PLAY_SA_JSON is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const header = { alg: "RS256", typ: "JWT" };
  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${encode(header)}.${encode(claim)}`;

  // Import the PEM private key for RSA signing. Strip header/footer lines and whitespace.
  const pemBody = sa.private_key
    .split("\n")
    .filter((line) => !line.startsWith("-----"))
    .join("");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signingInput)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!tokenRes.ok) throw new Error(`OAuth2 token exchange failed: ${tokenRes.status}`);
  const tokenBody = await tokenRes.json();
  return tokenBody.access_token;
}

// Verifies a Google Play purchase token against the Android Publisher API.
// Returns { isValid: boolean, expiresAt: string | null }.
//
// RecompOne's first commercial shape is a single one-time premium product. If you later
// add renewable subscriptions, add the subscriptionsv2 path and handle autoRenewing.
async function verifyWithGooglePlay(purchaseToken, productId) {
  if (!PLAY_PACKAGE_NAME) throw new Error("PLAY_PACKAGE_NAME is not configured");
  if (!GOOGLE_PLAY_SA_JSON) throw new Error("GOOGLE_PLAY_SA_JSON is not configured");

  const accessToken = await getGoogleAccessToken(GOOGLE_PLAY_SA_JSON);

  // One-time product (inapp) purchase verification.
  // Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(PLAY_PACKAGE_NAME)}/purchases/products/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (res.status === 404) return { isValid: false, expiresAt: null };
  if (!res.ok) throw new Error(`Android Publisher API returned ${res.status}`);

  const purchase = await res.json();
  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
  const isValid = purchase.purchaseState === 0;
  // One-time purchases don't expire; subscriptions would carry expiryTimeMillis.
  const expiresAt = purchase.expiryTimeMillis
    ? new Date(Number(purchase.expiryTimeMillis)).toISOString()
    : null;

  return { isValid, expiresAt };
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
    console.error("verifyGooglePlayPurchase auth check failed", safeErrorDetails(error));
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

  const purchaseToken = typeof body?.purchaseToken === "string" ? body.purchaseToken.trim() : "";
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";

  if (!purchaseToken) return json({ error: "purchaseToken is required" }, { status: 400 });
  if (!productId || !VALID_PRODUCT_IDS.has(productId)) {
    return json({ error: "productId is not recognized" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyWithGooglePlay(purchaseToken, productId);
  } catch (error) {
    console.error("verifyGooglePlayPurchase Play API failed", safeErrorDetails(error));
    return json({ error: "Could not verify the purchase with Google Play" }, { status: 502 });
  }

  if (!verification.isValid) {
    return json({ error: "Purchase is not active" }, { status: 402 });
  }

  try {
    // Upsert: update an existing google_play entitlement for this user+product, or create one.
    const existing = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: user.id, product_id: productId, source: "google_play" },
      "-created_date",
      1
    );

    if (existing?.length) {
      await base44.asServiceRole.entities.PremiumEntitlement.update(existing[0].id, {
        status: "active",
        expires_at: verification.expiresAt ?? undefined
      });
    } else {
      await base44.asServiceRole.entities.PremiumEntitlement.create({
        owner_id: user.id,
        product_id: productId,
        source: "google_play",
        status: "active",
        ...(verification.expiresAt ? { expires_at: verification.expiresAt } : {})
      });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("verifyGooglePlayPurchase entitlement write failed", safeErrorDetails(error));
    return json({ error: "Could not record the entitlement" }, { status: 500 });
  }
}
