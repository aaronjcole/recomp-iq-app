import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_PREMIUM_ACCESS,
  PREMIUM_FEATURES,
  PREMIUM_PRODUCTS,
  resolvePremiumAccess
} from "../../base44/shared/premiumDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-08-03T18:00:00.000Z");

function entitlement(overrides = {}) {
  return {
    product_id: PREMIUM_PRODUCTS.BUNDLE,
    source: "google_play",
    status: "active",
    ...overrides
  };
}

test("the premium bundle grants every feature and identifies tester access", () => {
  const paid = resolvePremiumAccess([entitlement()], NOW);
  assert.equal(paid.hasAnyAccess, true);
  assert.equal(paid.hasBundleAccess, true);
  assert.equal(paid.testerAccess, false);
  assert.deepEqual(
    Object.fromEntries(Object.values(PREMIUM_FEATURES).map((feature) => [feature, paid.features[feature]])),
    Object.fromEntries(Object.values(PREMIUM_FEATURES).map((feature) => [feature, true]))
  );

  const tester = resolvePremiumAccess([entitlement({ source: "tester" })], NOW);
  assert.equal(tester.testerAccess, true);
  assert.deepEqual(tester.sources, ["tester"]);
});

test("individual products unlock only their mapped premium capability", () => {
  const access = resolvePremiumAccess([
    entitlement({ product_id: PREMIUM_PRODUCTS.MEAL_PLANNING }),
    entitlement({ product_id: PREMIUM_PRODUCTS.TRAINING_PLANNING })
  ], NOW);

  assert.equal(access.hasAnyAccess, true);
  assert.equal(access.hasBundleAccess, false);
  assert.equal(access.features[PREMIUM_FEATURES.MEAL_PLANNING], true);
  assert.equal(access.features[PREMIUM_FEATURES.TRAINING_PLANNING], true);
  assert.equal(access.features[PREMIUM_FEATURES.WEEKLY_AUTOPILOT], false);
  assert.equal(access.features[PREMIUM_FEATURES.VISUAL_PROGRESS], false);
});

test("revoked, expired, malformed, and unknown entitlements fail closed", () => {
  const access = resolvePremiumAccess([
    entitlement({ status: "revoked" }),
    entitlement({ expires_at: "2026-08-03T17:59:59.000Z" }),
    entitlement({ expires_at: "not-a-date" }),
    entitlement({ product_id: "unknown_product" }),
    null
  ], NOW);

  assert.deepEqual(access, EMPTY_PREMIUM_ACCESS);
  assert.equal(Object.isFrozen(access), true);
});

test("premium access is server-authorized, admin-owned, and removed with the account", () => {
  const server = readFileSync(
    resolve(repoRoot, "base44/functions/getPremiumAccess/entry.ts"),
    "utf8"
  );
  const deletion = readFileSync(
    resolve(repoRoot, "base44/functions/deleteAccount/entry.ts"),
    "utf8"
  );
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const flags = readFileSync(resolve(repoRoot, "src/lib/featureFlags.js"), "utf8");
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "base44/entities/PremiumEntitlement.jsonc"), "utf8")
  );

  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /owner_id:\s*ownerId/);
  assert.match(server, /listAllEntitlements\(base44, user\.id\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /const ENTITLEMENT_PAGE_SIZE = 500/);
  assert.match(server, /while \(true\)/);
  assert.match(server, /skip \+= page\.length/);
  assert.doesNotMatch(server, /PremiumEntitlement\.filter\([\s\S]*?\n\s*20\s*\n/);
  assert.match(deletion, /PremiumEntitlement\.deleteMany\(\{ owner_id: user\.id \}\)/);
  assert.match(app, /<PremiumAccessProvider>/);
  assert.match(app, /path=["']\/more\/premium["']/);
  assert.doesNotMatch(flags, /VITE_(?:ENABLE_)?(?:PREMIUM|TESTER|ENTITLEMENT)/i);

  for (const action of ["create", "read", "update", "delete"]) {
    assert.deepEqual(schema.rls[action], { user_condition: { role: "admin" } });
  }
  assert.equal(schema.properties.owner_id.maxLength, 128);
  assert.equal(Object.hasOwn(schema.properties, "email"), false);
  assert.equal(Object.hasOwn(schema.properties, "health_data"), false);
});
