export const DEFAULT_HABITS = Object.freeze([
  Object.freeze({
    system_key: "default_water",
    name: "Water",
    kind: "count",
    target_value: 100,
    unit: "oz",
    sort_order: 0
  }),
  Object.freeze({
    system_key: "default_read",
    name: "Read",
    kind: "check",
    sort_order: 1
  }),
  Object.freeze({
    system_key: "default_meditate",
    name: "Meditate",
    kind: "check",
    sort_order: 2
  })
]);

function oldestFirst(left, right) {
  const leftStamp = left?.created_date ?? "";
  const rightStamp = right?.created_date ?? "";
  if (leftStamp !== rightStamp) return leftStamp.localeCompare(rightStamp);
  return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
}

function matchesLegacyDefault(habit, definition) {
  if (!habit || habit.archived === true) return false;
  if (String(habit.name ?? "").trim().toLowerCase() !== definition.name.toLowerCase()) return false;
  if (habit.kind !== definition.kind) return false;
  if (Number(habit.sort_order) !== definition.sort_order) return false;
  if (definition.kind === "count") {
    return Number(habit.target_value) === definition.target_value
      && String(habit.unit ?? "").trim().toLowerCase() === definition.unit;
  }
  return habit.target_value == null && !String(habit.unit ?? "").trim();
}

/**
 * Recognize only the exact legacy starter trio. Requiring the complete trio
 * keeps a deliberately duplicated custom habit out of automatic cleanup.
 */
export function planDefaultHabitReconciliation(habits) {
  const records = Array.isArray(habits) ? habits.filter((habit) => habit?.id) : [];
  const exactGroups = new Map(
    DEFAULT_HABITS.map((definition) => [
      definition.system_key,
      records.filter((habit) => matchesLegacyDefault(habit, definition))
    ])
  );
  const hasCompleteLegacyTrio = DEFAULT_HABITS.every(
    (definition) => exactGroups.get(definition.system_key).length > 0
  );

  return DEFAULT_HABITS.flatMap((definition) => {
    const keyed = records.filter((habit) => habit.system_key === definition.system_key);
    const includeLegacy = keyed.length > 0 || hasCompleteLegacyTrio;
    const candidatesById = new Map();
    for (const habit of keyed) candidatesById.set(habit.id, habit);
    if (includeLegacy) {
      for (const habit of exactGroups.get(definition.system_key)) {
        candidatesById.set(habit.id, habit);
      }
    }
    const candidates = [...candidatesById.values()].sort(oldestFirst);
    if (candidates.length === 0) return [];

    const canonical = candidates.find((habit) => habit.system_key === definition.system_key)
      ?? candidates[0];
    return [{
      definition,
      canonical,
      canonicalNeedsKey: canonical.system_key !== definition.system_key,
      duplicates: candidates.filter((habit) => habit.id !== canonical.id)
    }];
  });
}

export function needsDefaultHabitReconciliation(habits) {
  if (!Array.isArray(habits) || habits.length === 0) return true;
  return planDefaultHabitReconciliation(habits).some(
    (group) => group.canonicalNeedsKey || group.duplicates.length > 0
  );
}

export function mergeDefaultHabitEntries(entries, habit) {
  const records = Array.isArray(entries) ? entries.filter((entry) => entry?.id && entry?.date) : [];
  if (records.length === 0) return null;
  const sorted = [...records].sort(oldestFirst);
  const canonical = sorted[0];
  const done = records.some((entry) => entry.done === true);
  const fields = { habit_id: habit.id };

  if (habit.kind === "count") {
    const value = Math.max(...records.map((entry) => Number(entry.value) || 0));
    fields.value = value;
    fields.done = done || value >= (Number(habit.target_value) || 1);
  } else {
    fields.done = done;
  }

  return {
    canonical,
    duplicates: sorted.slice(1),
    fields
  };
}
