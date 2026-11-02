import test from "node:test";
import assert from "node:assert/strict";

import { computeNutritionSignal } from "../../src/lib/fitness/nutritionSignal.js";

const STRATEGY = {
  calorie_target: 2000,
  protein_target_g: 150,
  carb_target_g: 200,
  fat_target_g: 65
};

const FOODS = [
  { id: "f1", name: "Greek yogurt", protein_g: 20 },
  { id: "f2", name: "Apple", protein_g: 0.5 }
];

function signal(log, foods = FOODS) {
  return computeNutritionSignal({
    log,
    foodEntries: [],
    foods,
    strategy: STRATEGY,
    profile: null,
    preferences: null,
    logs: []
  });
}

test("nudge prioritizes protein when its relative gap exceeds the calorie gap", () => {
  // 120 kcal short (6%) vs 80 g protein short (53%) — previously "120 kcal short on calories".
  const result = signal({ calories: 1880, protein_g: 70, carbs_g: 200, fat_g: 65 });
  assert.equal(result.nudge, "80g short on protein — add Greek yogurt from your library.");
  assert.equal(result.nudgeAction.type, "add_food");
  assert.equal(result.nudgeAction.foodId, "f1");
});

test("nudge picks calories when the calorie gap is relatively larger", () => {
  // 1000 kcal short (50%) vs 15 g protein short (10%)
  const result = signal({ calories: 1000, protein_g: 135, carbs_g: 200, fat_g: 65 });
  assert.equal(result.nudge, "1000 kcal short on calories — tap to log a food.");
  assert.deepEqual(result.nudgeAction, { type: "open_form" });
});

test("equal relative gaps keep protein first", () => {
  // both exactly 10% short
  const result = signal({ calories: 1800, protein_g: 135, carbs_g: 200, fat_g: 65 });
  assert.match(result.nudge, /^15g short on protein/);
});

test("carbs or fat can top the ranking by share of target", () => {
  // fat 40% short beats protein 10% and calories 5%
  const result = signal({ calories: 1900, protein_g: 135, carbs_g: 200, fat_g: 39 });
  assert.match(result.nudge, /^26g short on fat/);
});

test("no nudge when every target is met or exceeded", () => {
  const result = signal({ calories: 2100, protein_g: 160, carbs_g: 210, fat_g: 70 });
  assert.equal(result.nudge, "");
  assert.equal(result.nudgeAction, null);
});

test("macros without a target are never ranked", () => {
  const result = computeNutritionSignal({
    log: { calories: 1900, protein_g: 140, carbs_g: 0, fat_g: 0 },
    foodEntries: [],
    foods: FOODS,
    strategy: { calorie_target: 2000, protein_target_g: 150 },
    profile: null,
    preferences: null,
    logs: []
  });
  assert.match(result.nudge, /^10g short on protein/);
});

test("protein-first nudge falls back to the log form without a high-protein food", () => {
  const result = signal(
    { calories: 1880, protein_g: 70, carbs_g: 200, fat_g: 65 },
    [{ id: "f2", name: "Apple", protein_g: 0.5 }]
  );
  assert.equal(result.nudge, "80g short on protein — tap to log a food.");
  assert.deepEqual(result.nudgeAction, { type: "open_form" });
});
