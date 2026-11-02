import test from "node:test";
import assert from "node:assert/strict";
import { invokeFoodNutritionUpdate, newNutritionOperationId } from "../../src/lib/foodNutritionSync.js";

const operation = "fa3f6fa0-7251-4baa-bb56-2300dcf246d2";
const body = { kind: "daily_log", date: "2026-10-22", increments: { calories: 300 }, nutrition_operation_id: operation };
const failure = () => Object.assign(new Error("Response lost"), { status: 503 });
const receipt = (applied, id = operation) => ({ data: { nutrition_operation_id: id, nutrition_operation_applied: applied, record: applied ? { id: "day-1", calories: 300 } : null } });
function sdk(handler) {
  const calls = [];
  return { calls, async invoke(name, payload) {
    assert.equal(name, "upsertTrackingRecord");
    calls.push(structuredClone(payload));
    return handler(payload, calls.length);
  } };
}

test("food operation IDs are distinct UUIDs", () => {
  const ids = new Set(Array.from({ length: 100 }, newNutritionOperationId));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
});

test("lost success is recovered by read-only receipt without repeating the increment", async () => {
  const functions = sdk((payload) => {
    if (payload.kind === "daily_log") throw failure();
    return receipt(true);
  });
  const result = await invokeFoodNutritionUpdate(functions, body);
  assert.equal(result.data.record.calories, 300);
  assert.equal(functions.calls.filter((call) => call.kind === "daily_log").length, 1);
  assert.deepEqual(functions.calls[1], { kind: "nutrition_operation_status", date: body.date, nutrition_operation_id: operation });
});

test("only a confirmed unapplied receipt permits one retry with the same operation ID", async () => {
  const functions = sdk((payload, index) => {
    if (index === 1) throw failure();
    if (payload.kind === "nutrition_operation_status") return receipt(false);
    return { data: { record: { id: "day-1", calories: 300 } } };
  });
  await invokeFoodNutritionUpdate(functions, body);
  assert.equal(functions.calls.length, 3);
  assert.deepEqual(functions.calls[0], functions.calls[2]);
});

test("two confirmed failed writes remain a normal retryable error, not an ambiguous save", async () => {
  const error = failure();
  const functions = sdk((payload) => {
    if (payload.kind === "daily_log") throw error;
    return receipt(false);
  });
  await assert.rejects(invokeFoodNutritionUpdate(functions, body), (actual) => actual === error && !actual.ambiguousNutrition);
  assert.equal(functions.calls.length, 4);
});

for (const mode of ["legacy backend", "status unavailable", "mismatched receipt", "missing committed record"]) {
  test(`${mode} blocks replay and requires visible reconciliation`, async () => {
    const functions = sdk((payload) => {
      if (payload.kind === "daily_log") throw failure();
      if (mode === "legacy backend") throw Object.assign(new Error("Unknown kind"), { status: 400 });
      if (mode === "status unavailable") throw failure();
      if (mode === "mismatched receipt") return receipt(true, "another-operation");
      return { data: { ...receipt(true).data, record: null } };
    });
    await assert.rejects(invokeFoodNutritionUpdate(functions, body), (error) => error.ambiguousNutrition && error.reconciliationRequired);
    assert.equal(functions.calls.filter((call) => call.kind === "daily_log").length, 1);
  });
}

test("definitive validation/authentication errors do not probe or retry", async () => {
  for (const status of [400, 401, 403, 404, 405, 413, 422, 429]) {
    const functions = sdk(() => { throw Object.assign(new Error("Rejected"), { status }); });
    await assert.rejects(invokeFoodNutritionUpdate(functions, body), (error) => error.status === status);
    assert.equal(functions.calls.length, 1);
  }
});

test("an account switch after a delayed request cannot dispatch a receipt lookup or retry", async () => {
  let active = true;
  const functions = sdk(() => { active = false; throw failure(); });
  await assert.rejects(invokeFoodNutritionUpdate(functions, body, () => {
    if (!active) throw new Error("Account changed");
  }), /Account changed/);
  assert.equal(functions.calls.length, 1);
});
