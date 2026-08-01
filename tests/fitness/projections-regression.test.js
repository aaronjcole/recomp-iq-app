import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateProjectionConfidence,
  generateMilestoneForecasts,
  generateScenarioProjection,
  generateWeightProjection
} from "../../src/lib/fitness/projections.js";

function dateRange(start, count) {
  const startMs = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(startMs + index * 86400000).toISOString().slice(0, 10)
  );
}

test("stale weigh-ins do not override a current profile weight or create false confidence", () => {
  const staleLogs = dateRange("2025-01-01", 28).map((date) => ({ date, weight_lbs: 200 }));
  const projection = generateWeightProjection({
    logs: staleLogs,
    profile: { current_weight_lbs: 180 },
    tdee: 2500,
    calorieTarget: 2000,
    mode: "current_plan",
    weeks: 12,
    referenceDate: "2026-01-01"
  });

  assert.equal(projection.current_weight_trend_start, 180);
  assert.equal(projection.projected_median_end_weight, 168);
  assert.equal(projection.confidence, "low");
});

test("projection confidence and variance are based on a recent calendar window", () => {
  const recentLogs = dateRange("2026-01-05", 28).map((date) => ({ date, weight_lbs: 180 }));
  const logs = [{ date: "2020-01-01", weight_lbs: 500 }, ...recentLogs];
  const projection = generateWeightProjection({
    logs,
    profile: { current_weight_lbs: 180 },
    tdee: 2500,
    calorieTarget: 2000,
    mode: "current_plan",
    weeks: 12,
    referenceDate: "2026-02-01"
  });

  assert.equal(calculateProjectionConfidence(recentLogs, 0, { referenceDate: "2026-02-01" }), "high");
  assert.equal(projection.current_weight_trend_start, 180);
  assert.equal(projection.confidence, "high");
});

test("fat-loss scenario projections are ordered by intervention strength", () => {
  const projections = generateScenarioProjection({
    logs: [],
    profile: { current_weight_lbs: 200 },
    tdee: 2500,
    calorieTarget: 2000,
    weeks: 12,
    referenceDate: "2026-01-01",
    startDate: "2026-01-01T12:00:00Z"
  });
  const byMode = Object.fromEntries(
    projections.map((projection) => [projection.mode, projection.projected_median_end_weight])
  );

  assert.ok(byMode.reduce_150_calories < byMode.current_plan);
  assert.ok(byMode.add_2000_steps < byMode.current_plan);
  assert.ok(byMode.combined < byMode.reduce_150_calories);
  assert.ok(byMode.combined < byMode.add_2000_steps);
});

test("a surplus projects upward and only reachable milestones receive dates", () => {
  const projection = generateWeightProjection({
    logs: [],
    profile: { current_weight_lbs: 180 },
    goalWeight: 200,
    tdee: 2000,
    calorieTarget: 2500,
    mode: "current_plan",
    weeks: 24,
    referenceDate: "2026-01-01",
    startDate: "2026-01-01T12:00:00Z"
  });

  assert.equal(projection.projected_median_end_weight, 204);
  assert.equal(projection.milestones.find((item) => item.weight_lbs === 200)?.estimated_date, "2026-05-21");
});

test("a milestone already reached is dated at the projection start even with a flat plan", () => {
  const [milestone] = generateMilestoneForecasts({
    startWeight: 180,
    dailyChange: 0,
    weeks: 12,
    milestones: [180],
    confidence: "low",
    startDate: "2026-01-01T12:00:00Z"
  });

  assert.equal(milestone.estimated_date, "2026-01-01");
});
