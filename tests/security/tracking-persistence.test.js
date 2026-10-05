import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TrackingRequestError,
  normalizeTrackingRequest
} from "../../base44/shared/trackingRecordDomain.js";
import {
  persistTrackingRecord,
  verifyHabitOwnership
} from "../../base44/shared/trackingRecordPersistence.js";
import { fakeBase44Client } from "./fakeBase44Client.js";

// Executes the read-reconcile-write step of upsertTrackingRecord against an
// admin-visibility fake: every row is readable, so only the code's own owner
// checks keep the caller on their own records.

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CALLER = { id: "user-caller" };
const OTHER = "user-other";
const DATE = "2026-10-05";

const dailyLog = (fields) => normalizeTrackingRequest({ kind: "daily_log", date: DATE, fields }, CALLER.id);
const habitEntry = (habitId, fields) =>
  normalizeTrackingRequest({ kind: "habit_entry", habit_id: habitId, date: DATE, fields }, CALLER.id);

test("another owner's habit is reported exactly like a missing one and nothing is written", async () => {
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: { Habit: [{ id: "habit-theirs", created_by_id: OTHER }] }
  });
  for (const habitId of ["habit-theirs", "habit-missing"]) {
    await assert.rejects(
      persistTrackingRecord(base44, CALLER, habitEntry(habitId, { done: true })),
      (error) => error instanceof TrackingRequestError && error.message === "Habit not found",
      habitId
    );
  }
  assert.deepEqual(base44.writes(), []);
  assert.equal(base44.calls.some((call) => call.entity === "HabitEntry"), false);
});

test("habit lookups that fail with an auth status read as not found; other failures propagate", async () => {
  for (const status of [401, 403, 404]) {
    const base44 = fakeBase44Client({
      callerId: CALLER.id,
      fail: { "Habit.get": () => Object.assign(new Error("denied"), { status }) }
    });
    await assert.rejects(verifyHabitOwnership(base44, CALLER, "habit-1"), TrackingRequestError, String(status));
  }
  const outage = Object.assign(new Error("upstream down"), { status: 503 });
  const base44 = fakeBase44Client({ callerId: CALLER.id, fail: { "Habit.get": () => outage } });
  await assert.rejects(verifyHabitOwnership(base44, CALLER, "habit-1"), (error) => error === outage);
  // An unowned record (no created_by_id) never counts as the caller's.
  const unowned = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: [{ id: "habit-1" }] } });
  await assert.rejects(verifyHabitOwnership(unowned, CALLER, "habit-1"), TrackingRequestError);
  const owned = fakeBase44Client({ callerId: CALLER.id, tables: { Habit: [{ id: "habit-1", created_by_id: CALLER.id }] } });
  await assert.doesNotReject(verifyHabitOwnership(owned, CALLER, "habit-1"));
});

test("an owned habit entry is created under the caller and reconciled", async () => {
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: { Habit: [{ id: "habit-mine", created_by_id: CALLER.id }] }
  });
  const result = await persistTrackingRecord(base44, CALLER, habitEntry("habit-mine", { value: 40, done: false }));
  assert.equal(result.record.created_by_id, CALLER.id);
  assert.equal(result.record.habit_id, "habit-mine");
  assert.equal(result.record.value, 40);
  assert.equal(base44.store.HabitEntry.length, 1);
  assert.deepEqual(base44.calls.find((call) => call.method === "get").args, ["habit-mine"]);
});

test("another owner's same-day log is never read, merged, updated or deleted", async () => {
  const theirs = { id: "log-theirs", date: DATE, created_by_id: OTHER, created_date: "2026-10-05T01:00:00Z", calories: 3000 };
  const base44 = fakeBase44Client({ callerId: CALLER.id, tables: { DailyLog: [theirs] } });

  const result = await persistTrackingRecord(base44, CALLER, dailyLog({ calories: 1800 }));
  assert.equal(result.record.created_by_id, CALLER.id);
  assert.equal(result.record.calories, 1800);
  assert.deepEqual(base44.store.DailyLog.find((row) => row.id === "log-theirs"), theirs);
  for (const call of base44.calls.filter((entry) => entry.method === "filter")) {
    assert.equal(call.args[0].created_by_id, CALLER.id, "every lookup names the caller");
  }
  for (const call of base44.writes().filter((entry) => entry.method !== "create")) {
    assert.notEqual(call.args[0], "log-theirs");
  }
  // Writes go through the caller's client, never the service role.
  assert.equal(base44.calls.some((call) => call.scope === "service"), false);
});

test("duplicates merge into the oldest record, newer copies are deleted, and nulls unset owner-scoped", async () => {
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: {
      DailyLog: [
        { id: "log-b", date: DATE, created_by_id: CALLER.id, created_date: "2026-10-05T09:00:00Z", calories: 800, weight_lbs: 181 },
        { id: "log-a", date: DATE, created_by_id: CALLER.id, created_date: "2026-10-05T08:00:00Z", calories: 500, steps: 4000 }
      ]
    }
  });
  const result = await persistTrackingRecord(base44, CALLER, dailyLog({ weight_lbs: null, protein_g: 90 }));

  assert.deepEqual(base44.store.DailyLog.map((row) => row.id), ["log-a"]);
  assert.equal(result.record.id, "log-a");
  assert.equal(result.record.calories, 800, "newest duplicate value wins the merge");
  assert.equal(result.record.steps, 4000);
  assert.equal(result.record.protein_g, 90);
  assert.equal(Object.hasOwn(result.record, "weight_lbs"), false);
  assert.equal(result.observed_duplicates, 1);
  assert.equal(result.cleanup_pending, 0);
  const unset = base44.calls.find((call) => call.method === "updateMany");
  assert.deepEqual(unset.args, [{ id: "log-a", created_by_id: CALLER.id }, { $unset: { weight_lbs: "" } }]);
});

test("nutrition increments add to the stored total through the persistence step", async () => {
  const base44 = fakeBase44Client({
    callerId: CALLER.id,
    tables: { DailyLog: [{ id: "log-a", date: DATE, created_by_id: CALLER.id, created_date: "2026-10-05T08:00:00Z", calories: 600 }] }
  });
  const request = normalizeTrackingRequest({ kind: "daily_log", date: DATE, increments: { calories: 250 } }, CALLER.id);
  const result = await persistTrackingRecord(base44, CALLER, request);
  assert.equal(result.record.calories, 850);
});

test("a failed duplicate delete is reported as pending cleanup, not as a failed save", async () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const base44 = fakeBase44Client({
      callerId: CALLER.id,
      tables: {
        DailyLog: [
          { id: "log-a", date: DATE, created_by_id: CALLER.id, created_date: "2026-10-05T08:00:00Z", calories: 500 },
          { id: "log-b", date: DATE, created_by_id: CALLER.id, created_date: "2026-10-05T09:00:00Z", calories: 600 }
        ]
      },
      fail: { "DailyLog.delete": () => new Error("transient") }
    });
    const result = await persistTrackingRecord(base44, CALLER, dailyLog({ calories: 1900 }));
    assert.equal(result.record.calories, 1900);
    assert.equal(result.cleanup_pending, 1);
  } finally {
    console.warn = original;
  }
});

test("upsertTrackingRecord authenticates, scopes the queue by user, and delegates persistence", () => {
  // Wiring only: the persistence behavior is executed above.
  const entry = readFileSync(resolve(repoRoot, "base44/functions/upsertTrackingRecord/entry.ts"), "utf8");
  const persistence = readFileSync(resolve(repoRoot, "base44/shared/trackingRecordPersistence.js"), "utf8");
  assert.match(entry, /user = await base44\.auth\.me\(\)/);
  assert.match(entry, /normalizeTrackingRequest\(body, user\.id\)/);
  assert.match(entry, /`\$\{user\.id\}:\$\{request\.queueKey\}`/);
  assert.match(entry, /persistTrackingRecord\(base44, user, request\)/);
  assert.doesNotMatch(entry + persistence, /asServiceRole/);
});
