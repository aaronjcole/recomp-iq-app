import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_LOG_INCREMENT_FIELDS,
  TrackingRequestError,
  normalizeTrackingRequest,
  reconcileTrackingRecords
} from "../../base44/shared/trackingRecordDomain.js";

const OWNER = "user-1";
const date = "2026-10-05";

function apply(stored, body) {
  const request = normalizeTrackingRequest({ kind: "daily_log", date, ...body }, OWNER);
  const { canonical, fields } = reconcileTrackingRecords(
    stored,
    request.fields,
    request.mutableFields,
    request.increments
  );
  return { ...canonical, ...fields };
}

test("increments are added to the stored total, never replace it", () => {
  // Phone loaded the day at 0 kcal; the web app has since stored 600.
  const stored = [{ id: "log-1", date, created_by_id: OWNER, created_date: "2026-10-05T08:00:00Z", calories: 600, protein_g: 40 }];
  const saved = apply(stored, { increments: { calories: 700, protein_g: 35 } });
  assert.equal(saved.calories, 1300);
  assert.equal(saved.protein_g, 75);
});

test("increments on a day with no stored total start from zero", () => {
  const saved = apply([{ id: "log-1", date, created_by_id: OWNER, created_date: "2026-10-05T08:00:00Z", weight_lbs: 180 }], {
    increments: { calories: 450 }
  });
  assert.equal(saved.calories, 450);
  assert.equal(saved.weight_lbs, 180);
  assert.equal(saved.protein_g, undefined, "fields that were not incremented stay unset");
});

test("negative increments (edit or delete an entry) floor at zero and round to 0.1", () => {
  const stored = [{ id: "log-1", date, created_by_id: OWNER, created_date: "2026-10-05T08:00:00Z", calories: 100, fat_g: 3.3 }];
  const saved = apply(stored, { increments: { calories: -250, fat_g: 0.1 } });
  assert.equal(saved.calories, 0);
  assert.equal(saved.fat_g, 3.4);
});

test("duplicate records are merged before the increment is applied once", () => {
  const stored = [
    { id: "log-1", date, created_by_id: OWNER, created_date: "2026-10-05T08:00:00Z", updated_date: "2026-10-05T08:00:00Z", calories: 500 },
    { id: "log-2", date, created_by_id: OWNER, created_date: "2026-10-05T09:00:00Z", updated_date: "2026-10-05T09:00:00Z", calories: 800 }
  ];
  const request = normalizeTrackingRequest({ kind: "daily_log", date, increments: { calories: 100 } }, OWNER);
  const { canonical, duplicates, fields } = reconcileTrackingRecords(stored, request.fields, request.mutableFields, request.increments);
  assert.equal(canonical.id, "log-1");
  assert.deepEqual(duplicates.map((row) => row.id), ["log-2"]);
  assert.equal(fields.calories, 900, "newest duplicate value wins the merge, then +100 once");
});

test("a typed absolute total and food increments keep their own meaning", () => {
  const stored = [{ id: "log-1", date, created_by_id: OWNER, created_date: "2026-10-05T08:00:00Z", calories: 1200 }];
  const typed = apply(stored, { fields: { calories: 2000 } });
  assert.equal(typed.calories, 2000);
  const afterFood = apply([typed], { increments: { calories: 150 } });
  assert.equal(afterFood.calories, 2150);
});

test("increment requests are validated", () => {
  const bad = [
    { increments: {} },
    { increments: { calories: 0 } },
    { increments: { steps: 100 } },
    { increments: { calories: Number.NaN } },
    { increments: { calories: 20001 } },
    { increments: { calories: "100" } },
    { increments: [] },
    { fields: { calories: 100 }, increments: { calories: 50 } }
  ];
  for (const body of bad) {
    assert.throws(
      () => normalizeTrackingRequest({ kind: "daily_log", date, ...body }, OWNER),
      TrackingRequestError,
      JSON.stringify(body)
    );
  }
  const mixed = normalizeTrackingRequest(
    { kind: "daily_log", date, fields: { weight_lbs: 180 }, increments: { calories: 50 } },
    OWNER
  );
  assert.deepEqual(mixed.increments, { calories: 50 });
  assert.deepEqual(mixed.fields, { weight_lbs: 180 });
});

test("only nutrition totals can be incremented, and habit entries reject increments", () => {
  assert.deepEqual([...DAILY_LOG_INCREMENT_FIELDS], ["calories", "protein_g", "carbs_g", "fat_g"]);
  const habit = normalizeTrackingRequest(
    { kind: "habit_entry", date, habit_id: "habit-1", fields: { done: true }, increments: { calories: 5 } },
    OWNER
  );
  assert.equal(habit.increments, undefined, "habit entries ignore increments entirely");
});

test("the client sends nutrition changes as increments, never as absolute totals", async () => {
  const { readFileSync } = await import("node:fs");
  const { newNutritionOperationId } = await import("../../src/lib/foodNutritionSync.js");
  const context = readFileSync(new URL("../../src/lib/RecompContext.jsx", import.meta.url), "utf8");
  const nutrition = readFileSync(new URL("../../src/pages/Nutrition.jsx", import.meta.url), "utf8");
  const start = context.indexOf("  const adjustDailyNutrition = useCallback(");
  const end = context.indexOf("  const logFoodEntries = useCallback(", start);
  assert.ok(start >= 0 && end > start, "production nutrition callback is available");
  const calls = [];
  let active = true;
  const adjust = new Function("useCallback", "FOOD_TOTAL_FIELDS", "userIdRef", "assertFoodOwner", "upsertDailyLog", "newNutritionOperationId", "assertFoodDayReady",
    `${context.slice(start, end)}\nreturn adjustDailyNutrition;`
  )((callback) => callback, DAILY_LOG_INCREMENT_FIELDS, { current: OWNER }, (ownerId) => {
    assert.equal(ownerId, OWNER);
    if (!active) throw new Error("Account changed");
  }, async (...args) => { calls.push(args); return { id: "daily-confirmed" }; }, newNutritionOperationId,
  (ownerId, requestedDate) => assert.deepEqual([ownerId, requestedDate], [OWNER, date]));
  await adjust(date, { calories: 150, protein_g: -5, carbs_g: 0, weight_lbs: 999 });
  await adjust(date, { calories: 25 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 2), [date, null], "nutrition must not be sent as an absolute fields patch");
  assert.deepEqual(calls[0][2].increments, { calories: 150, protein_g: -5 });
  assert.match(calls[0][2].nutritionOperationId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
  assert.notEqual(calls[0][2].nutritionOperationId, calls[1][2].nutritionOperationId);
  await adjust(date, { calories: 0 });
  assert.equal(calls.length, 2, "zero increments must not issue a write");
  active = false;
  assert.throws(() => adjust(date, { calories: 10 }), /Account changed/);
  assert.equal(calls.length, 2, "inactive owner must not issue a write");
  assert.doesNotMatch(
    context + nutrition,
    /\(current\?\.(calories|protein_g|carbs_g|fat_g) \?\? 0\) \+/,
    "no client path may compute an absolute total from its local copy"
  );
});
