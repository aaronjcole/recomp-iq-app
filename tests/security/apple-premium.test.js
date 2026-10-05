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
import {
  appAccountTokenMatches,
  appleEntitlementWrite,
  appleTransactionVerification
} from "../../base44/shared/applePurchaseDomain.js";
import {
  EXPIRE_TYPES,
  REVOKE_TYPES,
  appleNotificationTarget,
  planAppleNotificationUpdates
} from "../../base44/shared/appleNotificationDomain.js";

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

const BUNDLE = "com.example.recompone";
const PURCHASE_NOW = Date.parse("2026-09-09T18:00:00.000Z");
const signedTransaction = (overrides = {}) => ({
  productId: APPLE_STORE_PRODUCTS.MONTHLY,
  bundleId: BUNDLE,
  originalTransactionId: "orig-1",
  expiresDate: PURCHASE_NOW + 30 * 24 * 60 * 60 * 1000,
  appAccountToken: "token-a",
  environment: "Production",
  ...overrides
});
const verify = (transactionInfo, overrides = {}) => appleTransactionVerification(transactionInfo, {
  transactionId: "txn-1",
  expectedProductId: APPLE_STORE_PRODUCTS.MONTHLY,
  expectedBundleId: BUNDLE,
  nowMs: PURCHASE_NOW,
  ...overrides
});

test("an active, matching Apple transaction verifies with its lineage, expiry and environment", () => {
  assert.deepEqual(verify(signedTransaction()), {
    isValid: true,
    expiresAt: new Date(PURCHASE_NOW + 30 * 24 * 60 * 60 * 1000).toISOString(),
    originalTransactionId: "orig-1",
    bundleId: BUNDLE,
    appAccountToken: "token-a",
    environment: "Production"
  });
  // A transaction without an originalTransactionId falls back to the id the client sent.
  assert.equal(verify(signedTransaction({ originalTransactionId: undefined })).originalTransactionId, "txn-1");
  // A non-expiring transaction stays valid with no expiry.
  const lifetime = verify(signedTransaction({ expiresDate: undefined }));
  assert.equal(lifetime.isValid, true);
  assert.equal(lifetime.expiresAt, null);
  // The signed environment wins; the answering endpoint is only the fallback.
  assert.equal(verify(signedTransaction({ environment: "Sandbox" })).environment, "Sandbox");
  assert.equal(verify(signedTransaction({ environment: undefined }), { answeredBySandbox: true }).environment, "Sandbox");
  assert.equal(verify(signedTransaction({ environment: "" })).environment, "Production");
});

test("Apple transaction verification fails closed on product, bundle, revocation and expiry", () => {
  assert.equal(verify(null).isValid, false, "no signed transaction");
  assert.equal(
    verify(signedTransaction({ productId: APPLE_STORE_PRODUCTS.ANNUAL })).isValid,
    false,
    "the transaction must be for the product the client claimed"
  );
  for (const expectedBundleId of [undefined, null, "", 42, "com.other.app"]) {
    const result = verify(signedTransaction(), { expectedBundleId });
    assert.equal(result.isValid, false, `bundle ${String(expectedBundleId)}`);
    assert.equal(result.appAccountToken, null, "a cross-app transaction never carries an owner token");
  }
  assert.equal(verify(signedTransaction({ bundleId: undefined })).isValid, false, "a missing bundleId never matches");
  assert.equal(verify(signedTransaction({ bundleId: "" }), { expectedBundleId: "" }).isValid, false, "empty config and bundleId");
  assert.equal(verify(signedTransaction({ revocationDate: PURCHASE_NOW - 1 })).isValid, false, "refunded");
  assert.equal(verify(signedTransaction({ revocationReason: 1 })).isValid, false, "revoked");
  assert.equal(verify(signedTransaction({ expiresDate: PURCHASE_NOW })).isValid, false, "expired at now");
  assert.equal(verify(signedTransaction({ expiresDate: PURCHASE_NOW - 1 })).isValid, false, "expired");
  assert.equal(verify(signedTransaction({ expiresDate: PURCHASE_NOW + 1 })).isValid, true);
});

test("Apple transactions are bound to the authenticated account through the signed token", async () => {
  const mine = await deriveAppleAppAccountToken("base44-user-a");
  const theirs = await deriveAppleAppAccountToken("base44-user-b");
  assert.equal(appAccountTokenMatches(mine, mine), true);
  assert.equal(appAccountTokenMatches(mine.toUpperCase(), mine), true, "StoreKit may upper-case the UUID");
  assert.equal(appAccountTokenMatches(theirs, mine), false, "another account's purchase is refused");
  for (const missing of [null, undefined, "", 42, {}]) {
    assert.equal(appAccountTokenMatches(missing, mine), false, `token ${JSON.stringify(missing)}`);
  }
  // The verified token travels from the signed transaction, never from the request.
  assert.equal(verify(signedTransaction({ appAccountToken: mine })).appAccountToken, mine);
  assert.equal(verify(signedTransaction({ appAccountToken: undefined })).appAccountToken, null);
});

test("a verified purchase writes the internal bundle entitlement for the caller, idempotently", () => {
  const verification = verify(signedTransaction());
  const entitlementProductId = mapAppleProductId(APPLE_STORE_PRODUCTS.MONTHLY);
  assert.deepEqual(appleEntitlementWrite([], { ownerId: "user-1", entitlementProductId, verification }), {
    op: "create",
    data: {
      owner_id: "user-1",
      product_id: PREMIUM_PRODUCTS.BUNDLE,
      source: "apple_store",
      status: "active",
      expires_at: verification.expiresAt,
      external_transaction_id: "orig-1"
    }
  });
  assert.deepEqual(
    appleEntitlementWrite([{ id: "ent-new" }, { id: "ent-old" }], { ownerId: "user-1", entitlementProductId, verification }),
    {
      op: "update",
      id: "ent-new",
      data: { status: "active", expires_at: verification.expiresAt, external_transaction_id: "orig-1" }
    }
  );
  // A non-expiring purchase does not write an expiry.
  const lifetime = verify(signedTransaction({ expiresDate: undefined }));
  const created = appleEntitlementWrite(null, { ownerId: "user-1", entitlementProductId, verification: lifetime });
  assert.equal(Object.hasOwn(created.data, "expires_at"), false);
});

test("verifyApplePurchase wires the shared purchase decisions and never trusts the client", () => {
  // Wiring only: the decisions themselves are executed in the tests above.
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/verifyApplePurchase/entry.ts"),
    "utf8"
  );
  const domain = readFileSync(resolve(repoRoot, "base44/shared/applePurchaseDomain.js"), "utf8");

  assert.match(source, /isAppleStoreProduct\(productId\)/);
  assert.match(source, /mapAppleProductId\(productId\)/);
  assert.match(source, /appleTransactionVerification\(transactionInfo, \{[\s\S]*?expectedBundleId: secrets\.get\("APPLE_BUNDLE_ID"\)/);
  assert.match(source, /if \(!verification\.isValid\) \{\s*return json\(\{ error: "Purchase is not active" \}/);
  assert.match(source, /deriveAppleAppAccountToken\(user\.id\)/);
  assert.match(source, /appAccountTokenMatches\(verification\.appAccountToken, expectedAccountToken\)/);
  assert.match(source, /Purchase is already linked to another account/);
  assert.match(source, /appleEntitlementWrite\(existing, \{\s*ownerId: user\.id,/);
  assert.match(source, /asServiceRole\.entities\.PremiumEntitlement/);
  // Ownership is established by Apple's signed account token, not a racy
  // filter-then-create scan over entitlement rows.
  assert.doesNotMatch(source, /transactionClaims/);
  // Never trusts client-supplied user ID.
  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.doesNotMatch(source, /body\?\.userId|body\?\.owner_id/);
  // Never stores raw receipt or health data.
  assert.doesNotMatch(source + domain, /receipt|health_data|email/i);
  // TestFlight transactions fall back to Apple's sandbox endpoint only after
  // the production lookup reports that the transaction was not found.
  assert.match(source, /api\.storekit\.itunes\.apple\.com/);
  assert.match(source, /api\.storekit-sandbox\.itunes\.apple\.com/);
  assert.match(source, /candidate\.status === 404/);
});

test("the paywall and native shell pass the derived account token to StoreKit", () => {
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

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const notifiedTransaction = (overrides = {}) => ({
  productId: APPLE_STORE_PRODUCTS.ANNUAL,
  originalTransactionId: "orig-9",
  bundleId: APP_STORE_BUNDLE_ID,
  expiresDate: T0 + 30 * DAY_MS,
  ...overrides
});
const entitlementRow = (id, status, expiresMs) => ({
  id,
  status,
  ...(expiresMs === undefined ? {} : { expires_at: iso(expiresMs) })
});

test("appleStoreNotification looks up by original transaction, internal product and apple_store source", () => {
  assert.deepEqual(appleNotificationTarget(notifiedTransaction(), APP_STORE_BUNDLE_ID), {
    query: { external_transaction_id: "orig-9", product_id: PREMIUM_PRODUCTS.BUNDLE, source: "apple_store" },
    originalTransactionId: "orig-9",
    entitlementProductId: PREMIUM_PRODUCTS.BUNDLE
  });
});

test("appleStoreNotification ignores other apps, unknown products and incomplete transactions", () => {
  for (const expected of [undefined, null, "", 7]) {
    assert.equal(appleNotificationTarget(notifiedTransaction(), expected), null, `config ${String(expected)}`);
  }
  assert.equal(appleNotificationTarget(notifiedTransaction({ bundleId: "com.other.app" }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(notifiedTransaction({ bundleId: undefined }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(notifiedTransaction({ bundleId: "" }), ""), null, "an empty config never matches an empty bundleId");
  assert.equal(appleNotificationTarget(notifiedTransaction({ productId: "recompone_premium_lifetime" }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(notifiedTransaction({ productId: PREMIUM_PRODUCTS.BUNDLE }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(notifiedTransaction({ productId: "" }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(notifiedTransaction({ originalTransactionId: "" }), APP_STORE_BUNDLE_ID), null);
  assert.equal(appleNotificationTarget(null, APP_STORE_BUNDLE_ID), null);
});

test("refunds and revocations revoke every matching entitlement once", () => {
  const rows = [entitlementRow("a", "active", T0 + 30 * DAY_MS), entitlementRow("b", "expired"), entitlementRow("c", "revoked")];
  for (const type of ["REFUND", "REVOKE"]) {
    assert.deepEqual(planAppleNotificationUpdates(type, notifiedTransaction(), rows), [
      { id: "a", data: { status: "revoked" } },
      { id: "b", data: { status: "revoked" } }
    ], type);
  }
});

test("expiration expires only active records and ignores a stale period", () => {
  const txn = notifiedTransaction({ expiresDate: T0 + 30 * DAY_MS });
  for (const type of ["EXPIRED", "GRACE_PERIOD_EXPIRED"]) {
    assert.deepEqual(
      planAppleNotificationUpdates(type, txn, [
        entitlementRow("same-period", "active", T0 + 30 * DAY_MS),
        entitlementRow("no-expiry", "active"),
        entitlementRow("renewed-later", "active", T0 + 60 * DAY_MS),
        entitlementRow("revoked", "revoked", T0 + 30 * DAY_MS),
        entitlementRow("already-expired", "expired", T0)
      ]),
      [
        { id: "same-period", data: { status: "expired" } },
        { id: "no-expiry", data: { status: "expired" } }
      ],
      type
    );
  }
  // Without a usable transaction expiry the stale check cannot apply.
  assert.deepEqual(
    planAppleNotificationUpdates("EXPIRED", notifiedTransaction({ expiresDate: undefined }), [entitlementRow("x", "active", T0 + 60 * DAY_MS)]),
    [{ id: "x", data: { status: "expired" } }]
  );
});

test("a renewal only moves expiry forward and never re-activates a revoked entitlement", () => {
  const renewedTo = T0 + 60 * DAY_MS;
  const txn = notifiedTransaction({ expiresDate: renewedTo });
  assert.deepEqual(
    planAppleNotificationUpdates("DID_RENEW", txn, [
      entitlementRow("older", "active", T0 + 30 * DAY_MS),
      entitlementRow("lapsed", "expired", T0),
      entitlementRow("no-expiry", "active"),
      entitlementRow("same", "active", renewedTo),
      entitlementRow("newer", "active", T0 + 90 * DAY_MS),
      entitlementRow("refunded", "revoked", T0)
    ]),
    [
      { id: "older", data: { status: "active", expires_at: iso(renewedTo) } },
      { id: "lapsed", data: { status: "active", expires_at: iso(renewedTo) } },
      { id: "no-expiry", data: { status: "active", expires_at: iso(renewedTo) } }
    ]
  );
  // A revoked transaction never renews, and a renewal without a real expiry is ignored.
  const rows = [entitlementRow("older", "active", T0)];
  assert.deepEqual(planAppleNotificationUpdates("DID_RENEW", notifiedTransaction({ expiresDate: renewedTo, revocationDate: T0 }), rows), []);
  assert.deepEqual(planAppleNotificationUpdates("DID_RENEW", notifiedTransaction({ expiresDate: renewedTo, revocationReason: 1 }), rows), []);
  for (const expiresDate of [undefined, 0, -5, "soon"]) {
    assert.deepEqual(planAppleNotificationUpdates("DID_RENEW", notifiedTransaction({ expiresDate }), rows), [], String(expiresDate));
  }
});

test("turning auto-renew off and other notification types change nothing", () => {
  const rows = [entitlementRow("a", "active", T0 + 30 * DAY_MS)];
  for (const type of ["DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF", "DID_FAIL_TO_RENEW", "SUBSCRIBED", "TEST", undefined]) {
    assert.deepEqual(planAppleNotificationUpdates(type, notifiedTransaction(), rows), [], String(type));
  }
  assert.deepEqual([...REVOKE_TYPES].sort(), ["REFUND", "REVOKE"]);
  assert.deepEqual([...EXPIRE_TYPES].sort(), ["EXPIRED", "GRACE_PERIOD_EXPIRED"]);
});

test("appleStoreNotification verifies signatures and applies only the shared plan", () => {
  // Wiring only: the target and update rules are executed in the tests above.
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/appleStoreNotification/entry.ts"),
    "utf8"
  );
  const verifyAt = source.indexOf("await verifyAppleNotificationJws(raw)");
  const targetAt = source.indexOf('appleNotificationTarget(transactionInfo, secrets.get("APPLE_BUNDLE_ID"))');
  const lookupAt = source.indexOf("PremiumEntitlement.filter(\n      target.query,");
  const planAt = source.indexOf("planAppleNotificationUpdates(notificationType, transactionInfo, existing)");
  assert.ok(verifyAt > 0 && targetAt > verifyAt && lookupAt > targetAt && planAt > lookupAt);
  assert.match(source, /verifyInnerJws\(data\.signedTransactionInfo, leafKey\)/);
  // Idempotent: unmatched or unknown notifications are acknowledged, not retried.
  assert.match(source, /if \(!target\) return json\(\{ ok: true \}\)/);
  assert.match(source, /if \(!existing\?\.length\) return json\(\{ ok: true \}\)/);
  assert.match(source, /PremiumEntitlement\.update\(update\.id, update\.data\)/);
  // The only entitlement write is the planned update.
  assert.equal(source.match(/PremiumEntitlement\.(?:update|create|delete)\(/g).length, 1);
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
