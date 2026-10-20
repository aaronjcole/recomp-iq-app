import { useCallback, useEffect, useState } from "react";
import { groceryCheckKey, readGroceryChecks, retainedGroceryChecks, writeGroceryChecks } from "./recipeGrocery.js";

const CHANGE_EVENT = "recomp-grocery-checks-changed";

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
  const retainItems = useCallback((items) => update((current) => retainedGroceryChecks(current, items)), [update]);
  return {
    isChecked: (item) => checks[groceryCheckKey(item)] === true,
    toggleItem: (item) => update((current) => ({ ...current, [groceryCheckKey(item)]: current[groceryCheckKey(item)] !== true })),
    clearChecked: () => update(() => ({})),
    retainItems,
    anyChecked: Object.values(checks).some((value) => value === true),
  };
}
