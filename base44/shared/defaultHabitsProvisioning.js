// Starter-habit provisioning and duplicate cleanup behind
// base44/functions/ensureDefaultHabits, moved out of the Deno entry unchanged
// so it can run against a fake client. The entry authenticates and serializes
// calls per user; every read and write happens here.

import {
  DEFAULT_HABITS,
  mergeDefaultHabitEntries,
  planDefaultHabitReconciliation
} from "./defaultHabitsDomain.js";
import { ownedQuery } from "./ownerScope.js";

export const ENTRY_PAGE_SIZE = 500;

// RLS grants admins access to every user's rows, so each read below names the
// caller as owner explicitly; otherwise an admin would reconcile other users'
// starter habits and history.
function listOwnedHabits(base44, user) {
  return base44.entities.Habit.filter(ownedQuery(user.id), "-sort_order", 200);
}

async function mergeDuplicateEntries(base44, user, canonicalHabit, duplicateHabit) {
  async function listAllEntries(habitId) {
    const entries = [];
    for (let skip = 0; ; skip += ENTRY_PAGE_SIZE) {
      const page = await base44.entities.HabitEntry.filter(
        ownedQuery(user.id, { habit_id: habitId }),
        "created_date",
        ENTRY_PAGE_SIZE,
        skip
      );
      entries.push(...page);
      if (page.length < ENTRY_PAGE_SIZE) return entries;
    }
  }

  const [canonicalEntries, duplicateEntries] = await Promise.all([
    listAllEntries(canonicalHabit.id),
    listAllEntries(duplicateHabit.id)
  ]);
  const byDate = new Map();
  for (const entry of [...canonicalEntries, ...duplicateEntries]) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }

  for (const entries of byDate.values()) {
    const merged = mergeDefaultHabitEntries(entries, canonicalHabit, { ownerId: user.id });
    if (!merged) continue;
    await base44.entities.HabitEntry.update(merged.canonical.id, merged.fields);
    await Promise.all(merged.duplicates.map((entry) =>
      base44.entities.HabitEntry.delete(entry.id)
    ));
  }
}

export async function assignSystemKey(base44, user, habit, systemKey) {
  // Field-level security keeps clients from claiming a starter identity. Use
  // service role only after independently verifying this exact record belongs
  // to the authenticated caller.
  const owned = await base44.asServiceRole.entities.Habit.get(habit.id);
  if (!owned?.id || owned.created_by_id !== user.id) {
    throw new Error("Starter habit ownership could not be verified");
  }
  const updated = await base44.asServiceRole.entities.Habit.update(habit.id, {
    system_key: systemKey
  });
  return { ...habit, ...updated };
}

export async function ensureDefaults(base44, user) {
  let habits = await listOwnedHabits(base44, user);
  // Preserve the original product behavior: seed only a truly empty account.
  // A custom-only account represents an intentional user choice and must not
  // have archived or removed starter habits recreated.
  if (habits.length === 0) {
    const created = [];
    for (const definition of DEFAULT_HABITS) {
      const { system_key: systemKey, ...fields } = definition;
      const habit = await base44.entities.Habit.create(fields);
      created.push(await assignSystemKey(base44, user, habit, systemKey));
    }
    habits = await listOwnedHabits(base44, user);
    const observedIds = new Set(habits.map((habit) => habit.id));
    habits.push(...created.filter((habit) => !observedIds.has(habit.id)));
  }

  const plan = planDefaultHabitReconciliation(habits, { ownerId: user.id });
  const survivingHabits = new Map(habits.map((habit) => [habit.id, habit]));
  const removedIds = new Set();
  let observedDuplicates = 0;
  let cleanupPending = 0;

  for (const group of plan) {
    let canonical = group.canonical;
    if (group.canonicalNeedsKey) {
      canonical = await assignSystemKey(
        base44,
        user,
        canonical,
        group.definition.system_key
      );
      survivingHabits.set(canonical.id, canonical);
    }
    for (const duplicate of group.duplicates) {
      observedDuplicates += 1;
      try {
        await mergeDuplicateEntries(base44, user, canonical, duplicate);
        await base44.entities.Habit.delete(duplicate.id);
        survivingHabits.delete(duplicate.id);
        removedIds.add(duplicate.id);
      } catch (error) {
        cleanupPending += 1;
        console.warn("Default habit duplicate cleanup remains pending", {
          userId: user.id,
          systemKey: group.definition.system_key,
          duplicateId: duplicate.id,
          error
        });
      }
    }
  }

  // Merge a final read with the successfully reconciled local view. Base44 can
  // briefly return a deleted row from an eventually-consistent read, so keep
  // confirmed removals out of the response while still including concurrent
  // custom-habit additions observed by the final list.
  habits = await listOwnedHabits(base44, user);
  const responseHabits = new Map();
  for (const habit of habits) {
    if (!removedIds.has(habit.id)) responseHabits.set(habit.id, habit);
  }
  for (const habit of survivingHabits.values()) {
    if (!removedIds.has(habit.id)) responseHabits.set(habit.id, habit);
  }
  const habitEntries = await base44.entities.HabitEntry.filter(
    ownedQuery(user.id),
    "-date",
    500
  );
  return {
    habits: [...responseHabits.values()].sort(
      (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
    ),
    habit_entries: habitEntries,
    observed_duplicates: observedDuplicates,
    cleanup_pending: cleanupPending
  };
}
