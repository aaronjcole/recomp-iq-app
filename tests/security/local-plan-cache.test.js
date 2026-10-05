import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planCacheKeysForUser } from "../../src/lib/planCache.js";
import {
  MANUAL_TARGET_KEYS,
  recalculateTargets,
  recalculatedStrategyUpdate
} from "../../src/lib/fitness/recalculate.js";

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

test("a biometrics or goal edit preserves manually authored targets", () => {
  const profile = {
    sex: "male",
    age: 35,
    height_in: 70,
    current_weight_lbs: 185,
    job_activity: "sedentary",
    average_steps: 6000,
    training_days_per_week: 3,
    cardio_days_per_week: 2
  };
  const recalculated = recalculatedStrategyUpdate(profile, null, { goal: "fat_loss", manualOverride: false });
  for (const key of MANUAL_TARGET_KEYS) {
    assert.equal(typeof recalculated[key], "number", `${key} is recalculated outside manual mode`);
  }
  assert.equal(recalculated.goal_type, "fat_loss");
  assert.deepEqual(recalculated, { ...recalculateTargets({ ...profile, goal: "fat_loss" }, {}), goal_type: "fat_loss" });

  // Manual mode means the user typed these numbers themselves in
  // CustomTargetsCard; the patch must not carry a value for any of them, so
  // the stored ones survive the update.
  const manual = recalculatedStrategyUpdate(profile, {}, { goal: "lean_bulk", manualOverride: true });
  assert.deepEqual(
    [...MANUAL_TARGET_KEYS].sort(),
    ["calorie_target", "carb_target_g", "fat_target_g", "protein_target_g", "step_target"]
  );
  for (const key of MANUAL_TARGET_KEYS) assert.equal(Object.hasOwn(manual, key), false, key);
  assert.equal(manual.goal_type, "lean_bulk");
  assert.equal(manual.lifting_days_target, recalculated.lifting_days_target, "non-authored targets still update");

  // Wiring: both Profile edit paths write this patch with the strategy's flag.
  const source = read("src/pages/Profile.jsx");
  assert.match(source, /const manual = Boolean\(strategy\?\.manual_override\)/);
  assert.equal(
    source.match(/recalculatedStrategyUpdate\(updated, preferences, \{ goal: (?:profile\.goal|newGoal), manualOverride: manual \}\)/g)?.length,
    2
  );
  assert.doesNotMatch(source, /recalculateTargets\(/, "no Profile path recalculates targets without the manual guard");
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
