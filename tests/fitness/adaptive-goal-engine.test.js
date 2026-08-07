import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptiveGoalPlan } from "../../src/lib/fitness/adaptiveGoalEngine.js";

const profile = {
  sex: "male",
  current_weight_lbs: 200,
  goal_weight_lbs: 180,
  height_in: 70,
  age: 35,
  job_activity: "moderately_active",
  goal: "fat_loss"
};

function logsForDays(count, overrides = {}) {
  const start = Date.parse("2026-01-01T12:00:00Z");
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    calories: 2200,
    weight_lbs: 200,
    ...overrides
  }));
}

test("adaptive plans expose low, medium, and high evidence tiers", () => {
  const strategy = { calorie_target: 2000 };
  const low = buildAdaptiveGoalPlan({ profile, strategy, logs: logsForDays(7) });
  const medium = buildAdaptiveGoalPlan({ profile, strategy, logs: logsForDays(14) });
  const high = buildAdaptiveGoalPlan({ profile, strategy, logs: logsForDays(21) });

  assert.equal(low.confidence, "low");
  assert.equal(medium.confidence, "medium");
  assert.equal(high.confidence, "high");
  assert.equal(low.high_end - low.low_end, 560);
  assert.equal(medium.high_end - medium.low_end, 380);
  assert.equal(high.high_end - high.low_end, 240);
});

test("implausibly low observed TDEE is ignored", () => {
  const logs = logsForDays(21).map((log, index) => ({
    ...log,
    calories: 1100,
    weight_lbs: 200 + index * 0.1
  }));
  const result = buildAdaptiveGoalPlan({
    profile,
    strategy: { calorie_target: 2000 },
    logs
  });

  assert.equal(result.confidence, "high");
  assert.equal(result.observed_tdee, null);
  assert.equal(result.modeled_tdee, result.static_tdee);
});

test("adaptive calorie recommendations stay within the prior target clamp", () => {
  const result = buildAdaptiveGoalPlan({
    profile: {
      ...profile,
      current_weight_lbs: 300,
      goal_weight_lbs: 325,
      height_in: 78,
      age: 25,
      job_activity: "extremely_active",
      goal: "muscle_gain"
    },
    strategy: { calorie_target: 2000 },
    logs: []
  });

  assert.equal(result.recommended_calorie_target, 2180);
  assert.equal(result.confidence, "low");
  assert.match(result.cautions.join(" "), /at least 14 days/);
});
