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

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-09-09T18:00:00.000Z");

test("monthly Apple StoreKit product maps to the recompone_premium entitlement", () => {
  assert.equal(
    mapAppleProductId(APPLE_STORE_PRODUCTS.MONTHLY),
    PREMIUM_PRODUCTS.BUNDLE
  );
  assert.equal(isAppleStoreProduct(APPLE_STORE_PRODUCTS.MONTHLY), true);
});

test("annual Apple StoreKit product maps to the recompone_premium entitlement", () => {
  assert.equal(
    mapAppleProductId(APPLE_STORE_PRODUCTS.ANUAL),
    PREMIUM_PRODUCTS.BUNDLE
  );
  assert.equal(isAppleStoreProduct(APPLE_STORE_PRODUCTS.ANUAL), true);
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
  // Matches by external_transaction_id, not Apple product_id.
  assert.match(source, /external_transaction_id: originalTransactionId, source: "apple_store"/);
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

test("the paywall does not simulate purchases in the WebView and gates restore behind a native bridge", () => {
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
  // Does not call verifyApplePurchase directly from the client.
  assert.doesNotMatch(paywall, /verifyApplePurchase/);
  // Does not set local flags or simulate success.
  assert.doesNotMatch(paywall, /localStorage|hasAccess\s*=\s*true/);

  // Bridge detection checks for IAP-specific methods.
  assert.match(bridge, /requestPurchase/);
  assert.match(bridge, /restorePurchases/);
});