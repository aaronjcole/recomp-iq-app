import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NUTRITION_OPERATION_RECEIPTS_FIELD as RECEIPTS,
  TrackingRequestError,
  normalizeTrackingRequest
} from "../../base44/shared/trackingRecordDomain.js";
import { persistTrackingRecord } from "../../base44/shared/trackingRecordPersistence.js";
import { invokeFoodNutritionUpdate } from "../../src/lib/foodNutritionSync.js";
import { fakeBase44Client } from "./fakeBase44Client.js";

const OWNER = "owner-a", OTHER = "owner-b", DATE = "2026-10-22";
const operationId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const FIRST = operationId(1), SECOND = operationId(2);
const schema = JSON.parse(readFileSync(new URL("../../base44/entities/DailyLog.jsonc", import.meta.url), "utf8"));
const row = (extra = {}) => ({
  id: "day-a", created_by_id: OWNER, date: DATE,
  created_date: "2026-10-22T00:00:00Z", updated_date: "2026-10-22T00:00:00Z",
  calories: 100, protein_g: 10, ...extra
});

function fixture(rows = [row()]) {
  const client = fakeBase44Client({ callerId: OWNER, tables: {
    DailyLog: structuredClone(rows),
    Habit: [{ id: "habit-a", created_by_id: OWNER }]
  } });
  // Exercise the real entity schema's receipt validation and atomic row patch.
  // The shared fake intentionally does not maintain updated_date itself.
  const entity = client.entities.DailyLog;
  let tick = 0;
  const update = entity.update.bind(entity);
  entity.update = async (id, patch) => {
    if (patch[RECEIPTS] !== undefined) {
      const definition = schema.properties[RECEIPTS];
      assert.equal(definition.type, "array");
      assert.ok(Array.isArray(patch[RECEIPTS]));
      if (definition.maxItems !== undefined) assert.ok(patch[RECEIPTS].length <= definition.maxItems);
      for (const receipt of patch[RECEIPTS]) {
        assert.equal(typeof receipt, definition.items.type);
        assert.ok(receipt.length <= definition.items.maxLength);
        assert.match(receipt, new RegExp(definition.items.pattern));
      }
    }
    return update(id, { ...patch, updated_date: new Date(Date.UTC(2030, 0, 1, 0, 0, ++tick)).toISOString() });
  };
  const scoped = new Proxy(client.entities, {
    get: (target, name) => name === "DailyLog" ? entity : target[name]
  });
  return { ...client, entities: scoped };
}

const increment = (nutrition_operation_id = FIRST, increments = { calories: 300, protein_g: 20 }) => ({
  kind: "daily_log", date: DATE, increments,
  ...(nutrition_operation_id === undefined ? {} : { nutrition_operation_id })
});
const status = (nutrition_operation_id = FIRST, date = DATE) => ({ kind: "nutrition_operation_status", date, nutrition_operation_id });
const execute = (client, body, owner = OWNER) => persistTrackingRecord(client, { id: owner }, normalizeTrackingRequest(body, owner));

test("normalizer validates and canonicalizes IDs and puts status behind the same owner/date queue", () => {
  const id = "ABCDEF12-3456-4789-ABCD-123456789ABC";
  const write = normalizeTrackingRequest(increment(id), OWNER);
  const read = normalizeTrackingRequest(status(id), OWNER);
  assert.equal(write.nutritionOperationId, id.toLowerCase());
  assert.equal(read.nutritionOperationId, write.nutritionOperationId);
  assert.equal(read.kind, "daily_log");
  assert.equal(read.statusOnly, true);
  assert.equal(read.queueKey, write.queueKey);
  assert.deepEqual(read.query, { created_by_id: OWNER, date: DATE });
  assert.equal(read.createData, undefined);
});

for (const invalid of [null, "", "123", 42, [], {}, " ".repeat(36), `${FIRST} `, `${FIRST}\n`, FIRST.replaceAll("-", ""), "g".repeat(36)]) {
  test(`invalid operation ID is rejected before persistence: ${JSON.stringify(invalid)}`, async () => {
    const client = fixture();
    for (const body of [increment(invalid), status(invalid)]) {
      await assert.rejects(async () => execute(client, body), TrackingRequestError);
    }
    assert.deepEqual(client.calls, []);
  });
}

test("operation IDs cannot accompany summary-only, zero-increment, or habit writes", () => {
  for (const body of [
    { kind: "daily_log", date: DATE, fields: { calories: 500 }, nutrition_operation_id: FIRST },
    { ...increment(), fields: { notes: null } },
    increment(FIRST, { calories: 0 }),
    { kind: "habit_entry", date: DATE, habit_id: "habit-a", fields: { done: true }, nutrition_operation_id: FIRST }
  ]) assert.throws(() => normalizeTrackingRequest(body, OWNER), TrackingRequestError);
});

for (const initiallyEmpty of [false, true]) {
  test(`commit then response loss then retry has one effect (${initiallyEmpty ? "new" : "existing"} day)`, async () => {
    const client = fixture(initiallyEmpty ? [] : [row()]);
    const update = client.entities.DailyLog.update;
    let loseResponse = true;
    client.entities.DailyLog.update = async (...args) => {
      const saved = await update(...args);
      if (loseResponse) { loseResponse = false; throw new Error("response lost AFTER commit"); }
      return saved;
    };
    await assert.rejects(execute(client, increment()), /AFTER commit/);
    const committed = client.store.DailyLog[0];
    assert.equal(committed.calories, initiallyEmpty ? 300 : 400);
    assert.deepEqual(committed[RECEIPTS], [FIRST]);
    const writesBeforeStatus = client.writes().length;
    const confirmation = await execute(client, status());
    assert.equal(confirmation.nutrition_operation_applied, true);
    assert.equal(confirmation.nutrition_operation_id, FIRST);
    assert.equal(client.writes().length, writesBeforeStatus);
    const retry = await execute(client, increment());
    assert.equal(retry.record.calories, committed.calories);
    assert.equal(retry.record.protein_g, initiallyEmpty ? 20 : 30);
    assert.equal(retry.nutrition_operation_id, FIRST);
    assert.equal(retry.nutrition_operation_applied, true);
    assert.deepEqual(retry.record[RECEIPTS], [FIRST]);
    const patch = client.calls.find((call) => call.entity === "DailyLog" && call.method === "update").args[1];
    assert.equal(patch.calories, initiallyEmpty ? 300 : 400);
    assert.deepEqual(patch[RECEIPTS], [FIRST], "receipt must be in the SAME committed totals patch");
  });
}

test("failure before commit stores neither receipt nor effect; confirmed absence can be retried", async () => {
  const client = fixture();
  const update = client.entities.DailyLog.update;
  client.entities.DailyLog.update = async () => { throw new Error("before commit"); };
  await assert.rejects(execute(client, increment()), /before commit/);
  assert.equal(client.store.DailyLog[0].calories, 100);
  assert.equal(client.store.DailyLog[0][RECEIPTS], undefined);
  const confirmation = await execute(client, status());
  assert.equal(confirmation.nutrition_operation_applied, false);
  client.entities.DailyLog.update = update;
  assert.equal((await execute(client, increment())).record.calories, 400);
});

test("different operation IDs apply twice; replaying either never applies again", async () => {
  const client = fixture();
  await execute(client, increment());
  await execute(client, increment(SECOND));
  await execute(client, increment());
  const result = await execute(client, increment(SECOND));
  assert.equal(result.record.calories, 700);
  assert.deepEqual(result.record[RECEIPTS], [FIRST, SECOND]);
});

test("negative nutrition operations are also applied only once", async () => {
  const client = fixture([row({ calories: 1000 })]);
  await execute(client, increment(FIRST, { calories: -200 }));
  const replay = await execute(client, increment(FIRST, { calories: -200 }));
  assert.equal(replay.record.calories, 800);
  assert.deepEqual(replay.record[RECEIPTS], [FIRST]);
});

test("receipts and status are isolated by owner AND date, even with admin-style visibility", async () => {
  const tomorrow = "2026-10-23";
  const client = fixture([
    row({ [RECEIPTS]: [FIRST] }),
    row({ id: "day-b", created_by_id: OTHER }),
    row({ id: "tomorrow-a", date: tomorrow })
  ]);
  assert.equal((await execute(client, status(), OTHER)).nutrition_operation_applied, false);
  assert.equal((await execute(client, status(FIRST, tomorrow))).nutrition_operation_applied, false);
  assert.equal((await execute(client, increment(), OTHER)).record.calories, 400);
  assert.equal((await execute(client, { ...increment(), date: tomorrow })).record.calories, 400);
  assert.equal(client.store.DailyLog.find((item) => item.id === "day-a").calories, 100);
});

test("status on an empty day is strictly read-only, even if write payloads are supplied", async () => {
  const client = fixture([]);
  const result = await execute(client, { ...status(), fields: { calories: 900 }, increments: { calories: 900 }, [RECEIPTS]: [FIRST] });
  assert.deepEqual(result, { record: null, nutrition_operation_applied: false, nutrition_operation_id: FIRST });
  assert.deepEqual(client.store.DailyLog, []);
  assert.deepEqual(client.writes(), []);
});

test("status merges divergent duplicate totals without updating or cleaning up any row", async () => {
  const client = fixture([
    row({ weight_lbs: 180, carbs_g: 20, fat_g: 5 }),
    row({ id: "later", created_date: "2026-10-22T01:00:00Z", updated_date: "2026-10-22T02:00:00Z",
      calories: 400, protein_g: 30, carbs_g: 60, fat_g: 10, [RECEIPTS]: [FIRST] })
  ]);
  const before = structuredClone(client.store);
  const result = await execute(client, status());
  assert.equal(result.record.id, "day-a");
  assert.equal(result.record.date, DATE);
  assert.equal(result.record.created_by_id, OWNER);
  assert.equal(result.record.calories, 400);
  assert.equal(result.record.protein_g, 30);
  assert.equal(result.record.carbs_g, 60);
  assert.equal(result.record.fat_g, 10);
  assert.equal(result.record.weight_lbs, 180, "fields absent from the newer duplicate still survive");
  assert.equal(result.nutrition_operation_applied, true);
  assert.deepEqual(client.store, before);
  assert.deepEqual(client.writes(), []);
});

test("the real food helper recovers divergent duplicate totals from status without retrying an increment", async () => {
  // The later row already contains the committed operation whose response was lost.
  const client = fixture([
    row(),
    row({ id: "later", created_date: "2026-10-22T01:00:00Z", updated_date: "2026-10-22T02:00:00Z",
      calories: 400, protein_g: 30, [RECEIPTS]: [FIRST] })
  ]);
  const before = structuredClone(client.store);
  const calls = [];
  const functions = { async invoke(name, body) {
    assert.equal(name, "upsertTrackingRecord");
    calls.push(structuredClone(body));
    if (body.kind === "daily_log") throw Object.assign(new Error("Committed response lost"), { status: 503 });
    return { data: await execute(client, body) };
  } };
  const body = increment();
  const response = await invokeFoodNutritionUpdate(functions, body);
  assert.equal(response.data.nutrition_operation_applied, true);
  assert.equal(response.data.nutrition_operation_id, FIRST);
  assert.equal(response.data.record.id, "day-a");
  assert.equal(response.data.record.calories, 400);
  assert.equal(response.data.record.protein_g, 30);
  assert.deepEqual(calls, [body, status()], "one original increment and one read-only lookup, with no replay");
  assert.deepEqual(client.store, before);
  assert.deepEqual(client.writes(), []);
});

test("duplicate canonical reconciliation unions receipts before cleanup and detects replay on a duplicate", async () => {
  const client = fixture([
    row({ [RECEIPTS]: [SECOND] }),
    row({ id: "later", created_date: "2026-10-22T01:00:00Z", calories: 400, [RECEIPTS]: [FIRST] })
  ]);
  const result = await execute(client, increment());
  assert.equal(result.record.id, "day-a");
  assert.equal(result.record.calories, 400);
  assert.deepEqual(new Set(result.record[RECEIPTS]), new Set([FIRST, SECOND]));
  assert.equal(client.store.DailyLog.length, 1);
  assert.equal((await execute(client, increment(SECOND))).record.calories, 400);
});

test("failed duplicate cleanup cannot erase receipts or reapply an increment on retry", async (context) => {
  const client = fixture([
    row({ [RECEIPTS]: [SECOND] }),
    row({ id: "later", created_date: "2026-10-22T01:00:00Z", calories: 200 })
  ]);
  context.mock.method(console, "warn", () => {});
  const remove = client.entities.DailyLog.delete.bind(client.entities.DailyLog);
  client.entities.DailyLog.delete = async () => { throw new Error("cleanup unavailable"); };
  const first = await execute(client, increment());
  assert.equal(first.cleanup_pending, 1);
  assert.equal(first.record.calories, 500);
  client.entities.DailyLog.delete = remove;
  const replay = await execute(client, increment());
  assert.equal(replay.record.calories, 500);
  assert.deepEqual(new Set(replay.record[RECEIPTS]), new Set([FIRST, SECOND]));
  assert.equal(client.store.DailyLog.length, 1);
});

test("receipts on duplicate pages beyond the old 50-row prefix are not missed or deleted", async () => {
  const rows = Array.from({ length: 51 }, (_, index) => row({
    id: `day-${index}`, created_date: new Date(Date.UTC(2026, 9, 22, 0, index)).toISOString(),
    ...(index === 50 ? { [RECEIPTS]: [FIRST] } : {})
  }));
  const client = fixture(rows);
  assert.equal((await execute(client, status())).nutrition_operation_applied, true);
  assert.deepEqual(client.writes(), []);
  const result = await execute(client, increment());
  assert.equal(result.record.calories, 100);
  assert.deepEqual(result.record[RECEIPTS], [FIRST]);
  assert.equal(client.store.DailyLog.length, 1);
});

test("excess duplicate rows reject before mutation rather than losing unseen receipts", async () => {
  const client = fixture(Array.from({ length: 1001 }, (_, index) => row({ id: `day-${index}` })));
  await assert.rejects(execute(client, increment()), /Too many duplicate daily logs/);
  await assert.rejects(execute(client, status()), /Too many duplicate daily logs/);
  assert.deepEqual(client.writes(), []);
  assert.equal(client.store.DailyLog.length, 1001);
});

test("old receipts are never evicted and still protect old retries", async () => {
  const ids = Array.from({ length: 1500 }, (_, index) => operationId(index + 1));
  const client = fixture([row({ [RECEIPTS]: ids })]);
  const result = await execute(client, increment(operationId(1501)));
  assert.equal(result.record[RECEIPTS].length, 1501);
  assert.equal((await execute(client, increment(FIRST))).record.calories, 400);
});

test("manual writes, explicit unsets, legacy increments, and habits retain their existing semantics", async () => {
  const client = fixture([row({ [RECEIPTS]: [FIRST], notes: "old" })]);
  const manual = await execute(client, { kind: "daily_log", date: DATE, fields: { calories: 600, notes: null } });
  assert.equal(manual.record.calories, 600);
  assert.equal(manual.record.notes, undefined);
  assert.deepEqual(manual.record[RECEIPTS], [FIRST]);
  const legacy = { kind: "daily_log", date: DATE, increments: { calories: 100 } };
  await execute(client, legacy);
  assert.equal((await execute(client, legacy)).record.calories, 800);
  assert.equal((await execute(client, increment(FIRST))).record.calories, 800);
  const habit = await execute(client, { kind: "habit_entry", date: DATE, habit_id: "habit-a", fields: { done: true } });
  assert.equal(habit.record.done, true);
  assert.equal(habit.record[RECEIPTS], undefined);
});

test("caller-provided receipt metadata cannot erase or forge server receipts through the normalizer", async () => {
  const client = fixture([row({ [RECEIPTS]: [FIRST] })]);
  await assert.rejects(async () => execute(client, { kind: "daily_log", date: DATE, fields: { [RECEIPTS]: [] } }), TrackingRequestError);
  const result = await execute(client, { ...increment(SECOND), [RECEIPTS]: [operationId(999)] });
  assert.deepEqual(result.record[RECEIPTS], [FIRST, SECOND]);
});

test("damaged stored receipts fail closed, without writes or cleanup", async () => {
  for (const damaged of [null, "not-an-array", ["not-an-id"]]) {
    const client = fixture([row({ [RECEIPTS]: damaged })]);
    await assert.rejects(execute(client, increment()), /receipts could not be verified/);
    await assert.rejects(execute(client, status()), /receipts could not be verified/);
    assert.deepEqual(client.writes(), []);
  }
});
