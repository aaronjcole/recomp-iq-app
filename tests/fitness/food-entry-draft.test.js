import test from "node:test";
import assert from "node:assert/strict";
import {
  changeDraftNutrient,
  changeDraftQuantity,
  createFoodDraft,
  foodDraftPayload,
  validFoodDraft,
} from "../../src/lib/foodEntryDraft.js";

const food = {
  name: "Oats",
  serving_description: "1 cup",
  calories: 200,
  protein_g: 10,
  carbs_g: 30,
  fat_g: 4,
};

test("unknown nutrients stay blank and cannot be silently logged as zero", () => {
  const draft = createFoodDraft({ ...food, protein_g: null }, "barcode");
  assert.equal(draft.protein_g, "");
  assert.equal(changeDraftQuantity(draft, "2").protein_g, "");
  assert.equal(validFoodDraft(draft), false);
  assert.throws(() => foodDraftPayload(draft, "2026-10-19", "lunch"));
  assert.equal(
    validFoodDraft(changeDraftNutrient(draft, "protein_g", "0")),
    true,
  );
});

test("quantity scales from the original portion without compounding rounding", () => {
  const draft = createFoodDraft(food, "library", "food-1");
  const twice = changeDraftQuantity(draft, "2");
  assert.equal(twice.calories, "400");
  const half = changeDraftQuantity(twice, "0.5");
  assert.equal(half.calories, "100");
  assert.equal(half.protein_g, "5");
  const edited = changeDraftNutrient(twice, "calories", "500");
  assert.equal(changeDraftQuantity(edited, "1").calories, "250");
});

test("drafts enforce schema bounds and finite quantities", () => {
  const draft = createFoodDraft(food);
  for (const quantity of ["", "0", "-1", "Infinity", "1001"])
    assert.equal(validFoodDraft({ ...draft, quantity }), false);
  for (const calories of ["", "-1", "Infinity", "20001"])
    assert.equal(validFoodDraft({ ...draft, calories }), false);
  assert.equal(validFoodDraft({ ...draft, name: " " }), false);
  assert.equal(validFoodDraft({ ...draft, name: "a".repeat(201) }), false);
});

test("payload uses explicit date and meal, drops internal state, and preserves source", () => {
  const draft = createFoodDraft(
    { ...food, id: "library-id", created_by_id: "someone" },
    "library",
    "food-1",
  );
  assert.deepEqual(foodDraftPayload(draft, "2026-10-19", "lunch"), {
    ...food,
    date: "2026-10-19",
    meal: "lunch",
    quantity: 1,
    source: "library",
    source_food_id: "food-1",
  });
  assert.equal(
    Object.hasOwn(foodDraftPayload(draft, "2026-10-19", "lunch"), "fiber_g"),
    false,
  );
});
