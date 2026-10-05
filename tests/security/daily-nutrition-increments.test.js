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
  const context = readFileSync(new URL("../../src/lib/RecompContext.jsx", import.meta.url), "utf8");
  const nutrition = readFileSync(new URL("../../src/pages/Nutrition.jsx", import.meta.url), "utf8");
  assert.match(context, /upsertDailyLog\(date, null, \{ increments \}\)/);
  assert.doesNotMatch(
    context + nutrition,
    /\(current\?\.(calories|protein_g|carbs_g|fat_g) \?\? 0\) \+/,
    "no client path may compute an absolute total from its local copy"
  );
});
