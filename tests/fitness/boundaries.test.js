import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  calculateCalorieTarget,
  calculateInitialStrategy,
  calculateMacroTargets
} from "../../src/lib/fitness/calculators.js";
import { GOALS, JOB_ACTIVITIES } from "../../src/lib/fitness/constants.js";

function readEntitySchema(name) {
  return JSON.parse(
    readFileSync(new URL(`../../base44/entities/${name}.jsonc`, import.meta.url), "utf8")
  );
}

const strategyProperties = readEntitySchema("CurrentStrategy").properties;
const profileProperties = readEntitySchema("UserProfile").properties;

function assertWithinSchema(value, propertyName) {
  const property = strategyProperties[propertyName];
  assert.ok(Number.isFinite(value), `${propertyName} must be finite; received ${value}`);
  assert.ok(value >= property.minimum, `${propertyName} must be >= ${property.minimum}; received ${value}`);
  assert.ok(value <= property.maximum, `${propertyName} must be <= ${property.maximum}; received ${value}`);
}

const extremeProfiles = [
  {
    name: "smallest low-activity profile",
    profile: {
      sex: "female",
      current_weight_lbs: 40,
      goal_weight_lbs: 40,
      height_in: 36,
      age: 120,
      job_activity: "sedentary",
      average_steps: 0
    }
  },
  {
    name: "largest high-activity profile",
    profile: {
      sex: "male",
      current_weight_lbs: 1200,
      goal_weight_lbs: 1200,
      height_in: 108,
      age: 18,
      job_activity: "extremely_active",
      average_steps: 200000
    }
  }
];

test("fitness constants stay aligned with the persisted profile enums", () => {
  assert.deepEqual([...GOALS].sort(), [...profileProperties.goal.enum].sort());
  assert.deepEqual([...JOB_ACTIVITIES].sort(), [...profileProperties.job_activity.enum].sort());
});

test("every goal produces finite, schema-bounded targets for valid extreme profiles", () => {
  for (const { name, profile } of extremeProfiles) {
    for (const goal of GOALS) {
      const result = calculateInitialStrategy({ ...profile, goal });
      assert.ok(result.bmr_estimate >= 0, `${name}/${goal} returned a negative BMR`);
      assert.ok(result.tdee_estimate >= 0, `${name}/${goal} returned a negative TDEE`);
      assertWithinSchema(result.calorie_target, "calorie_target");
      assertWithinSchema(result.protein_target_g, "protein_target_g");
      assertWithinSchema(result.fat_target_g, "fat_target_g");
      assertWithinSchema(result.carb_target_g, "carb_target_g");
      assertWithinSchema(result.step_target, "step_target");
    }
  }
});

test("public calorie and macro calculators respect persisted strategy bounds", () => {
  assert.equal(calculateCalorieTarget(30000, "aggressive_gain"), strategyProperties.calorie_target.maximum);

  const macros = calculateMacroTargets({
    calories: strategyProperties.calorie_target.maximum,
    current_weight_lbs: 1200,
    goal_weight_lbs: 1200
  });
  assertWithinSchema(macros.protein_target_g, "protein_target_g");
  assertWithinSchema(macros.fat_target_g, "fat_target_g");
  assertWithinSchema(macros.carb_target_g, "carb_target_g");
  const macroCalories =
    macros.protein_target_g * 4 + macros.fat_target_g * 9 + macros.carb_target_g * 4;
  assert.ok(
    Math.abs(macroCalories - strategyProperties.calorie_target.maximum) <= 5,
    `bounded macros should still account for the calorie target; received ${macroCalories}`
  );
});
