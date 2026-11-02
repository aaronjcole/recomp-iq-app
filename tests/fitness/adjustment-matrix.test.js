import test from "node:test";
import assert from "node:assert/strict";

import { decideWeeklyAdjustment, rebalanceMacrosForCalories } from "../../src/lib/fitness/adjustments.js";

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

function macroCalories(strategy) {
  return strategy.protein_target_g * 4 + strategy.carb_target_g * 4 + strategy.fat_target_g * 9;
}

test("a calorie change moves the macro targets with it, keeping protein", () => {
  let strategy = { ...baseStrategy, carb_target_g: 200, fat_target_g: 62 };
  assert.ok(Math.abs(macroCalories(strategy) - strategy.calorie_target) < 10);
  for (let week = 0; week < 3; week += 1) {
    const result = decideWeeklyAdjustment({
      trend: trend({ weight_change_percent_per_week: 0.02, trend_label: "gaining", waist_label: "up" }),
      profile: { goal: "fat_loss", job_activity: "active" },
      preferences: {},
      strategy
    });
    assert.equal(result.decision, "reduce_calories");
    strategy = result.nextStrategy;
    assert.equal(strategy.protein_target_g, 160, "protein stays as set");
    assert.ok(
      Math.abs(macroCalories(strategy) - strategy.calorie_target) <= 10,
      `week ${week + 1}: macros add to ${macroCalories(strategy)} kcal for a ${strategy.calorie_target} kcal target`
    );
  }
  assert.equal(strategy.calorie_target, 1550);
});

test("macro rebalancing keeps carbs and fat above their floors", () => {
  const lowCarb = { calorie_target: 1700, protein_target_g: 200, carb_target_g: 60, fat_target_g: 80 };
  const cut = rebalanceMacrosForCalories(lowCarb, 1500);
  assert.equal(cut.carb_target_g, 50);
  assert.ok(cut.fat_target_g < 80 && cut.fat_target_g >= 40);
  assert.deepEqual(rebalanceMacrosForCalories(lowCarb, 1700), {});
  assert.deepEqual(rebalanceMacrosForCalories({ calorie_target: 2000 }, 1850), {}, "missing macros are left alone");
});
