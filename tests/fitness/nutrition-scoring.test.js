import test from "node:test";
import assert from "node:assert/strict";

import { scoreNutritionQuality } from "../../src/lib/fitness/nutritionScoring.js";

test("nutrition scoring requires positive calories", () => {
  assert.deepEqual(scoreNutritionQuality({ calories: 0, protein_g: 20 }), {
    score: 0,
    label: "needs_context",
    protein_per_100_cal: 0,
    fiber_per_100_cal: null,
    calories_per_gram: null,
    strengths: [],
    cautions: ["Calories are required for nutrition scoring."]
  });
});

test("protein, fiber, and low calorie density produce a high-satiety score", () => {
  const result = scoreNutritionQuality({
    calories: 200,
    protein_g: 20,
    fiber_g: 5,
    serving_grams: 200
  });

  assert.equal(result.score, 95);
  assert.equal(result.label, "high_satiety");
  assert.equal(result.protein_per_100_cal, 10);
  assert.equal(result.fiber_per_100_cal, 2.5);
  assert.equal(result.calories_per_gram, 1);
  assert.deepEqual(result.strengths, [
    "High protein per calorie.",
    "Helpful fiber density.",
    "Low calorie density."
  ]);
});

test("energy-dense foods are labeled separately when protein density is useful", () => {
  const result = scoreNutritionQuality({
    calories: 400,
    protein_g: 20,
    serving_grams: 100
  });

  assert.equal(result.score, 52);
  assert.equal(result.label, "energy_dense");
  assert.equal(result.calories_per_gram, 4);
  assert.match(result.cautions.join(" "), /Energy dense/);
});

test("routine-use cautions clamp the score and preserve the needs-context label", () => {
  const result = scoreNutritionQuality({
    calories: 100,
    protein_g: 1,
    fiber_g: 0,
    serving_grams: 20,
    saturated_fat_g: 8,
    sodium_mg: 900,
    added_sugar_g: 15
  });

  assert.equal(result.score, 0);
  assert.equal(result.label, "needs_context");
  assert.equal(result.cautions.length, 6);
});

test("a moderate protein score without density extremes is balanced", () => {
  const result = scoreNutritionQuality({ calories: 200, protein_g: 10 });

  assert.equal(result.score, 60);
  assert.equal(result.label, "balanced");
});
