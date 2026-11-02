import test from "node:test";
import assert from "node:assert/strict";

import { parseProduct } from "../../base44/shared/openFoodFacts.js";
import { scoreNutritionQuality } from "../../src/lib/fitness/nutritionScoring.js";

const ORANGE_JUICE = {
  code: "0001",
  product_name: "Orange juice",
  serving_quantity: "250",
  serving_size: "250 ml",
  nutriments: {
    "energy-kcal_100g": 45,
    proteins_100g: 0.7,
    carbohydrates_100g: 10.4,
    fat_100g: 0.2,
    sugars_100g: 8.4,
    sugars_serving: 21
  }
};

test("total sugars alone do not populate added_sugar_g", () => {
  const food = parseProduct(ORANGE_JUICE);
  assert.equal(food.added_sugar_g, null, "unknown added sugar stays null");
  assert.equal(food.carbs_g, 26);
});

test("added-sugars per serving maps to added_sugar_g", () => {
  const food = parseProduct({
    ...ORANGE_JUICE,
    nutriments: { ...ORANGE_JUICE.nutriments, "added-sugars_serving": 12.34 }
  });
  assert.equal(food.added_sugar_g, 12.3);
});

test("added-sugars per 100 g is scaled by serving size", () => {
  const food = parseProduct({
    ...ORANGE_JUICE,
    nutriments: { ...ORANGE_JUICE.nutriments, "added-sugars_100g": 8 }
  });
  assert.equal(food.added_sugar_g, 20);
});

test("juice without added-sugar data is not flagged for added sugar", () => {
  const result = scoreNutritionQuality(parseProduct(ORANGE_JUICE));
  assert.ok(
    !result.cautions.some((c) => /added sugar/i.test(c)),
    `unexpected caution: ${result.cautions.join(" | ")}`
  );
});

test("raisins (23.6 g total sugar) are not flagged without added-sugar data", () => {
  const raisins = parseProduct({
    code: "0002",
    product_name: "Raisins",
    serving_quantity: "40",
    nutriments: {
      "energy-kcal_100g": 299,
      proteins_100g: 3.1,
      carbohydrates_100g: 79,
      fat_100g: 0.5,
      fiber_100g: 3.7,
      sugars_100g: 59
    }
  });
  assert.equal(raisins.added_sugar_g, null);
  const result = scoreNutritionQuality(raisins);
  assert.ok(!result.cautions.some((c) => /added sugar/i.test(c)));
});

test("a product with real added sugar is still flagged", () => {
  const soda = parseProduct({
    code: "0003",
    product_name: "Cola",
    serving_quantity: "355",
    nutriments: {
      "energy-kcal_100g": 42,
      proteins_100g: 0,
      carbohydrates_100g: 10.6,
      fat_100g: 0,
      sugars_100g: 10.6,
      "added-sugars_100g": 10.6
    }
  });
  assert.equal(soda.added_sugar_g, 37.6);
  const result = scoreNutritionQuality(soda);
  assert.ok(result.cautions.some((c) => /added sugar/i.test(c)));
});
