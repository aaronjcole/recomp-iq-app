import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  BIOMETRIC_RANGES,
  inRange,
  inBiometricRange,
  optionalInBiometricRange
} from "../../src/lib/biometricRanges.js";
import { recalculateTargets } from "../../src/lib/fitness/recalculate.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

test("a blank value is never in range", () => {
  // Number("") === 0, so a blank input that reaches the profile save would be
  // stored as a real zero. Blank must fail the check, not coerce.
  for (const blank of ["", null, undefined]) {
    assert.equal(inRange(blank, 0, 100), false);
    assert.equal(inBiometricRange("current_weight_lbs", blank), false);
  }
  assert.equal(inRange("abc", 0, 100), false);
  assert.equal(inRange(Number.NaN, 0, 100), false);
});

test("bounds are inclusive and reject values outside them", () => {
  const [min, max] = BIOMETRIC_RANGES.age;
  assert.equal(inBiometricRange("age", min), true);
  assert.equal(inBiometricRange("age", max), true);
  assert.equal(inBiometricRange("age", min - 1), false);
  assert.equal(inBiometricRange("age", max + 1), false);
  assert.equal(inBiometricRange("age", 0), false);
});

test("an optional field accepts blank but still range-checks a filled value", () => {
  assert.equal(optionalInBiometricRange("goal_weight_lbs", ""), true);
  assert.equal(optionalInBiometricRange("goal_weight_lbs", null), true);
  assert.equal(optionalInBiometricRange("goal_weight_lbs", 170), true);
  assert.equal(optionalInBiometricRange("goal_weight_lbs", 18), false);
  assert.equal(optionalInBiometricRange("goal_weight_lbs", 99999), false);
});

test("the profile editor blocks the save that corrupted targets", () => {
  const source = read("src/pages/Profile.jsx");

  // A guard in the handler as well as on the button: the button alone can be
  // bypassed by a stale render, and this write recomputes the user's targets.
  assert.match(source, /if \(bioHasErrors\) return;/);
  assert.match(source, /disabled=\{bioSaving \|\| bioHasErrors\}/);
  assert.match(source, /from "@\/lib\/biometricRanges"/);

  // Every writable numeric field must be validated, not just the obvious ones.
  for (const field of [
    "age",
    "height_in",
    "current_weight_lbs",
    "goal_weight_lbs",
    "average_steps",
    "training_days_per_week",
    "cardio_days_per_week"
  ]) {
    assert.match(
      source,
      new RegExp(`${field}: !(?:optional)?[iI]nBiometricRange\\(\\s*"${field}"`),
      `${field} is writable in the profile editor but is not range-checked`
    );
  }
});

test("onboarding and the profile editor agree on every bound", () => {
  // Onboarding still carries its bounds inline. If either side moves without the
  // other, the profile editor starts accepting values onboarding rejects — which
  // is exactly how the 0 lb bodyweight save shipped.
  const onboarding = read("src/pages/Onboarding.jsx");
  const calls = [...onboarding.matchAll(/inRange\(p\.(\w+),\s*(\d+),\s*(\d+)\)/g)];
  assert.ok(calls.length >= 8, "expected onboarding to still range-check its biometric fields");

  for (const [, field, min, max] of calls) {
    const shared = BIOMETRIC_RANGES[field];
    assert.ok(shared, `onboarding gates ${field} but BIOMETRIC_RANGES has no entry for it`);
    assert.deepEqual(
      [Number(min), Number(max)],
      shared,
      `${field}: onboarding uses [${min}, ${max}] but BIOMETRIC_RANGES says [${shared}]`
    );
  }
});

test("values the editor now rejects would have produced unusable targets", () => {
  const valid = {
    sex: "male",
    age: 35,
    height_in: 70,
    current_weight_lbs: 185,
    goal_weight_lbs: 170,
    goal: "fat_loss",
    job_activity: "sedentary",
    average_steps: 6000,
    training_days_per_week: 3,
    cardio_days_per_week: 2
  };

  const baseline = recalculateTargets(valid, {});
  assert.ok(baseline.protein_target_g > 0, "sanity: a valid profile yields a real protein target");

  // A cleared weight field coerced to 0 and produced a 0 g protein target.
  const cleared = recalculateTargets({ ...valid, current_weight_lbs: 0 }, {});
  assert.equal(cleared.protein_target_g, 0);
  assert.equal(inBiometricRange("current_weight_lbs", 0), false, "so 0 must be rejected");

  // An absurd weight produced absurd targets and was equally saveable.
  const absurd = recalculateTargets({ ...valid, current_weight_lbs: 5000 }, {});
  assert.ok(absurd.calorie_target > 15000);
  assert.equal(inBiometricRange("current_weight_lbs", 5000), false, "so 5000 must be rejected");
});
