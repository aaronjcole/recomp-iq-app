import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_PREMIUM_ACCESS,
  PREMIUM_FEATURES,
  PREMIUM_PRODUCTS,
  resolvePremiumAccess
} from "../../base44/shared/premiumDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-01-01T00:00:00.000Z");

const server = readFileSync(
  resolve(repoRoot, "base44/functions/analyzeFoodPhoto/entry.ts"),
  "utf8"
);

/**
 * analyzeFoodPhoto runs a credit-consuming vision model. It was authenticated
 * and quota-limited but had no entitlement check, so any signed-in account
 * could spend inference credits up to its own quota.
 *
 * Presence of a gate is not the invariant worth testing — placement is. A
 * check that runs after reserveFeatureRequest still bills the request, and one
 * after CreateFileSignedUrl has already minted a link to the user's photo.
 * These tests pin the ordering.
 */

// --- Domain -----------------------------------------------------------------

test("food photo is locked by default", () => {
  assert.equal(EMPTY_PREMIUM_ACCESS.features[PREMIUM_FEATURES.FOOD_PHOTO], false);
  assert.equal(resolvePremiumAccess([], NOW).features[PREMIUM_FEATURES.FOOD_PHOTO], false);
  assert.equal(resolvePremiumAccess(null, NOW).features[PREMIUM_FEATURES.FOOD_PHOTO], false);
});

test("the premium bundle unlocks food photo estimates", () => {
  for (const source of ["apple_store", "google_play", "tester", "admin"]) {
    const access = resolvePremiumAccess(
      [{ product_id: PREMIUM_PRODUCTS.BUNDLE, source, status: "active" }],
      NOW
    );
    assert.equal(
      access.features[PREMIUM_FEATURES.FOOD_PHOTO],
      true,
      `${source} bundle should unlock food photo`
    );
  }
});

test("a standalone add-on never unlocks food photo estimates", () => {
  // There is no standalone food-photo product, so an add-on holder must not
  // reach the vision call. If a FOOD_PHOTO product is ever introduced, this
  // assertion is the one that should be revisited deliberately.
  const addOns = [
    PREMIUM_PRODUCTS.MEAL_PLANNING,
    PREMIUM_PRODUCTS.TRAINING_PLANNING,
    PREMIUM_PRODUCTS.WEEKLY_AUTOPILOT,
    PREMIUM_PRODUCTS.VISUAL_PROGRESS,
    PREMIUM_PRODUCTS.AI_LIFESTYLE_COACH
  ];
  for (const product of addOns) {
    const access = resolvePremiumAccess(
      [{ product_id: product, source: "apple_store", status: "active" }],
      NOW
    );
    assert.equal(access.hasAnyAccess, true, `${product} should grant its own feature`);
    assert.equal(
      access.features[PREMIUM_FEATURES.FOOD_PHOTO],
      false,
      `${product} must not unlock food photo`
    );
  }
});

test("revoked and expired entitlements fail closed for food photo", () => {
  for (const record of [
    { product_id: PREMIUM_PRODUCTS.BUNDLE, source: "apple_store", status: "revoked" },
    { product_id: PREMIUM_PRODUCTS.BUNDLE, source: "apple_store", status: "expired" },
    {
      product_id: PREMIUM_PRODUCTS.BUNDLE,
      source: "apple_store",
      status: "active",
      expires_at: "2025-12-31T00:00:00.000Z"
    }
  ]) {
    const access = resolvePremiumAccess([record], NOW);
    assert.equal(access.features[PREMIUM_FEATURES.FOOD_PHOTO], false);
  }
});

// --- Server gate ------------------------------------------------------------

test("analyzeFoodPhoto requires the food photo entitlement", () => {
  assert.match(server, /PREMIUM_FEATURES\.FOOD_PHOTO/);
  assert.match(server, /resolvePremiumAccess\(/);
  assert.match(server, /status:\s*403/);
});

test("the entitlement gate runs before quota, signed link and inference", () => {
  const gate = server.indexOf("PREMIUM_FEATURES.FOOD_PHOTO");
  const quota = server.indexOf("reserveFeatureRequest(");
  const signedUrl = server.indexOf("CreateFileSignedUrl");
  const llm = server.indexOf("InvokeLLM");

  assert.ok(gate > 0, "entitlement gate is present");
  assert.ok(quota > 0, "quota reservation is present");
  assert.ok(signedUrl > 0, "signed URL creation is present");
  assert.ok(llm > 0, "vision call is present");

  // reserveFeatureRequest also appears in the import block, so compare against
  // the call site rather than the first occurrence of the identifier.
  assert.ok(gate < quota, "gate must precede the quota reservation");
  assert.ok(gate < signedUrl, "gate must precede creating a link to the photo");
  assert.ok(gate < llm, "gate must precede paid inference");
});

test("the 403 reaches the user through the message field", () => {
  // Base44Error.message = data.message || data.detail || error.message — the
  // SDK never reads data.error, so a refusal sent only under "error" surfaces
  // as a generic failure in FoodPhotoScan's catch block.
  const gateBlock = server.slice(
    server.indexOf("PREMIUM_FEATURES.FOOD_PHOTO"),
    server.indexOf("reserveFeatureRequest(", server.indexOf("PREMIUM_FEATURES.FOOD_PHOTO"))
  );
  assert.match(gateBlock, /message:/, "403 body must carry a message field");
  assert.match(gateBlock, /error:/, "403 body must keep the error field");
});

test("entitlement reads fail closed rather than unlocking", () => {
  // listAllEntitlements throws on a malformed or over-long response instead of
  // returning a partial list, and the surrounding try/catch returns a failure
  // status. A truncated read must never look like "no gate needed".
  const loader = readFileSync(
    resolve(repoRoot, "base44/shared/entitlementAccess.js"),
    "utf8"
  );
  assert.match(loader, /throw new Error\("Invalid entitlement response"\)/);
  assert.match(loader, /throw new Error\("Entitlement response exceeded the safe record limit"\)/);
  assert.match(loader, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  // Owner scoping comes from the authenticated user, never the request body.
  assert.match(server, /listAllEntitlements\(base44,\s*user\.id\)/);
  assert.doesNotMatch(server, /listAllEntitlements\(base44,\s*body/);
});

// --- Client -----------------------------------------------------------------

test("the Fuel tab hides the photo trigger without the entitlement", () => {
  // Server-side is the authority, but an unentitled user should not upload a
  // photo to private storage only to be refused afterwards.
  const nutrition = readFileSync(resolve(repoRoot, "src/pages/Nutrition.jsx"), "utf8");
  assert.match(nutrition, /canAccess\(PREMIUM_FEATURES\.FOOD_PHOTO\)/);
  assert.match(nutrition, /featureFlags\.foodPhotoScan\s*&&\s*canUsePhotoScan/);
  // The build-time flag stays in front of the entitlement check: enabling
  // premium must not turn on a data flow the deployment has not accepted.
  assert.doesNotMatch(nutrition, /canUsePhotoScan\s*&&\s*featureFlags\.foodPhotoScan/);
});
