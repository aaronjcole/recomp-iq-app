import { GROCERY_CACHE, readPlanCache, writePlanCache } from "./planCache.js";

const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const groceryItemKey = (item) => JSON.stringify([normalize(item.name), normalize(item.unit)]);
// A tick is for an exact quantity, not just a food name. Quantity changes need review.
export const groceryCheckKey = (item) => JSON.stringify([groceryItemKey(item), item.quantity ?? null]);

export function recipeGroceries(recipes) {
  const items = new Map();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients ?? []) {
      if (!normalize(ingredient.name)) continue;
      const item = { name: ingredient.name.trim(), unit: String(ingredient.unit ?? "").trim() || "each", quantity: ingredient.quantity };
      const quantity = item.quantity;
      item.quantity = quantity == null || String(quantity).trim() === "" || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 ? null : Number(quantity);
      const key = groceryItemKey(item);
      const existing = items.get(key);
      if (!existing) items.set(key, item);
      else existing.quantity = existing.quantity == null || item.quantity == null ? null : Number((existing.quantity + item.quantity).toPrecision(15));
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const validCache = (value) => value?.version === 2 && value.lists && typeof value.lists === "object" && !Array.isArray(value.lists);
export function retainedGroceryChecks(checks, items) {
  const currentKeys = new Set(items.map(groceryCheckKey));
  return Object.fromEntries(Object.entries(checks).filter(([key, value]) => value === true && currentKeys.has(key)));
}
export function readGroceryChecks(userId, list) {
  const checks = readPlanCache(GROCERY_CACHE, userId, validCache)?.lists?.[list];
  return checks && typeof checks === "object" && !Array.isArray(checks) ? checks : {};
}

export function writeGroceryChecks(userId, list, update) {
  if (!userId) return {};
  const cache = readPlanCache(GROCERY_CACHE, userId, validCache) ?? { version: 2, lists: {} };
  const checks = update(readGroceryChecks(userId, list));
  writePlanCache(GROCERY_CACHE, userId, { version: 2, lists: { ...cache.lists, [list]: checks } });
  return checks;
}
