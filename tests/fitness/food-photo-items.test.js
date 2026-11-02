import test from "node:test";
import assert from "node:assert/strict";
import { buildFoodPhotoPrompt, FOOD_PHOTO_ITEMS_SCHEMA, FoodPhotoRequestError, normalizeFoodPhotoItems, normalizeFoodPhotoResult } from "../../base44/shared/foodPhotoDomain.js";

const item = { name: "Toast", serving_description: "1 slice", calories: 90, protein_g: 3, carbs_g: 16, fat_g: 1, confidence: "low", notes: "Bread type is uncertain" };

test("photo v2 returns separate, bounded editable foods with uncertainty", () => {
  const result = normalizeFoodPhotoItems({ estimate_status: "estimated", items: [item, { ...item, name: "Egg" }], notes: "Check portions" });
  assert.equal(result.version, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].fiber_g, null);
  assert.equal(result.items[0].serving_grams, null);
  assert.equal(result.items[0].confidence, "low");
});
test("unclear photos produce no fabricated food or nutrition", () => {
  assert.deepEqual(normalizeFoodPhotoItems({ estimate_status: "unable_to_estimate", items: [item], notes: "Too dark" }), { version: 2, estimate_status: "unable_to_estimate", items: [], notes: "Too dark" });
  assert.match(buildFoodPhotoPrompt(2), /unable_to_estimate/);
  assert.doesNotMatch(buildFoodPhotoPrompt(2), /always provide|Do not refuse/i);
});
test("photo nutrients keep unknown distinct from known zero", () => {
  const result = normalizeFoodPhotoItems({ estimate_status: "estimated", items: [{ ...item, protein_g: null, carbs_g: 0, fat_g: "" }] });
  assert.equal(result.items[0].protein_g, null);
  assert.equal(result.items[0].carbs_g, 0);
  assert.equal(result.items[0].fat_g, null);
  assert.equal(normalizeFoodPhotoResult({ ...item, fiber_g: null }).fiber_g, null);
  for (const invalid of [" ", [], {}, true]) assert.equal(normalizeFoodPhotoItems({ estimate_status: "estimated", items: [{ ...item, protein_g: invalid }] }).items[0].protein_g, null);
  assert.equal(FOOD_PHOTO_ITEMS_SCHEMA.properties.items.items.properties.protein_g.type, "number");
  assert.equal(FOOD_PHOTO_ITEMS_SCHEMA.properties.items.items.required.includes("protein_g"), false);
});
test("photo item lists and values cannot exceed diary schema bounds", () => {
  for (const raw of [null, { estimate_status: "estimated", items: [] }, { estimate_status: "estimated", items: Array(21).fill(item) }, { estimate_status: "estimated", items: [{ ...item, calories: -1 }] }, { estimate_status: "estimated", items: [{ ...item, calories: 20001 }] }]) assert.throws(() => normalizeFoodPhotoItems(raw), FoodPhotoRequestError);
});
