import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSleep } from "../../src/lib/fitness/sleep.js";

test("sleep summary reports a transparent balance across logged nights only", () => {
  const summary = summarizeSleep([
    { date: "2026-08-31", sleep_hours: 6, sleep_quality: 3 },
    { date: "2026-09-01", sleep_hours: 7.5, sleep_quality: 4 },
    { date: "2026-09-02", sleep_hours: 8, sleep_quality: 5 },
    { date: "2026-09-03" }
  ], { referenceDate: "2026-09-03" });

  assert.deepEqual(summary, {
    windowDays: 14,
    referenceHours: 7,
    loggedNights: 3,
    averageHours: 7.2,
    averageQuality: 4,
    balanceHours: 0.5,
    shortNights: 1
  });
});

test("sleep summary deduplicates dates and excludes future and stale entries", () => {
  const summary = summarizeSleep([
    { date: "2026-08-01", sleep_hours: 2 },
    { date: "2026-09-02", sleep_hours: 5, updated_date: "2026-09-02T08:00:00Z" },
    { date: "2026-09-02", sleep_hours: 7, updated_date: "2026-09-02T09:00:00Z" },
    { date: "2026-09-04", sleep_hours: 12 }
  ], { referenceDate: "2026-09-03" });

  assert.equal(summary.loggedNights, 1);
  assert.equal(summary.averageHours, 7);
  assert.equal(summary.balanceHours, 0);
});

test("sleep summary leaves missing sleep unscored", () => {
  const summary = summarizeSleep(
    [{ date: "2026-09-03", energy_rating: 3 }],
    { referenceDate: "2026-09-03" }
  );

  assert.equal(summary.loggedNights, 0);
  assert.equal(summary.averageHours, null);
  assert.equal(summary.averageQuality, null);
  assert.equal(summary.balanceHours, null);
});

