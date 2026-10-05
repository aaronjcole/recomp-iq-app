import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_HABITS } from "../../base44/shared/defaultHabitsDomain.js";
import {
  ENTRY_PAGE_SIZE,
  assignSystemKey,
  ensureDefaults
} from "../../base44/shared/defaultHabitsProvisioning.js";
import { fakeBase44Client } from "./fakeBase44Client.js";

// Executes ensureDefaultHabits' provisioning against an admin-visibility fake:
// every user's rows are readable, so only the code's own owner scoping keeps
// the caller's reconciliation on the caller's data.

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CALLER = { id: "user-caller" };
const OTHER = "user-other";

function legacyTrio(ownerId, prefix, day) {
  return DEFAULT_HABITS.map(({ system_key: _key, ...definition }, index) => ({
    ...definition,
    id: `${prefix}-${index}`,
    created_by_id: ownerId,
    created_date: `2026-08-0${day}T0${index}:00:00.000Z`
  }));
}

test("an empty account is seeded once, and each starter is keyed only after its owner is verified", async () => {
  const theirs = legacyTrio(OTHER, "theirs", 1);
  const base44 = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: theirs } });
  const result = await ensureDefaults(base44, CALLER);

  const mine = base44.store.Habit.filter((habit) => habit.created_by_id === CALLER.id);
  assert.deepEqual(mine.map((habit) => habit.system_key), DEFAULT_HABITS.map((habit) => habit.system_key));
  assert.deepEqual(result.habits.map((habit) => habit.name), ["Water", "Read", "Meditate"]);
  assert.ok(result.habits.every((habit) => habit.created_by_id === CALLER.id));
  // The client never claims a starter identity; the key is set by the service role.
  for (const create of base44.calls.filter((call) => call.method === "create")) {
    assert.equal(create.scope, "user");
    assert.equal(Object.hasOwn(create.args[0], "system_key"), false);
  }
  const serviceCalls = base44.calls.filter((call) => call.scope === "service");
  assert.deepEqual(serviceCalls.map((call) => call.method), ["get", "update", "get", "update", "get", "update"]);
  assert.ok(serviceCalls.every((call) => mine.some((habit) => habit.id === call.args[0])));
  // Another account's starter trio is untouched.
  assert.deepEqual(base44.store.Habit.filter((habit) => habit.created_by_id === OTHER), theirs);
  assert.equal(result.observed_duplicates, 0);
});

test("the service role refuses to key a habit the caller does not own", async () => {
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: { Habit: [{ id: "habit-theirs", name: "Water", created_by_id: OTHER }] }
  });
  await assert.rejects(
    assignSystemKey(base44, CALLER, { id: "habit-theirs" }, "default_water"),
    /ownership could not be verified/
  );
  const unowned = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: [{ id: "habit-x" }] } });
  await assert.rejects(assignSystemKey(unowned, CALLER, { id: "habit-x" }, "default_water"), /ownership/);
  assert.equal(base44.writes().length + unowned.writes().length, 0);
});

test("raced starter batches collapse into the oldest habit and move every page of history", async () => {
  const first = legacyTrio(CALLER.id, "first", 1);
  const raced = legacyTrio(CALLER.id, "raced", 2);
  const theirs = legacyTrio(OTHER, "theirs", 1);
  // More duplicate-water history than one page, each on its own day.
  const history = Array.from({ length: ENTRY_PAGE_SIZE + 2 }, (_, index) => ({
    id: `entry-${index}`,
    habit_id: "raced-0",
    created_by_id: CALLER.id,
    date: new Date(Date.UTC(2025, 0, 1) + index * 86_400_000).toISOString().slice(0, 10),
    value: 20,
    created_date: `2026-08-02T00:00:${String(index % 60).padStart(2, "0")}.000Z`
  }));
  const theirEntry = { id: "entry-theirs", habit_id: "raced-0", created_by_id: OTHER, date: "2025-01-01", value: 999 };
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: { Habit: [...theirs, ...first, ...raced], HabitEntry: [...history, theirEntry] }
  });

  const result = await ensureDefaults(base44, CALLER);
  assert.equal(result.observed_duplicates, 3);
  assert.equal(result.cleanup_pending, 0);
  assert.deepEqual(result.habits.map((habit) => habit.id), ["first-0", "first-1", "first-2"]);
  assert.deepEqual(
    base44.store.Habit.filter((habit) => habit.created_by_id === CALLER.id).map((habit) => habit.system_key),
    DEFAULT_HABITS.map((habit) => habit.system_key)
  );
  const moved = base44.store.HabitEntry.filter((entry) => entry.created_by_id === CALLER.id);
  assert.equal(moved.length, ENTRY_PAGE_SIZE + 2, "entries beyond the first page are merged too");
  assert.ok(moved.every((entry) => entry.habit_id === "first-0"));
  // Paging advanced through skip, and every entry read named the caller.
  const entryReads = base44.calls.filter((call) => call.entity === "HabitEntry" && call.method === "filter");
  assert.ok(entryReads.some((call) => call.args[3] === ENTRY_PAGE_SIZE));
  assert.ok(entryReads.every((call) => call.args[0].created_by_id === CALLER.id));
  // Another account's rows are never merged, rewritten or deleted.
  assert.deepEqual(base44.store.HabitEntry.find((entry) => entry.id === "entry-theirs"), theirEntry);
  assert.deepEqual(base44.store.Habit.filter((habit) => habit.created_by_id === OTHER), theirs);
  assert.ok(result.habit_entries.every((entry) => entry.created_by_id === CALLER.id));
});

test("another owner's starter habits are never reconciled even if a read returns them", async () => {
  // Defense in depth: the reconciliation planner is owner-scoped on its own,
  // so a store that ignores the owner condition still cannot make an older
  // foreign trio canonical or schedule it for deletion.
  const theirs = legacyTrio(OTHER, "theirs", 1);
  const mine = legacyTrio(CALLER.id, "mine", 2);
  const base44 = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: [...theirs, ...mine] }, leak: { Habit: theirs } });
  const result = await ensureDefaults(base44, CALLER);
  assert.equal(result.observed_duplicates, 0);
  assert.deepEqual(base44.store.Habit.filter((habit) => habit.created_by_id === OTHER), theirs);
  for (const call of base44.writes()) {
    assert.ok(!String(call.args[0]).startsWith("theirs-"), `${call.scope}.${call.method} touched ${call.args[0]}`);
  }
});

test("another owner's history is never merged or deleted even if a read returns it", async () => {
  const theirEntry = { id: "entry-theirs", habit_id: "raced-0", created_by_id: OTHER, date: "2026-09-01", value: 999, created_date: "2026-01-01T00:00:00.000Z" };
  const mineEntry = { id: "entry-mine", habit_id: "raced-0", created_by_id: CALLER.id, date: "2026-09-01", value: 30, created_date: "2026-09-01T00:00:00.000Z" };
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: {
      Habit: [...legacyTrio(CALLER.id, "first", 1), ...legacyTrio(CALLER.id, "raced", 2)],
      HabitEntry: [theirEntry, mineEntry]
    },
    leak: { HabitEntry: [theirEntry] }
  });
  await ensureDefaults(base44, CALLER);
  assert.deepEqual(base44.store.HabitEntry.find((entry) => entry.id === "entry-theirs"), theirEntry);
  assert.equal(base44.store.HabitEntry.find((entry) => entry.id === "entry-mine").habit_id, "first-0");
  assert.ok(base44.writes().every((call) => call.args[0] !== "entry-theirs"));
});

test("a failed duplicate cleanup is reported as pending and the duplicate is kept", async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const base44 = fakeBase44Client({
      callerId: CALLER.id,
      tables: { Habit: [...legacyTrio(CALLER.id, "first", 1), ...legacyTrio(CALLER.id, "raced", 2)] },
      fail: { "user.Habit.delete": (id) => (id === "raced-1" ? new Error("transient") : null) }
    });
    const result = await ensureDefaults(base44, CALLER);
    assert.equal(result.observed_duplicates, 3);
    assert.equal(result.cleanup_pending, 1);
    assert.ok(result.habits.some((habit) => habit.id === "raced-1"));
    assert.ok(!result.habits.some((habit) => habit.id === "raced-0"));
  } finally {
    console.warn = original;
  }
});

test("a custom-only account is not reseeded", async () => {
  const custom = { id: "custom-1", name: "Stretch", kind: "check", sort_order: 4, created_by_id: CALLER.id };
  const base44 = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: [custom] } });
  const result = await ensureDefaults(base44, CALLER);
  assert.deepEqual(result.habits.map((habit) => habit.id), ["custom-1"]);
  assert.deepEqual(base44.writes(), []);
});

test("ensureDefaultHabits authenticates and serializes provisioning per user", () => {
  // Wiring only: provisioning itself is executed above.
  const entry = readFileSync(resolve(repoRoot, "base44/functions/ensureDefaultHabits/entry.ts"), "utf8");
  assert.match(entry, /user = await base44\.auth\.me\(\)/);
  assert.match(entry, /enqueueByUser\(user\.id, \(\) => ensureDefaults\(base44, user\)\)/);
});
