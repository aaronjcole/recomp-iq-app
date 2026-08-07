import test from "node:test";
import assert from "node:assert/strict";

import { strengthTrend } from "../../src/lib/fitness/strengthTrend.js";

test("strength trend requires two valid points spanning at least ten days", () => {
  assert.equal(strengthTrend([{ date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 }]), null);
  assert.equal(
    strengthTrend([
      { date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 },
      { date: "2026-01-10", lift_name: "Bench", estimated_1rm: 220 }
    ]),
    null
  );

  const result = strengthTrend([
    { date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 },
    { date: "2026-01-11", lift_name: "Bench", estimated_1rm: 220 }
  ]);

  assert.equal(result.change_percent, 10);
  assert.equal(result.direction, "up");
  assert.equal(result.confidence, "low");
});

test("strength trend ignores measurements outside the latest 28-day window", () => {
  const result = strengthTrend([
    { date: "2026-01-01", lift_name: "Squat", estimated_1rm: 100 },
    { date: "2026-01-20", lift_name: "Squat", estimated_1rm: 110 },
    { date: "2026-02-17", lift_name: "Squat", estimated_1rm: 121 }
  ]);

  assert.equal(result.change_percent, 10);
  assert.deepEqual(result.per_lift, [{ lift_name: "Squat", change_percent: 10 }]);
});

test("three lifts over three weeks produce a high-confidence aggregate", () => {
  const logs = ["Bench", "Squat", "Deadlift"].flatMap((liftName, index) => [
    { date: "2026-01-01", lift_name: liftName, estimated_1rm: 100 + index * 50 },
    { date: "2026-01-22", lift_name: liftName, estimated_1rm: 110 + index * 55 }
  ]);

  const result = strengthTrend(logs);

  assert.equal(result.lifts_used, 3);
  assert.equal(result.change_percent, 10);
  assert.equal(result.direction, "up");
  assert.equal(result.confidence, "high");
});

test("small changes are flat and invalid records do not add confidence", () => {
  const result = strengthTrend([
    { date: "2026-01-01", lift_name: "Bench", estimated_1rm: 200 },
    { date: "2026-01-15", lift_name: "Bench", estimated_1rm: 202 },
    { date: "2026-01-15", lift_name: "Squat", estimated_1rm: Number.NaN },
    { date: "2026-01-15", estimated_1rm: 300 }
  ]);

  assert.equal(result.direction, "flat");
  assert.equal(result.lifts_used, 1);
});
