import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RECIPE_NUTRIENTS, recipeBatchForEditor, recipeFood, recipePerServing, recipeWritePayload, plannedMealFood } from "../../src/lib/recipeNutrition.js";
import { groceryItemKey, groceryCheckKey, recipeGroceries, readGroceryChecks, retainedGroceryChecks, writeGroceryChecks } from "../../src/lib/recipeGrocery.js";
import { GROCERY_CACHE, planCacheKeysForUser } from "../../src/lib/planCache.js";
import { changeDraftQuantity, createFoodDraft, validFoodDraft, foodDraftPayload } from "../../src/lib/foodEntryDraft.js";

const recipe = {
  id: "recipe-portions", title: "Batch rice", servings: 4, tags: [],
  ingredients: [{ name: "Rice", quantity: 2, unit: "cup" }],
  instructions: ["Cook rice.", "Divide into four portions."],
  nutrition_basis: "batch", batch_nutrition: { calories: 1200, protein_g: 80, carbs_g: 160, fat_g: 24, fiber_g: 12 },
};

test("explicit batch totals divide all five nutrients by yield without integer rounding", () => {
  assert.deepEqual(recipePerServing(recipe), { calories: 300, protein_g: 20, carbs_g: 40, fat_g: 6, fiber_g: 3 });
  assert.equal(recipePerServing({ ...recipe, servings: 3 }).fat_g, 8);
  assert.equal(recipePerServing({ ...recipe, servings: 3 }).carbs_g, 160 / 3);
});

test("recipe portions use shared drafts with recipe provenance and accurate fractional scaling", () => {
  const draft = changeDraftQuantity(createFoodDraft(recipeFood(recipe), "recipe", recipe.id), "1.5");
  assert.equal(validFoodDraft(draft), true);
  assert.deepEqual(foodDraftPayload(draft, "2026-01-02", "dinner"), {
    date: "2026-01-02", meal: "dinner", name: recipe.title, serving_description: "1 recipe serving", quantity: 1.5,
    calories: 450, protein_g: 30, carbs_g: 60, fat_g: 9, fiber_g: 4.5, source: "recipe", source_food_id: recipe.id,
  });
});

test("blank or invalid batch values stay unknown and cannot fall back to stale legacy values", () => {
  const incomplete = { ...recipe, batch_nutrition: { calories: 100, protein_g: 0, fat_g: " ", fiber_g: null }, carbs_g_per_serving: 99 };
  assert.deepEqual(recipePerServing(incomplete), { calories: 25, protein_g: 0, carbs_g: null, fat_g: null, fiber_g: null });
  const draft = createFoodDraft(recipeFood(incomplete), "recipe", incomplete.id);
  assert.equal(draft.carbs_g, "");
  assert.equal(draft.fat_g, "");
  assert.equal(validFoodDraft(draft), false);
  assert.throws(() => foodDraftPayload(draft, "2026-01-02", "dinner"), /Review/);
  for (const servings of [0, "", null, -1, Infinity]) assert.equal(recipePerServing({ ...recipe, servings }).calories, null);
});

test("legacy per-serving nutrition is retained on display and converted to explicit batch values for editing", () => {
  const legacy = { servings: 3, calories_per_serving: 120, protein_g_per_serving: 8, carbs_g_per_serving: 12, fat_g_per_serving: 0 };
  assert.deepEqual(recipeBatchForEditor(legacy), { calories: 360, protein_g: 24, carbs_g: 36, fat_g: 0, fiber_g: "" });
  assert.equal(recipePerServing(legacy).fiber_g, null);
});

test("recipe writes validate yield/ingredients/nutrition and omit unknowns and ownership metadata", () => {
  const payload = recipeWritePayload({ ...recipe, title: " Batch rice ", created_by_id: "foreign", batch_nutrition: { calories: "1200", fat_g: "", protein_g: 0 } });
  assert.equal(payload.title, "Batch rice");
  assert.deepEqual(payload.batch_nutrition, { calories: 1200, protein_g: 0 });
  assert.equal(Object.hasOwn(payload, "id"), false);
  assert.equal(Object.hasOwn(payload, "created_by_id"), false);
  for (const servings of ["", 0, -2, 1001, NaN]) assert.throws(() => recipeWritePayload({ ...recipe, servings }), /servings/);
  for (const value of [-1, NaN, Infinity, "oops", false]) assert.throws(() => recipeWritePayload({ ...recipe, batch_nutrition: { fat_g: value } }), /Fat/);
  assert.throws(() => recipeWritePayload({ ...recipe, ingredients: [{ name: "Rice", quantity: "", unit: "cup" }] }), /quantity/);
  assert.throws(() => recipeWritePayload({ ...recipe, ingredients: [] }), /ingredient/);
});

test("planner meals are already scaled: review never multiplies by servingScale a second time", () => {
  const meal = { title: "Planned bowl", calories: 600, proteinG: 40, carbsG: 80, fatG: 12, servingScale: 2 };
  const draft = createFoodDraft(plannedMealFood(meal), "plan", "planned-bowl");
  assert.equal(draft.calories, "600");
  assert.equal(draft.carbs_g, "80");
  assert.equal(draft.fiber_g, "");
  assert.equal(draft.source, "plan");
  assert.equal(draft.serving_description, "2× base portion");
  assert.equal(changeDraftQuantity(draft, "0.5").calories, "300");
  assert.equal(createFoodDraft(plannedMealFood({ title: "Missing macros" }), "plan").carbs_g, "");
});

test("recipe grocery lines normalize names/units, keep units separate and retain unknown quantities", () => {
  const groceries = recipeGroceries([{ ingredients: [
    { name: " Rice ", unit: " Cup ", quantity: 0.1 }, { name: "rice", unit: "cup", quantity: 0.2 },
    { name: "Rice", unit: "g", quantity: 100 }, { name: "Oil", unit: "tbsp", quantity: "" },
    { name: "oil", unit: "tbsp", quantity: 2 },
  ] }, {}]);
  assert.equal(groceries.length, 3);
  assert.equal(groceries.find((item) => item.unit === "Cup").quantity, 0.3);
  assert.equal(groceries.find((item) => item.name === "Oil").quantity, null);
  assert.equal(groceryItemKey({ name: "  Rice ", unit: "CUP" }), groceryItemKey({ name: "rice", unit: "cup" }));
  assert.notEqual(groceryItemKey({ name: "a-b", unit: "c" }), groceryItemKey({ name: "a", unit: "b-c" }));
  assert.notEqual(groceryCheckKey({ name: "Rice", unit: "cup", quantity: 1 }), groceryCheckKey({ name: "rice", unit: "cup", quantity: 2 }));
});

test("recipe and planner ticks share deletion-aware account scope without overwriting other lists/accounts", () => {
  const data = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  try {
    const key = groceryCheckKey({ name: "Rice", unit: "cup", quantity: 1 });
    writeGroceryChecks("a", "recipes", () => ({ [key]: true }));
    assert.deepEqual(readGroceryChecks("a", "plan"), {});
    assert.deepEqual(readGroceryChecks("b", "recipes"), {});
    writeGroceryChecks("a", "plan", () => ({ [key]: true }));
    writeGroceryChecks("a", "plan", () => ({}));
    assert.equal(readGroceryChecks("a", "recipes")[key], true);
    assert.deepEqual(readGroceryChecks("a", "plan"), {});
    assert.ok(planCacheKeysForUser("a").includes(`${GROCERY_CACHE}_a`));
    const count = data.size;
    writeGroceryChecks(null, "recipes", () => ({ unsafe: true }));
    assert.equal(data.size, count);
    data.set(`${GROCERY_CACHE}_a`, "malformed");
    assert.deepEqual(readGroceryChecks("a", "recipes"), {});
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});

test("grocery changes discard obsolete ticks even when a later edit restores the old quantity", () => {
  const one = { name: "Rice", unit: "cup", quantity: 1 };
  const two = { ...one, quantity: 2 };
  const checked = { [groceryCheckKey(one)]: true };
  const afterChange = retainedGroceryChecks(checked, [two]);
  assert.deepEqual(afterChange, {});
  assert.deepEqual(retainedGroceryChecks(afterChange, [one]), {});
  assert.deepEqual(retainedGroceryChecks(checked, []), {});
});

test("grocery aggregation preserves tiny positive quantities", () => {
  assert.equal(recipeGroceries([{ ingredients: [
    { name: "Salt", quantity: 0.0001, unit: "kg" },
    { name: "Salt", quantity: 0.0001, unit: "kg" },
  ] }])[0].quantity, 0.0002);
});

test("recipe schema declares all batch nutrients, favorites, and legacy carbs/fat while retaining owner RLS", () => {
  const schema = JSON.parse(readFileSync(new URL("../../base44/entities/Recipe.jsonc", import.meta.url), "utf8"));
  for (const { key } of RECIPE_NUTRIENTS) assert.ok(schema.properties.batch_nutrition.properties[key]);
  assert.ok(schema.properties.carbs_g_per_serving);
  assert.ok(schema.properties.fat_g_per_serving);
  assert.equal(schema.properties.is_favorite.type, "boolean");
  assert.equal(schema.rls.update.$or[0].created_by_id, "{{user.id}}");
});
