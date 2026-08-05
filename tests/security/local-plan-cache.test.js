import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planCacheKeysForUser } from "../../src/lib/planCache.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

const LEGACY_KEYS = [
  "recompiq_mealplan_v1",
  "recompiq_groceries_v1",
  "recompiq_autopilot_v1"
];

test("cached plan output is scoped to one user id", () => {
  const keys = planCacheKeysForUser("user-a");
  assert.equal(keys.length, LEGACY_KEYS.length);

  for (const key of keys) {
    assert.ok(key.endsWith("_user-a"), `${key} must be scoped to the signed-in user`);
    assert.ok(
      !LEGACY_KEYS.includes(key),
      `${key} must not collide with the unscoped key shared by every account`
    );
  }

  // Two accounts on the same device must never resolve to the same storage key,
  // or one user's plan and targets render as the other user's.
  const other = planCacheKeysForUser("user-b");
  for (const key of keys) {
    assert.ok(!other.includes(key), `${key} leaked across accounts`);
  }
});

test("premium plan pages never read or write an unscoped cache key", () => {
  for (const page of ["src/pages/AdaptiveMealPlan.jsx", "src/pages/WeeklyAutopilot.jsx"]) {
    const source = read(page);
    assert.ok(
      !source.includes("localStorage"),
      `${page} must go through src/lib/planCache.js so keys stay user-scoped`
    );
    assert.match(
      source,
      /from "@\/lib\/planCache"/,
      `${page} must import the user-scoped plan cache helpers`
    );
    assert.match(
      source,
      /dropLegacyPlanCache/,
      `${page} must drop the unattributable legacy keys left by the first build`
    );
  }
});

test("account deletion purges the locally cached plan output", () => {
  const source = read("src/pages/Profile.jsx");
  assert.match(
    source,
    /\.\.\.planCacheKeysForUser\(me\.id\)/,
    "deleteAccount must remove this user's cached meal plan, grocery ticks and weekly review"
  );
});

test("a biometrics edit preserves manually authored targets", () => {
  const source = read("src/pages/Profile.jsx");

  // Manual mode means the user typed these numbers themselves in
  // CustomTargetsCard; recalculating from biometrics must not overwrite them.
  assert.match(source, /const manual = Boolean\(strategy\?\.manual_override\)/);
  assert.match(source, /if \(manual\) \{\s*for \(const key of MANUAL_TARGET_KEYS\) delete strat\[key\]/);

  for (const key of [
    "calorie_target",
    "protein_target_g",
    "carb_target_g",
    "fat_target_g",
    "step_target"
  ]) {
    assert.ok(
      source.includes(`"${key}"`),
      `${key} is user-authorable, so it must be listed in MANUAL_TARGET_KEYS`
    );
  }
});

test("a failed weekly review refresh keeps the review already on screen", () => {
  const source = read("src/pages/WeeklyAutopilot.jsx");
  assert.ok(
    !source.includes("setReview(null)"),
    "clearing the review before the request blanks it when the request fails"
  );
});

test("every onboarding field that gates step two carries an error ring", () => {
  const step = read("src/components/onboarding/StepAbout.jsx");

  // A gated field with no ring is a dead end: Continue refuses and nothing on
  // the page shows the user which value is the blocker.
  for (const field of [
    "p.age",
    "p.sex",
    "p.height_in",
    "p.current_weight_lbs",
    "p.goal_weight_lbs",
    "p.waist_in"
  ]) {
    const ringed = step
      .split("\n")
      .some((line) => line.includes("ring-destructive") && line.includes(field));
    assert.ok(ringed, `${field} gates step two but has no showErrors ring`);
  }
});
