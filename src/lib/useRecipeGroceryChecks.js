import { useCallback, useEffect, useState } from "react";
import { groceryCheckKey, groceryItemKey, readGroceryChecks, retainedGroceryChecks, writeGroceryChecks } from "./recipeGrocery.js";

const CHANGE_EVENT = "recomp-grocery-checks-changed";

// Recipe selections are temporary views of a saved shopping list. Prune stale
// quantities for visible ingredients without erasing other recipes' checks.
// Planner swaps still use strict pruning because they replace the whole week.
export function reconcileGroceryChecks(checks, items, { preserveOtherItems = false } = {}) {
  const retained = retainedGroceryChecks(checks, items);
  if (!preserveOtherItems) return retained;
  const visible = new Set(items.map(groceryItemKey));
  const hidden = Object.fromEntries(Object.entries(checks).filter(([key, checked]) => {
    if (checked !== true) return false;
    try {
      const parsed = JSON.parse(key);
      return Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && !visible.has(parsed[0]);
    } catch { return false; }
  }));
  return { ...hidden, ...retained };
}

// Both recipe and planner lists use the existing account-deletion-aware cache,
// with separate list namespaces so one list never checks or clears another.
export function useRecipeGroceryChecks(userId, list) {
  const [state, setState] = useState(() => ({ userId, list, checks: readGroceryChecks(userId, list) }));
  useEffect(() => {
    const refresh = () => setState({ userId, list, checks: readGroceryChecks(userId, list) });
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [userId, list]);
  const checks = state.userId === userId && state.list === list ? state.checks : {};
  const update = useCallback((change) => {
    if (!userId) return;
    const next = writeGroceryChecks(userId, list, change);
    setState({ userId, list, checks: next });
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [userId, list]);
  const retainItems = useCallback((items, options) => update((current) => reconcileGroceryChecks(current, items, options)), [update]);
  return {
    isChecked: (item) => checks[groceryCheckKey(item)] === true,
    toggleItem: (item) => update((current) => ({ ...current, [groceryCheckKey(item)]: current[groceryCheckKey(item)] !== true })),
    clearChecked: () => update(() => ({})),
    retainItems,
    anyChecked: Object.values(checks).some((value) => value === true),
  };
}
