import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HABITS,
  mergeDefaultHabitEntries,
  needsDefaultHabitReconciliation,
  planDefaultHabitReconciliation
} from "../../base44/shared/defaultHabitsDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function legacyDefaults(copies = 1) {
  return DEFAULT_HABITS.flatMap(({ system_key: _systemKey, ...definition }, groupIndex) =>
    Array.from({ length: copies }, (_, duplicateIndex) => ({
      ...definition,
      id: `habit-${groupIndex}-${duplicateIndex}`,
      created_date: `2026-08-0${duplicateIndex + 1}T0${groupIndex}:00:00.000Z`
    }))
  );
}

test("an empty account and an unmarked legacy starter trio request reconciliation", () => {
  assert.equal(needsDefaultHabitReconciliation([]), true);
  const legacy = legacyDefaults();
  assert.equal(needsDefaultHabitReconciliation(legacy), true);
  const plan = planDefaultHabitReconciliation(legacy);
  assert.equal(plan.length, 3);
  assert.ok(plan.every((group) => group.canonicalNeedsKey));
  assert.ok(plan.every((group) => group.duplicates.length === 0));
});

test("four raced starter batches collapse to one stable habit per default", () => {
  const plan = planDefaultHabitReconciliation(legacyDefaults(4));
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((group) => group.canonical.id), [
    "habit-0-0",
    "habit-1-0",
    "habit-2-0"
  ]);
  assert.deepEqual(plan.map((group) => group.duplicates.length), [3, 3, 3]);
});

test("a same-named custom habit is not mistaken for a starter race", () => {
  const customOnly = [
    { id: "water-1", name: "Water", kind: "count", target_value: 64, unit: "oz", sort_order: 4 },
    { id: "water-2", name: "Water", kind: "count", target_value: 64, unit: "oz", sort_order: 5 }
  ];
  assert.equal(needsDefaultHabitReconciliation(customOnly), false);
  assert.deepEqual(planDefaultHabitReconciliation(customOnly), []);
});

test("a server-marked starter keeps partial cleanup retryable", () => {
  const defaults = legacyDefaults();
  const marked = defaults.map((habit, index) => ({
    ...habit,
    system_key: DEFAULT_HABITS[index].system_key
  }));
  const strandedWater = {
    ...defaults[0],
    id: "water-stranded",
    created_date: "2026-08-02T00:00:00.000Z"
  };
  const plan = planDefaultHabitReconciliation([...marked, strandedWater]);

  assert.equal(needsDefaultHabitReconciliation([...marked, strandedWater]), true);
  assert.deepEqual(plan[0].duplicates.map((habit) => habit.id), ["water-stranded"]);
  assert.ok(plan.slice(1).every((group) => group.duplicates.length === 0));
});

test("duplicate history merges by date without inflating count progress", () => {
  const result = mergeDefaultHabitEntries([
    { id: "entry-new", habit_id: "duplicate", date: "2026-09-08", value: 40, created_date: "2026-09-08T10:05:00Z" },
    { id: "entry-old", habit_id: "canonical", date: "2026-09-08", value: 70, created_date: "2026-09-08T10:00:00Z" },
    { id: "entry-done", habit_id: "duplicate", date: "2026-09-08", value: 100, done: true, created_date: "2026-09-08T10:10:00Z" }
  ], { id: "canonical", kind: "count", target_value: 100 });

  assert.equal(result.canonical.id, "entry-old");
  assert.deepEqual(result.fields, { habit_id: "canonical", value: 100, done: true });
  assert.deepEqual(result.duplicates.map((entry) => entry.id), ["entry-new", "entry-done"]);
});

test("default provisioning is authenticated, user-scoped, and client seeding is centralized", () => {
  const backend = readFileSync(
    resolve(repoRoot, "base44/functions/ensureDefaultHabits/entry.ts"),
    "utf8"
  );
  const client = readFileSync(resolve(repoRoot, "src/lib/RecompContext.jsx"), "utf8");

  assert.match(backend, /user = await base44\.auth\.me\(\)/);
  assert.match(backend, /enqueueByUser\(user\.id/);
  assert.doesNotMatch(backend, /asServiceRole/);
  assert.match(backend, /mergeDuplicateEntries/);
  assert.match(backend, /habit_entries: habitEntries/);
  assert.match(client, /functions\.invoke\("ensureDefaultHabits"/);
  assert.match(client, /ensured\?\.data\?\.habit_entries/);
  assert.doesNotMatch(client, /Habit\.create\(\{ name: "Water"/);
});
