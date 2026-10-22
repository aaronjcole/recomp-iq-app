import test from "node:test";
import assert from "node:assert/strict";
import { reconcileGroceryChecks } from "../../src/lib/useRecipeGroceryChecks.js";
import { groceryCheckKey } from "../../src/lib/recipeGrocery.js";

const rice = { name: "Rice", unit: "cup", quantity: 2 };
const lentils = { name: "Lentils", unit: "cup", quantity: 1 };
const checked = (...items) => Object.fromEntries(items.map((item) => [groceryCheckKey(item), true]));

test("reselecting recipes one at a time retains checks for the still-hidden recipe", () => {
  const original = checked(rice, lentils);
  const afterFirstSelection = reconcileGroceryChecks(original, [rice], { preserveOtherItems: true });
  assert.deepEqual(afterFirstSelection, original);
  assert.deepEqual(reconcileGroceryChecks(afterFirstSelection, [rice, lentils], { preserveOtherItems: true }), original);
});

test("a visible quantity edit invalidates its old check without clearing another recipe", () => {
  const changed = { ...rice, quantity: 3 };
  const next = reconcileGroceryChecks(checked(rice, lentils), [changed], { preserveOtherItems: true });
  assert.deepEqual(next, checked(lentils));
  assert.deepEqual(reconcileGroceryChecks(next, [rice, lentils], { preserveOtherItems: true }), checked(lentils));
});

test("planner reconciliation remains strict, including an empty rebuilt list", () => {
  assert.deepEqual(reconcileGroceryChecks(checked(rice, lentils), [rice]), checked(rice));
  assert.deepEqual(reconcileGroceryChecks(checked(rice, lentils), []), {});
});

test("recipe reconciliation drops malformed or unchecked cache entries", () => {
  const input = { ...checked(rice, lentils), malformed: true, '["wrong-shape"]': true, '[7,1]': true, '["old",1]': false };
  assert.deepEqual(reconcileGroceryChecks(input, [rice], { preserveOtherItems: true }), checked(rice, lentils));
});
