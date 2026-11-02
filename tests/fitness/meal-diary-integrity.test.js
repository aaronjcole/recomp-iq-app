import test from "node:test";
import assert from "node:assert/strict";
import { copiedEntries, perUnitNutrition, recentLoggedFoods, scaledNutrition } from "../../src/lib/foodLogging.js";

const food = {
  id: "diary-source", name: "Sweep oats", date: "2026-10-12", meal: "lunch",
  serving_description: "1 bowl", quantity: 2, calories: 400,
  protein_g: 20, carbs_g: 60, fat_g: 8, fiber_g: 6
};

for (const quantity of [Infinity, "Infinity", "1e309", NaN, -Infinity, "", 0, -1]) {
  test(`diary scaling rejects non-finite or non-positive quantity ${String(quantity)}`, () => {
    assert.equal(scaledNutrition(perUnitNutrition(food), quantity), null);
    assert.equal(food.quantity, 2);
  });
}

test("diary quantity scaling preserves fractional nutrition, including uneditable fiber", () => {
  assert.deepEqual(scaledNutrition(perUnitNutrition(food), "0.75"), {
    calories: 150, protein_g: 7.5, carbs_g: 22.5, fat_g: 3, fiber_g: 2.3
  });
});

test("reconciliation-required rows cannot be copied or offered as recent even without a pending flag", () => {
  const recovery = { ...food, id: "needs-review", name: "Incomplete oats", reconciliationRequired: true };
  const pending = { ...food, id: "pending", pending: true };
  const entries = [food, recovery, pending];
  assert.deepEqual(recentLoggedFoods(entries).map((entry) => entry.id), [food.id]);
  const copies = copiedEntries(entries, "2026-10-13");
  assert.equal(copies.length, 1);
  assert.equal(copies[0].repeated_from_id, food.id);
  assert.equal(copies[0].date, "2026-10-13");
  assert.equal(copies[0].meal, "lunch");
  assert.equal(Object.hasOwn(copies[0], "id"), false);
  assert.equal(Object.hasOwn(copies[0], "reconciliationRequired"), false);
  assert.equal(recovery.reconciliationRequired, true);
});
