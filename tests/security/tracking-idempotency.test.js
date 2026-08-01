import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAILY_LOG_FIELDS,
  HABIT_ENTRY_FIELDS,
  TrackingRequestError,
  normalizeTrackingRequest,
  reconcileTrackingRecords
} from "../../base44/shared/trackingRecordDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("tracking requests are normalized into server-controlled domain keys", () => {
  const daily = normalizeTrackingRequest({
    kind: "daily_log",
    date: "2026-08-01",
    fields: { calories: 1900, workout_completed: true }
  });
  assert.deepEqual(daily.query, { date: "2026-08-01" });
  assert.deepEqual(daily.createData, {
    date: "2026-08-01",
    calories: 1900,
    workout_completed: true
  });
  assert.equal(daily.queueKey, "daily_log:2026-08-01");
  assert.equal(daily.mutableFields, DAILY_LOG_FIELDS);

  const habit = normalizeTrackingRequest({
    kind: "habit_entry",
    habit_id: " habit-123 ",
    date: "2026-08-01",
    fields: { value: 80, done: false }
  });
  assert.deepEqual(habit.query, { habit_id: "habit-123", date: "2026-08-01" });
  assert.equal(habit.queueKey, "habit_entry:habit-123:2026-08-01");
  assert.equal(habit.mutableFields, HABIT_ENTRY_FIELDS);
});

test("tracking requests reject invalid dates, fields, and schema bounds", () => {
  const invalidRequests = [
    { kind: "daily_log", date: "2026-02-30", fields: { calories: 1900 } },
    { kind: "daily_log", date: "2026-08-01", fields: {} },
    { kind: "daily_log", date: "2026-08-01", fields: { created_by_id: "other" } },
    { kind: "daily_log", date: "2026-08-01", fields: { hunger_rating: 6 } },
    { kind: "habit_entry", habit_id: "", date: "2026-08-01", fields: { done: true } },
    { kind: "habit_entry", habit_id: "habit-1", date: "2026-08-01", fields: { value: -1 } },
    { kind: "unknown", date: "2026-08-01", fields: { done: true } }
  ];

  for (const request of invalidRequests) {
    assert.throws(() => normalizeTrackingRequest(request), TrackingRequestError);
  }
});

test("daily log nulls are represented as explicit field removals", () => {
  const request = normalizeTrackingRequest({
    kind: "daily_log",
    date: "2026-08-01",
    fields: { weight_lbs: null, calories: 1800 }
  });
  const result = reconcileTrackingRecords(
    [{ id: "record-a", weight_lbs: 190, calories: 1700 }],
    request.fields,
    request.mutableFields
  );

  assert.deepEqual(result.fields, { calories: 1800 });
  assert.deepEqual(result.unsetFields, ["weight_lbs"]);
  assert.deepEqual(request.createData, { date: "2026-08-01", calories: 1800 });
});

test("duplicate tracking records reconcile into the stable oldest record", () => {
  const result = reconcileTrackingRecords(
    [
      {
        id: "record-b",
        created_date: "2026-08-01T10:05:00.000Z",
        calories: 1800,
        protein_g: 140
      },
      {
        id: "record-a",
        created_date: "2026-08-01T10:00:00.000Z",
        calories: 1700,
        steps: 9000
      },
      {
        id: "record-c",
        created_date: "2026-08-01T10:10:00.000Z",
        protein_g: 150
      },
      // Repeated query results must not turn into a duplicate delete.
      { id: "record-a", created_date: "2026-08-01T10:00:00.000Z", steps: 9000 }
    ],
    { calories: 1900 },
    DAILY_LOG_FIELDS
  );

  assert.equal(result.canonical.id, "record-a");
  assert.deepEqual(
    result.duplicates.map((record) => record.id),
    ["record-b", "record-c"]
  );
  assert.deepEqual(result.fields, { calories: 1900, steps: 9000, protein_g: 150 });
  assert.deepEqual(result.unsetFields, []);
});

test("tracking writes stay behind an authenticated user-scoped backend function", () => {
  const backend = readFileSync(
    resolve(repoRoot, "base44/functions/upsertTrackingRecord/entry.ts"),
    "utf8"
  );
  const client = readFileSync(resolve(repoRoot, "src/lib/RecompContext.jsx"), "utf8");

  assert.match(backend, /user = await base44\.auth\.me\(\)/);
  assert.match(backend, /`\$\{user\.id\}:\$\{request\.queueKey\}`/);
  assert.doesNotMatch(backend, /asServiceRole/);
  assert.equal(client.match(/functions\.invoke\("upsertTrackingRecord"/g)?.length, 2);
  assert.doesNotMatch(client, /DailyLog\.(?:create|update)\(/);
  assert.doesNotMatch(client, /HabitEntry\.(?:create|update)\(/);
});

test("function helpers use Base44's supported shared-code directory", () => {
  const backend = readFileSync(
    resolve(repoRoot, "base44/functions/upsertTrackingRecord/entry.ts"),
    "utf8"
  );

  assert.match(backend, /from "\.\.\/\.\.\/shared\/trackingRecordDomain\.js"/);
});
