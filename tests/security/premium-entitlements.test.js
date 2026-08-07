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

test("the premium bundle grants tier-2 features and identifies tester access", () => {
  const paid = resolvePremiumAccess([entitlement()], NOW);
  assert.equal(paid.hasAnyAccess, true);
  assert.equal(paid.hasBundleAccess, true);
  assert.equal(paid.testerAccess, false);
  // The bundle covers tier-2 features; ai_lifestyle_coach is a standalone tier-3 product.
  assert.equal(paid.features[PREMIUM_FEATURES.MEAL_PLANNING], true);
  assert.equal(paid.features[PREMIUM_FEATURES.TRAINING_PLANNING], true);
  assert.equal(paid.features[PREMIUM_FEATURES.WEEKLY_AUTOPILOT], true);
  assert.equal(paid.features[PREMIUM_FEATURES.VISUAL_PROGRESS], true);
  assert.equal(paid.features[PREMIUM_FEATURES.AI_LIFESTYLE_COACH], false);

  const tester = resolvePremiumAccess([entitlement({ source: "tester" })], NOW);
  assert.equal(tester.testerAccess, true);
  assert.deepEqual(tester.sources, ["tester"]);
});

test("the lifestyle coach product grants all features including bundle features", () => {
  const coach = resolvePremiumAccess(
    [entitlement({ product_id: PREMIUM_PRODUCTS.AI_LIFESTYLE_COACH })],
    NOW
  );
  assert.equal(coach.hasAnyAccess, true);
  assert.equal(coach.features[PREMIUM_FEATURES.AI_LIFESTYLE_COACH], true);
  assert.equal(coach.features[PREMIUM_FEATURES.MEAL_PLANNING], true);
  assert.equal(coach.features[PREMIUM_FEATURES.TRAINING_PLANNING], true);
  assert.equal(coach.features[PREMIUM_FEATURES.WEEKLY_AUTOPILOT], true);
  assert.equal(coach.features[PREMIUM_FEATURES.VISUAL_PROGRESS], true);
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
  assert.deepEqual(access.releaseFlags, { bodyCompositionScan: false });
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
  assert.match(server, /Deno\.env\.get\(["']ENABLE_BODY_COMPOSITION_SCAN["']\)/);
  assert.match(server, /releaseFlags:\s*\{[\s\S]*bodyCompositionScan/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /const ENTITLEMENT_PAGE_SIZE = 500/);
  assert.match(server, /const MAX_ENTITLEMENT_RECORDS = 1_000/);
  assert.match(server, /while \(records\.length < MAX_ENTITLEMENT_RECORDS\)/);
  assert.match(server, /skip \+= page\.length/);
  assert.doesNotMatch(server, /while \(true\)/);
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
