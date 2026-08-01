import test from "node:test";
import assert from "node:assert/strict";

import { decideWeeklyAdjustment } from "../../src/lib/fitness/adjustments.js";

const baseStrategy = {
  calorie_target: 2000,
  protein_target_g: 160,
  step_target: 6000,
  lifting_days_target: 3,
  behavior_focus: "Keep the basics consistent."
};

function trend(overrides = {}) {
  return {
    days_logged: 14,
    calorie_adherence: 1,
    protein_adherence: 1,
    step_adherence: 1,
    weight_change_percent_per_week: 0,
    trend_label: "flat",
    waist_label: "flat",
    recovery_label: "good",
    ...overrides
  };
}

function adjustment(goal, trendOverrides, inputOverrides = {}) {
  return decideWeeklyAdjustment({
    trend: trend(trendOverrides),
    profile: { goal, job_activity: "moderately_active" },
    preferences: {},
    strategy: baseStrategy,
    ...inputOverrides
  });
}

test("all goal modes have a stable golden-path decision", () => {
  const goldenCases = [
    ["fat_loss_biased_recomp", -0.003],
    ["body_recomposition", 0],
    ["fat_loss", -0.005],
    ["aggressive_fat_loss", -0.012],
    ["strength_retention_cut", -0.005],
    ["muscle_gain", 0.002],
    ["lean_bulk", 0.002],
    ["aggressive_gain", 0.005],
    ["maintenance", 0]
  ];

  for (const [goal, rate] of goldenCases) {
    const result = adjustment(goal, {
      weight_change_percent_per_week: rate,
      trend_label: rate < -0.0015 ? "losing" : rate > 0.0015 ? "gaining" : "flat"
    });
    assert.equal(result.decision, "keep_plan", `${goal} should keep a compatible rate`);
  }
});

test("fat-loss and recomp goals respond to sustained unwanted gain", () => {
  const goals = [
    "fat_loss_biased_recomp",
    "body_recomposition",
    "fat_loss",
    "aggressive_fat_loss",
    "strength_retention_cut"
  ];

  for (const goal of goals) {
    const result = adjustment(goal, {
      weight_change_percent_per_week: 0.02,
      trend_label: "gaining",
      waist_label: "up"
    });
    assert.equal(result.decision, "reduce_calories", `${goal} must not silently monitor a 2% weekly gain`);
    assert.equal(result.nextStrategy.calorie_target, 1850);
  }
});

test("gain goals respond to loss and maintenance responds in either direction", () => {
  for (const goal of ["muscle_gain", "lean_bulk", "aggressive_gain"]) {
    assert.equal(
      adjustment(goal, {
        weight_change_percent_per_week: -0.005,
        trend_label: "losing"
      }).decision,
      "increase_calories"
    );
  }

  assert.equal(
    adjustment("maintenance", {
      weight_change_percent_per_week: -0.005,
      trend_label: "losing"
    }).decision,
    "increase_calories"
  );
  assert.equal(
    adjustment("maintenance", {
      weight_change_percent_per_week: 0.005,
      trend_label: "gaining"
    }).decision,
    "reduce_calories"
  );
});

test("a weekly decision does not infer adherence when every adherence metric is missing", () => {
  const result = adjustment("fat_loss", {
    calorie_adherence: null,
    protein_adherence: null,
    step_adherence: null,
    weight_change_percent_per_week: -0.005,
    trend_label: "losing"
  });

  assert.equal(result.decision, "keep_collecting_data");
});

test("calorie adjustments remain inside strategy bounds", () => {
  const result = adjustment(
    "lean_bulk",
    { weight_change_percent_per_week: 0, trend_label: "flat" },
    {
      consecutiveFlatWeeks: 2,
      strategy: { ...baseStrategy, calorie_target: 20000 }
    }
  );

  assert.equal(result.decision, "increase_calories");
  assert.equal(result.nextStrategy.calorie_target, 20000);
});

test("safety and recovery signals take precedence over goal-specific changes", () => {
  const safety = decideWeeklyAdjustment({
    trend: trend({
      calorie_adherence: 0.1,
      weight_change_percent_per_week: 0.02,
      trend_label: "gaining",
      recovery_label: "poor"
    }),
    profile: { goal: "fat_loss", job_activity: "sedentary" },
    preferences: { safety_flags: ["pregnancy"] },
    strategy: baseStrategy
  });
  assert.equal(safety.decision, "seek_professional_guidance");

  const recovery = adjustment("fat_loss", {
    weight_change_percent_per_week: 0.02,
    trend_label: "gaining",
    waist_label: "up",
    recovery_label: "poor"
  });
  assert.equal(recovery.decision, "reduce_training_fatigue");
});
