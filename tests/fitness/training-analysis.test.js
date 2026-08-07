import test from "node:test";
import assert from "node:assert/strict";

import { summarizeStrengthProgress } from "../../src/lib/fitness/trainingAnalysis.js";

test("strength progress falls back to estimated one-rep max at both endpoints", () => {
  const result = summarizeStrengthProgress(
    [
      { date: "2026-01-01", lift_name: "Bench", weight: 100, reps: 10 },
      { date: "2026-01-15", lift_name: "Bench", weight: 110, reps: 10 }
    ],
    "Bench"
  );

  assert.deepEqual(result, {
    lift_name: "Bench",
    change_lbs: 14,
    current_estimated_1rm: 147,
    label: "building"
  });
});

test("strength progress ignores other lifts and labels meaningful decline", () => {
  const result = summarizeStrengthProgress(
    [
      { date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 },
      { date: "2026-01-10", lift_name: "Squat", estimated_1rm: 400 },
      { date: "2026-01-15", lift_name: "Bench", estimated_1rm: 190 }
    ],
    "Bench"
  );

  assert.equal(result.change_lbs, -10);
  assert.equal(result.current_estimated_1rm, 190);
  assert.equal(result.label, "declining");
});

test("strength progress returns an explicit need-more-data result", () => {
  assert.deepEqual(
    summarizeStrengthProgress(
      [{ date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 }],
      "Bench"
    ),
    {
      lift_name: "Bench",
      change_lbs: null,
      current_estimated_1rm: 200,
      label: "need_more_data"
    }
  );
});
