import test from "node:test";
import assert from "node:assert/strict";
import {
  copiedEntries,
  defaultMealForTime,
  perUnitNutrition,
  previousDateKey,
  recentLoggedFoods,
  scaledNutrition
} from "../../src/lib/foodLogging.js";

const at = (hours, minutes = 0) => new Date(2026, 9, 6, hours, minutes);

test("the default meal follows the time of day", () => {
  assert.equal(defaultMealForTime(at(7)), "breakfast");
  assert.equal(defaultMealForTime(at(10, 29)), "breakfast");
  assert.equal(defaultMealForTime(at(10, 30)), "lunch");
  assert.equal(defaultMealForTime(at(14, 29)), "lunch");
  assert.equal(defaultMealForTime(at(15)), "snack");
  assert.equal(defaultMealForTime(at(17)), "dinner");
  assert.equal(defaultMealForTime(at(21, 30)), "snack");
  assert.equal(defaultMealForTime(at(2)), "snack");
});

test("recent foods are what was logged, newest first, one per distinct food", () => {
  const entries = [
    { id: "a", name: "Oats", serving_description: "1 cup", quantity: 1, calories: 300, date: "2026-10-04", created_date: "2026-10-04T08:00:00Z" },
    { id: "b", name: "oats ", serving_description: "1 cup", quantity: 1, calories: 300, date: "2026-10-06", created_date: "2026-10-06T08:00:00Z" },
    { id: "c", name: "Oats", serving_description: "1 cup", quantity: 2, calories: 600, date: "2026-10-05", created_date: "2026-10-05T08:00:00Z" },
    { id: "d", name: "Chicken", serving_description: "100 g", quantity: 1, calories: 165, date: "2026-10-05", created_date: "2026-10-05T12:00:00Z" },
    { id: "e", name: "Pending shake", calories: 200, date: "2026-10-06", pending: true },
    { id: "f", name: "  ", calories: 10, date: "2026-10-06" }
  ];
  // The same food at the same quantity collapses to its latest log; a
  // different quantity is a different quick add.
  assert.deepEqual(recentLoggedFoods(entries).map((entry) => entry.id), ["b", "d", "c"]);
  assert.deepEqual(recentLoggedFoods(entries, 2).map((entry) => entry.id), ["b", "d"]);
  assert.deepEqual(recentLoggedFoods(null), []);
});

test("changing quantity scales calories and macros from the per-unit values", () => {
  const entry = { quantity: 2, calories: 300, protein_g: 25, carbs_g: 30.5, fat_g: 7, fiber_g: 3 };
  const perUnit = perUnitNutrition(entry);
  assert.deepEqual(scaledNutrition(perUnit, 3), { calories: 450, protein_g: 37.5, carbs_g: 45.8, fat_g: 10.5, fiber_g: 4.5 });
  assert.deepEqual(scaledNutrition(perUnit, 0.5), { calories: 75, protein_g: 6.3, carbs_g: 7.6, fat_g: 1.8, fiber_g: 0.8 });
  // An empty or zero quantity while typing leaves the numbers alone.
  assert.equal(scaledNutrition(perUnit, ""), null);
  assert.equal(scaledNutrition(perUnit, 0), null);
  // A missing or zero quantity counts as one unit.
  assert.equal(perUnitNutrition({ calories: 100, quantity: 0 }).calories, 100);
});

test("copied entries keep the food and meal, link the original, and drop identity fields", () => {
  const source = {
    id: "entry-1",
    created_by_id: "user-1",
    created_date: "2026-10-05T08:00:00Z",
    date: "2026-10-05",
    meal: "breakfast",
    name: "Oats",
    serving_description: "1 cup",
    quantity: 2,
    calories: 600,
    protein_g: 20,
    carbs_g: 100,
    fat_g: 10,
    source: "library",
    source_food_id: "food-9"
  };
  const [copy] = copiedEntries([source, { ...source, id: "pending", pending: true }], "2026-10-06");
  assert.deepEqual(copy, {
    date: "2026-10-06",
    meal: "breakfast",
    name: "Oats",
    serving_description: "1 cup",
    quantity: 2,
    calories: 600,
    protein_g: 20,
    carbs_g: 100,
    fat_g: 10,
    fiber_g: 0,
    source: "repeat",
    repeated_from_id: "entry-1",
    source_food_id: "food-9"
  });
  assert.equal(copiedEntries([source, { ...source, pending: true }], "2026-10-06").length, 1);
  assert.equal(copiedEntries([source], "2026-10-06", "dinner")[0].meal, "dinner");
});

test("the previous date crosses month and year boundaries", () => {
  assert.equal(previousDateKey("2026-10-06"), "2026-10-05");
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
  assert.equal(previousDateKey("2026-01-01"), "2025-12-31");
});
