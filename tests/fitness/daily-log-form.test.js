import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyLogPatch,
  formNumber,
  validateDailyLogForm,
  DAILY_LOG_NUMBER_RANGES
} from "../../src/lib/dailyLogForm.js";
import { normalizeTrackingRequest, TrackingRequestError } from "../../base44/shared/trackingRecordDomain.js";
import { elapsedSecondsSince } from "../../src/lib/workoutTimer.js";

const SIMPLE_KEYS = ["weight_lbs", "sleep_hours", "calories", "protein_g", "steps"];

test("formNumber treats blanks as unlogged", () => {
  assert.equal(formNumber(""), null);
  assert.equal(formNumber("  "), null);
  assert.equal(formNumber(null), null);
  assert.equal(formNumber(undefined), null);
  assert.equal(formNumber("182.4"), 182.4);
  assert.equal(formNumber(0), 0);
});

test("validation rejects the same out-of-range values the server does", () => {
  const errors = validateDailyLogForm(
    { weight_lbs: "35", steps: "250000", sleep_hours: "25", calories: "2100", protein_g: "" },
    SIMPLE_KEYS
  );
  assert.deepEqual(Object.keys(errors).sort(), ["sleep_hours", "steps", "weight_lbs"]);
  assert.match(errors.steps, /0 to 200,000/);

  for (const [field, { min, max }] of Object.entries(DAILY_LOG_NUMBER_RANGES)) {
    for (const [value, ok] of [[min, true], [max, true], [min - 1, false], [max + 1, false]]) {
      const clientOk = Object.keys(validateDailyLogForm({ [field]: String(value) }, [field])).length === 0;
      assert.equal(clientOk, ok, `${field}=${value} client`);
      let serverOk = true;
      try {
        normalizeTrackingRequest({ kind: "daily_log", date: "2026-10-01", fields: { [field]: value } }, "user-1");
      } catch (error) {
        assert.ok(error instanceof TrackingRequestError);
        serverOk = false;
      }
      assert.equal(serverOk, ok, `${field}=${value} server`);
    }
  }
});

test("validation only checks the keys being saved and caps notes", () => {
  assert.deepEqual(validateDailyLogForm({ waist_in: "5" }, SIMPLE_KEYS), {});
  assert.ok(validateDailyLogForm({ notes: "x".repeat(4001) }, ["notes"]).notes);
  assert.deepEqual(validateDailyLogForm({ notes: "x".repeat(4000) }, ["notes"]), {});
});

test("clearing a stored field sends explicit null; already-empty fields are omitted", () => {
  const previous = { date: "2026-10-01", weight_lbs: 182, steps: 9000, notes: "ok" };
  const form = { weight_lbs: "", sleep_hours: "", calories: "2100", protein_g: "", steps: "9500" };
  assert.deepEqual(buildDailyLogPatch(form, previous, SIMPLE_KEYS), {
    weight_lbs: null,
    calories: 2100,
    steps: 9500
  });
});

test("an all-empty save with nothing to clear is an empty patch", () => {
  const form = { weight_lbs: "", sleep_hours: "", calories: "", protein_g: "", steps: "" };
  assert.deepEqual(buildDailyLogPatch(form, null, SIMPLE_KEYS), {});
  assert.deepEqual(buildDailyLogPatch(form, { date: "2026-10-01", waist_in: 32 }, SIMPLE_KEYS), {});
});

test("full mode clears notes and workout_completed only when they were stored", () => {
  const keys = ["notes", "workout_completed", "hunger_rating"];
  assert.deepEqual(
    buildDailyLogPatch({ notes: "", workout_completed: false, hunger_rating: "" }, { notes: "tired", workout_completed: true }, keys),
    { notes: null, workout_completed: false }
  );
  assert.deepEqual(buildDailyLogPatch({ notes: "", workout_completed: false, hunger_rating: "" }, {}, keys), {});
  assert.deepEqual(
    buildDailyLogPatch({ notes: "good", workout_completed: true, hunger_rating: 3 }, null, keys),
    { notes: "good", workout_completed: true, hunger_rating: 3 }
  );
});

test("every patch the form builds is accepted by the server request rules", () => {
  const patch = buildDailyLogPatch(
    { weight_lbs: "", sleep_hours: "7.5", calories: "2100", protein_g: "", steps: "" },
    { weight_lbs: 182, steps: 12 },
    SIMPLE_KEYS
  );
  const request = normalizeTrackingRequest({ kind: "daily_log", date: "2026-10-01", fields: patch }, "user-1");
  assert.deepEqual(request.fields, { weight_lbs: null, sleep_hours: 7.5, calories: 2100, steps: null });
});

test("workout elapsed time comes from the wall clock, not tick counts", () => {
  const start = 1_000_000;
  assert.equal(elapsedSecondsSince(start, start + 60 * 60 * 1000 + 999), 3600);
  assert.equal(elapsedSecondsSince(start, start - 5000), 0);
  assert.equal(elapsedSecondsSince(null, start), 0);
});
