import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLE_STORE_PRODUCTS,
  PREMIUM_FEATURES,
  PREMIUM_PRODUCTS,
  isAppleStoreProduct,
  mapAppleProductId,
  resolvePremiumAccess
} from "../../base44/shared/premiumDomain.js";
import { deriveAppleAppAccountToken } from "../../base44/shared/appleAppAccountToken.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-09-09T18:00:00.000Z");
const APP_STORE_BUNDLE_ID = "com.base6a68bb922bf88da5ec767da3.app";

test("monthly Apple StoreKit product maps to the recompone_premium entitlement", () => {
  assert.equal(
    mapAppleProductId(APPLE_STORE_PRODUCTS.MONTHLY),
    PREMIUM_PRODUCTS.BUNDLE
  );
  assert.equal(isAppleStoreProduct(APPLE_STORE_PRODUCTS.MONTHLY), true);
});

test("annual Apple StoreKit product maps to the recompone_premium entitlement", () => {
  assert.equal(APPLE_STORE_PRODUCTS.ANNUAL, "recompone_premium_annual");
  assert.equal(
    mapAppleProductId(APPLE_STORE_PRODUCTS.ANNUAL),
    PREMIUM_PRODUCTS.BUNDLE
  );
  assert.equal(isAppleStoreProduct(APPLE_STORE_PRODUCTS.ANNUAL), true);
});

test("unknown Apple product IDs are rejected", () => {
  assert.equal(mapAppleProductId("recompone_premium_lifetime"), null);
  assert.equal(mapAppleProductId(""), null);
  assert.equal(isAppleStoreProduct("recompone_premium_lifetime"), false);
  assert.equal(isAppleStoreProduct(""), false);
  // The internal bundle ID is not a valid Apple StoreKit product.
  assert.equal(isAppleStoreProduct(PREMIUM_PRODUCTS.BUNDLE), false);
});

test("an apple_store entitlement unlocks the full premium bundle", () => {
  const access = resolvePremiumAccess(
    [{ product_id: PREMIUM_PRODUCTS.BUNDLE, source: "apple_store", status: "active" }],
    NOW
  );
  assert.equal(access.hasAnyAccess, true);
  assert.equal(access.hasBundleAccess, true);
  assert.equal(access.testerAccess, false);
  assert.deepEqual(access.sources, ["apple_store"]);
  assert.equal(access.features[PREMIUM_FEATURES.MEAL_PLANNING], true);
  assert.equal(access.features[PREMIUM_FEATURES.TRAINING_PLANNING], true);
  assert.equal(access.features[PREMIUM_FEATURES.WEEKLY_AUTOPILOT], true);
  assert.equal(access.features[PREMIUM_FEATURES.VISUAL_PROGRESS], true);
  assert.equal(access.features[PREMIUM_FEATURES.AI_LIFESTYLE_COACH], true);
});

test("revoked and expired apple_store entitlements fail closed", () => {
  const revoked = resolvePremiumAccess(
    [{ product_id: PREMIUM_PRODUCTS.BUNDLE, source: "apple_store", status: "revoked" }],
    NOW
  );
  assert.equal(revoked.hasAnyAccess, false);

  const expired = resolvePremiumAccess(
    [{
      product_id: PREMIUM_PRODUCTS.BUNDLE,
      source: "apple_store",
      status: "active",
      expires_at: "2026-09-09T17:59:59.000Z"
    }],
    NOW
  );
  assert.equal(expired.hasAnyAccess, false);
});

test("verifyApplePurchase validates Apple product IDs, maps to the bundle, verifies the bundle ID, and fails closed", () => {
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/verifyApplePurchase/entry.ts"),
    "utf8"
  );

  // Uses isAppleStoreProduct for validation (not the old VALID_PRODUCT_IDS set).
  assert.match(source, /isAppleStoreProduct\(productId\)/);
  // Maps Apple product to internal entitlement product.
  assert.match(source, /mapAppleProductId\(productId\)/);
  // Verifies bundle ID from transaction info.
  assert.match(source, /APPLE_BUNDLE_ID/);
  assert.match(source, /transactionInfo\.bundleId/);
  // Missing configuration and missing bundle IDs must both fail closed.
  assert.match(source, /typeof expectedBundleId !== "string"/);
  assert.match(source, /transactionInfo\.bundleId !== expectedBundleId/);
  // Fails closed on invalid verification.
  assert.match(source, /Purchase is not active/);
  // Never trusts client-supplied user ID.
  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.doesNotMatch(source, /body\?\.userId|body\?\.owner_id/);
  // Never stores raw receipt or health data.
  assert.doesNotMatch(source, /receipt|health_data|email/i);
  // Writes entitlement with the mapped product, not the Apple product ID.
  assert.match(source, /product_id: entitlementProductId/);
  // Uses asServiceRole for entitlement writes.
  assert.match(source, /asServiceRole\.entities\.PremiumEntitlement/);
  // TestFlight transactions fall back to Apple's sandbox endpoint only after
  // the production lookup reports that the transaction was not found.
  assert.match(source, /api\.storekit\.itunes\.apple\.com/);
  assert.match(source, /api\.storekit-sandbox\.itunes\.apple\.com/);
  assert.match(source, /candidate\.status === 404/);
  // The verified subscription lineage is persisted and cross-account replay
  // is rejected through the signed app-account-token check below.
  assert.match(source, /external_transaction_id: verification\.originalTransactionId/);
  assert.match(source, /Purchase is already linked to another account/);
});

test("Apple transactions are cryptographically bound to the authenticated app account", () => {
  const verifier = readFileSync(
    resolve(repoRoot, "base44/functions/verifyApplePurchase/entry.ts"),
    "utf8"
  );
  const paywall = readFileSync(
    resolve(repoRoot, "src/components/premium/PremiumPaywall.jsx"),
    "utf8"
  );
  const protocol = readFileSync(
    resolve(repoRoot, "expo-ios/src/bridgeProtocol.ts"),
    "utf8"
  );
  const nativeShell = readFileSync(
    resolve(repoRoot, "expo-ios/src/RecompOneWebView.tsx"),
    "utf8"
  );

  // The client supplies a stable opaque UUID to StoreKit, but the server
  // independently derives the expected value from the authenticated user.
  assert.match(paywall, /deriveAppleAppAccountToken\(user\.id\)/);
  assert.match(paywall, /requestPurchase\(productId, appAccountToken\)/);
  assert.match(protocol, /appAccountToken: string/);
  assert.match(nativeShell, /appAccountToken: request\.appAccountToken/);
  assert.match(verifier, /deriveAppleAppAccountToken\(user\.id\)/);
  assert.match(verifier, /transactionInfo\.appAccountToken/);
  assert.match(verifier, /Purchase is already linked to another account/);
  // Ownership is established by Apple's signed account token, not a racy
  // filter-then-create scan over entitlement rows.
  assert.doesNotMatch(verifier, /transactionClaims/);
});

test("Apple app-account tokens are stable, pseudonymous UUIDs scoped per user", async () => {
  const first = await deriveAppleAppAccountToken("base44-user-a");
  const repeated = await deriveAppleAppAccountToken("base44-user-a");
  const second = await deriveAppleAppAccountToken("base44-user-b");

  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.doesNotMatch(first, /base44-user/);
  await assert.rejects(() => deriveAppleAppAccountToken(""));
});

test("the Expo shell and StoreKit account-token namespace match the existing App Store app", () => {
  const appConfig = JSON.parse(
    readFileSync(resolve(repoRoot, "expo-ios/app.json"), "utf8")
  );
  const accountTokenSource = readFileSync(
    resolve(repoRoot, "base44/shared/appleAppAccountToken.js"),
    "utf8"
  );

  assert.equal(appConfig.expo.ios.bundleIdentifier, APP_STORE_BUNDLE_ID);
  assert.equal(
    appConfig.expo.extra.eas.projectId,
    "df0b21a1-85f8-415f-9c8c-b465f7fbc1f0"
  );
  assert.match(accountTokenSource, new RegExp(`${APP_STORE_BUNDLE_ID.replaceAll(".", "\\.")}:storekit-account:v1:`));
});

test("appleStoreNotification matches by external_transaction_id and handles revoke, expire, and renew", () => {
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/appleStoreNotification/entry.ts"),
    "utf8"
  );

  // Verifies JWS signature before trusting the payload.
  assert.match(source, /verifyAppleNotificationJws/);
  // Validates the Apple product ID.
  assert.match(source, /isAppleStoreProduct\(productId\)/);
  // Maps the Apple product ID to the internal bundle entitlement.
  assert.match(source, /mapAppleProductId\(productId\)/);
  // Matches by external_transaction_id + internal product_id + apple_store source.
  assert.match(source, /external_transaction_id: originalTransactionId, product_id: entitlementProductId, source: "apple_store"/);
  assert.doesNotMatch(source, /product_id: productId, external_transaction_id/);
  // Handles revoke.
  assert.match(source, /REFUND.*REVOKE/);
  assert.match(source, /status: "revoked"/);
  // Handles expire.
  assert.match(source, /EXPIRED.*GRACE_PERIOD_EXPIRED/);
  assert.match(source, /status: "expired"/);
  // Handles renewal.
  assert.match(source, /DID_RENEW/);
  assert.match(source, /status: "active"/);
  // Idempotent: acknowledges even when no matching entitlement.
  assert.match(source, /return json\(\{ ok: true \}\)/);
});

test("appleStoreNotification rejects notifications with the wrong bundle ID and does not revoke on auto-renew off", () => {
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/appleStoreNotification/entry.ts"),
    "utf8"
  );

  // Verifies the signed transaction bundleId against the configured app.
  assert.match(source, /secrets\.get\("APPLE_BUNDLE_ID"\)/);
  assert.match(source, /typeof expectedBundleId !== "string"/);
  assert.match(source, /transactionInfo\.bundleId !== expectedBundleId/);
  // Acknowledges (does not process) when the bundle ID does not match.
  assert.match(source, /return json\(\{ ok: true \}\)/);
  // Only refunds/revocations revoke; only actual expiration expires.
  // Auto-renew being turned off does NOT revoke or expire access.
  assert.match(source, /REVOKE_TYPES = new Set\(\["REFUND", "REVOKE"\]\)/);
  assert.match(source, /EXPIRE_TYPES = new Set\(\["EXPIRED", "GRACE_PERIOD_EXPIRED"\]\)/);
});

test("the PremiumEntitlement entity accepts apple_store as a source with admin-only RLS", () => {
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "base44/entities/PremiumEntitlement.jsonc"), "utf8")
  );
  assert.ok(schema.properties.source.enum.includes("apple_store"));
  assert.ok(schema.properties.product_id.enum.includes("recompone_premium"));
  for (const action of ["create", "read", "update", "delete"]) {
    assert.deepEqual(schema.rls[action], { user_condition: { role: "admin" } });
  }
  // No health data, email, or receipt fields.
  assert.equal(Object.hasOwn(schema.properties, "email"), false);
  assert.equal(Object.hasOwn(schema.properties, "health_data"), false);
  assert.equal(Object.hasOwn(schema.properties, "receipt"), false);
});

test("the paywall verifies through the authenticated web client before finishing StoreKit", () => {
  const paywall = readFileSync(
    resolve(repoRoot, "src/components/premium/PremiumPaywall.jsx"),
    "utf8"
  );
  const bridge = readFileSync(
    resolve(repoRoot, "src/lib/nativeIapBridge.js"),
    "utf8"
  );

  // Paywall checks for a native IAP bridge.
  assert.match(paywall, /hasNativeIapBridge/);
  // Purchase and restore are disabled without the bridge.
  assert.match(paywall, /disabled=\{!bridgeAvailable/);
  // The signed-in web client verifies the transaction, keeping the Base44
  // access token out of the native shell.
  assert.match(paywall, /base44\.functions\.invoke\("verifyApplePurchase"/);
  // StoreKit is finished only after server verification returns.
  assert.match(paywall, /await base44\.functions\.invoke\([\s\S]*await bridge\.finishTransaction/);
  // Does not set local flags or simulate success.
  assert.doesNotMatch(paywall, /localStorage|hasAccess\s*=\s*true/);

  // A partial bridge cannot enable purchase controls.
  assert.match(bridge, /requestPurchase/);
  assert.match(bridge, /restorePurchases/);
  assert.match(bridge, /finishTransaction/);
  assert.match(bridge, /requestPurchase[\s\S]*&&[\s\S]*restorePurchases[\s\S]*&&[\s\S]*finishTransaction/);
});

test("the Expo shell strictly scopes bridge messages and native StoreKit products", () => {
  const protocol = readFileSync(
    resolve(repoRoot, "expo-ios/src/bridgeProtocol.ts"),
    "utf8"
  );
  const nativeShell = readFileSync(
    resolve(repoRoot, "expo-ios/src/RecompOneWebView.tsx"),
    "utf8"
  );
  const injectedBridge = readFileSync(
    resolve(repoRoot, "expo-ios/src/injectedBridge.ts"),
    "utf8"
  );

  assert.match(protocol, /https:\/\/recomp-iq\.base44\.app/);
  assert.match(protocol, /recompone_premium_monthly/);
  assert.match(protocol, /recompone_premium_annual/);
  assert.match(nativeShell, /isTrustedAppUrl\(event\.nativeEvent\.url/);
  assert.match(nativeShell, /requestPurchase\([\s\S]*type: "subs"/);
  assert.match(nativeShell, /getAvailablePurchases/);
  assert.match(nativeShell, /finishTransaction\(\{ purchase, isConsumable: false \}\)/);
  assert.doesNotMatch(nativeShell, /base44_access_token|Authorization|APPLE_PRIVATE_KEY/);
  assert.doesNotMatch(injectedBridge, /base44_access_token|Authorization|APPLE_PRIVATE_KEY/);
});

test("the Expo shell terminates a pending request on a mismatched StoreKit update", () => {
  const nativeShell = readFileSync(
    resolve(repoRoot, "expo-ios/src/RecompOneWebView.tsx"),
    "utf8"
  );

  assert.match(
    nativeShell,
    /result\.productId !== pending\.productId[\s\S]{0,500}pendingPurchaseRef\.current = null[\s\S]{0,500}ok: false/
  );
  assert.match(nativeShell, /Restore Purchases/);
  assert.doesNotMatch(nativeShell, /setTimeout\([\s\S]{0,100}120000/);
});
