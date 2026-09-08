import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import {
  DEFAULT_HABITS,
  mergeDefaultHabitEntries,
  planDefaultHabitReconciliation
} from "../../shared/defaultHabitsDomain.js";

const inFlightEnsures = new Map();

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function enqueueByUser(userId, work) {
  const previous = inFlightEnsures.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  inFlightEnsures.set(userId, next);
  next.then(
    () => {
      if (inFlightEnsures.get(userId) === next) inFlightEnsures.delete(userId);
    },
    () => {
      if (inFlightEnsures.get(userId) === next) inFlightEnsures.delete(userId);
    }
  );
  return next;
}

async function mergeDuplicateEntries(base44, canonicalHabit, duplicateHabit) {
  const [canonicalEntries, duplicateEntries] = await Promise.all([
    base44.entities.HabitEntry.filter({ habit_id: canonicalHabit.id }, "created_date", 500),
    base44.entities.HabitEntry.filter({ habit_id: duplicateHabit.id }, "created_date", 500)
  ]);
  const byDate = new Map();
  for (const entry of [...canonicalEntries, ...duplicateEntries]) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }

  for (const entries of byDate.values()) {
    const merged = mergeDefaultHabitEntries(entries, canonicalHabit);
    if (!merged) continue;
    await base44.entities.HabitEntry.update(merged.canonical.id, merged.fields);
    await Promise.all(merged.duplicates.map((entry) =>
      base44.entities.HabitEntry.delete(entry.id)
    ));
  }
}

async function ensureDefaults(base44, user) {
  let habits = await base44.entities.Habit.list("-sort_order", 200);
  if (habits.length === 0) {
    const created = [];
    for (const definition of DEFAULT_HABITS) {
      created.push(await base44.entities.Habit.create({ ...definition }));
    }
    habits = await base44.entities.Habit.list("-sort_order", 200);
    const observedIds = new Set(habits.map((habit) => habit.id));
    habits.push(...created.filter((habit) => !observedIds.has(habit.id)));
  }

  const plan = planDefaultHabitReconciliation(habits);
  const survivingHabits = new Map(habits.map((habit) => [habit.id, habit]));
  const removedIds = new Set();
  let observedDuplicates = 0;
  let cleanupPending = 0;

  for (const group of plan) {
    let canonical = group.canonical;
    if (group.canonicalNeedsKey) {
      const updated = await base44.entities.Habit.update(canonical.id, {
        system_key: group.definition.system_key
      });
      canonical = { ...canonical, ...updated };
      survivingHabits.set(canonical.id, canonical);
    }
    for (const duplicate of group.duplicates) {
      observedDuplicates += 1;
      try {
        await mergeDuplicateEntries(base44, canonical, duplicate);
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
  habits = await base44.entities.Habit.list("-sort_order", 200);
  const responseHabits = new Map();
  for (const habit of habits) {
    if (!removedIds.has(habit.id)) responseHabits.set(habit.id, habit);
  }
  for (const habit of survivingHabits.values()) {
    if (!removedIds.has(habit.id)) responseHabits.set(habit.id, habit);
  }
  const habitEntries = await base44.entities.HabitEntry.list("-date", 500);
  return {
    habits: [...responseHabits.values()].sort(
      (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
    ),
    habit_entries: habitEntries,
    observed_duplicates: observedDuplicates,
    cleanup_pending: cleanupPending
  };
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("ensureDefaultHabits auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await enqueueByUser(user.id, () => ensureDefaults(base44, user));
    return Response.json(result);
  } catch (error) {
    console.error("ensureDefaultHabits failed", { userId: user.id, error });
    return Response.json({ error: "Default habits could not be prepared" }, { status: 500 });
  }
}
