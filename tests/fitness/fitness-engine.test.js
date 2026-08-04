import test from "node:test";
import assert from "node:assert/strict";

import { summarizeAdherence } from "../../src/lib/fitness/adherence.js";
import { decideWeeklyAdjustment } from "../../src/lib/fitness/adjustments.js";
import { estimateObservedTdee } from "../../src/lib/fitness/adaptiveGoalEngine.js";
import { calculateInitialStrategy } from "../../src/lib/fitness/calculators.js";
import {
  calculateProjectionConfidence,
  calculateWeightTrend,
  generateWeightProjection
} from "../../src/lib/fitness/projections.js";
import { recalculateTargets, runWeeklyCheckIn } from "../../src/lib/fitness/recalculate.js";
import {
  analyzeTrends,
  calculateMovingAverage,
  countConsecutiveFlatWeeks,
  dedupeLogsByDate
} from "../../src/lib/fitness/trends.js";

const strategy = {
  calorie_target: 2000,
  protein_target_g: 160,
  step_target: 6000,
  lifting_days_target: 3,
  behavior_focus: "Keep the basics consistent."
};

function isoDate(day) {
  return `2026-01-${String(day).padStart(2, "0")}`;
}

function localTodayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function offsetDate(date, offsetDays) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10);
}

function dailyLogs(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    date: isoDate(index + 1),
    weight_lbs: 200,
    waist_in: 40,
    calories: strategy.calorie_target,
    protein_g: strategy.protein_target_g,
    steps: strategy.step_target,
    workout_completed: index >= count - 7 && index % 2 === 0,
    sleep_hours: 8,
    energy_rating: 4,
    soreness_rating: 2,
    ...overrides
  }));
}

function completeTrend(overrides = {}) {
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

test("daily logs are deduplicated by calendar date and later server data wins", () => {
  const deduped = dedupeLogsByDate([
    { date: "2026-01-10", weight_lbs: 201, protein_g: 150, updated_date: "2026-01-10T08:00:00Z" },
    { date: "2026-01-10", weight_lbs: 200, updated_date: "2026-01-10T12:00:00Z" },
    { date: "not-a-date", weight_lbs: 999 }
  ]);

  assert.deepEqual(deduped, [
    {
      date: "2026-01-10",
      weight_lbs: 200,
      protein_g: 150,
      updated_date: "2026-01-10T12:00:00Z"
    }
  ]);
});

test("trend windows use calendar days, unique dates, and ignore stale records", () => {
  const logs = [
    ...dailyLogs(14),
    { date: "2025-12-01", weight_lbs: 250, calories: 0 },
    {
      date: "2026-01-14",
      weight_lbs: 198,
      calories: 2000,
      updated_date: "2026-01-14T23:00:00Z"
    }
  ];
  const trend = analyzeTrends(logs, strategy, { referenceDate: "2026-01-14" });

  assert.equal(trend.days_logged, 14);
  assert.equal(trend.avg_weight_previous_7_day, 200);
  assert.equal(trend.avg_weight_current_7_day, 199.71);
  assert.equal(trend.weight_change_lbs, -0.29);
  assert.equal(trend.calorie_adherence, 1);
});

test("moving averages use elapsed calendar days rather than the last N rows", () => {
  assert.deepEqual(
    calculateMovingAverage(
      [
        { date: "2026-01-01", value: 10 },
        { date: "2026-01-02", value: 20 },
        { date: "2026-01-10", value: 40 }
      ],
      7
    ),
    [
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: 15 },
      { date: "2026-01-10", value: 40 }
    ]
  );
});

test("adherence counts at most one workout per calendar day", () => {
  const result = summarizeAdherence(
    [
      { date: "2026-01-01", workout_completed: true },
      { date: "2026-01-01", workout_completed: true },
      { date: "2026-01-02", workout_completed: true }
    ],
    { calories: 2000, protein: 160, steps: 6000, workouts: 4 }
  );

  assert.equal(result.workout_adherence, 0.5);
});

test("current-week adherence counts missing metric days as missed days", () => {
  const logs = dailyLogs(7).map((log, index) =>
    index === 6
      ? log
      : {
          ...log,
          calories: undefined,
          protein_g: undefined,
          steps: undefined
        }
  );
  const trend = analyzeTrends(logs, strategy, { referenceDate: "2026-01-07" });

  assert.equal(trend.days_logged, 7);
  assert.equal(trend.calorie_adherence, 0.14);
  assert.equal(trend.protein_adherence, 0.14);
  assert.equal(trend.step_adherence, 0.14);

  const checkIn = runWeeklyCheckIn({
    logs,
    referenceDate: "2026-01-07",
    profile: { goal: "fat_loss", job_activity: "sedentary" },
    preferences: {},
    strategy
  });
  assert.equal(checkIn.adjustment.decision, "keep_collecting_data");
});

test("weight projection falls back to profile weight and a deficit projects downward", () => {
  const projection = generateWeightProjection({
    logs: [],
    profile: { current_weight_lbs: 200 },
    tdee: 2500,
    calorieTarget: 2000,
    goalWeight: 180,
    mode: "current_plan",
    weeks: 12,
    startDate: "2026-01-01T12:00:00Z"
  });

  assert.equal(projection.current_weight_trend_start, 200);
  assert.equal(projection.projected_median_end_weight, 188);
  assert.ok(projection.projected_low_end_weight < projection.projected_median_end_weight);
  assert.ok(projection.projected_high_end_weight > projection.projected_median_end_weight);
});

test("weight projection returns null weights when neither logs nor profile weight exist", () => {
  const projection = generateWeightProjection({
    logs: [],
    tdee: 2500,
    calorieTarget: 2000,
    mode: "current_plan",
    weeks: 12
  });

  assert.equal(projection.current_weight_trend_start, null);
  assert.equal(projection.projected_median_end_weight, null);
  assert.ok(projection.milestones.every((milestone) => milestone.estimated_date === null));
});

test("duplicate weigh-ins do not create a false trend or inflate confidence", () => {
  const duplicates = Array.from({ length: 20 }, (_, index) => ({
    date: index < 10 ? "2026-01-01" : "2026-01-14",
    weight_lbs: index < 10 ? 200 : 190
  }));

  assert.equal(calculateWeightTrend(duplicates, { referenceDate: "2026-01-14" }), null);
  assert.equal(calculateProjectionConfidence(duplicates, 0), "low");
});

test("weekly adjustments respond to the selected goal", () => {
  const losing = completeTrend({
    weight_change_percent_per_week: -0.005,
    trend_label: "losing"
  });
  const gaining = completeTrend({
    weight_change_percent_per_week: 0.006,
    trend_label: "gaining"
  });

  const gainAdjustment = decideWeeklyAdjustment({
    trend: losing,
    profile: { goal: "lean_bulk", job_activity: "moderately_active" },
    preferences: {},
    strategy
  });
  const maintenanceAdjustment = decideWeeklyAdjustment({
    trend: gaining,
    profile: { goal: "maintenance", job_activity: "moderately_active" },
    preferences: {},
    strategy
  });
  const fatLossAdjustment = decideWeeklyAdjustment({
    trend: losing,
    profile: { goal: "fat_loss", job_activity: "moderately_active" },
    preferences: {},
    strategy
  });

  assert.equal(gainAdjustment.decision, "increase_calories");
  assert.equal(gainAdjustment.nextStrategy.calorie_target, 2150);
  assert.equal(maintenanceAdjustment.decision, "reduce_calories");
  assert.equal(maintenanceAdjustment.nextStrategy.calorie_target, 1850);
  assert.equal(fatLossAdjustment.decision, "keep_plan");
});

test("two flat recomp weeks take precedence over the normal recomp hold range", () => {
  const adjustment = decideWeeklyAdjustment({
    trend: completeTrend(),
    profile: { goal: "body_recomposition", job_activity: "sedentary" },
    preferences: {},
    strategy,
    consecutiveFlatWeeks: 2
  });

  assert.equal(adjustment.decision, "increase_steps");
  assert.equal(adjustment.nextStrategy.step_target, 7500);
});

test("weekly check-in derives consecutive flat weeks and activates a plateau lever", () => {
  const logs = dailyLogs(21);

  assert.equal(countConsecutiveFlatWeeks(logs, "2026-01-21"), 2);
  const result = runWeeklyCheckIn({
    logs,
    referenceDate: "2026-01-21",
    profile: { goal: "fat_loss", job_activity: "sedentary" },
    preferences: {},
    strategy
  });

  assert.equal(result.adjustment.decision, "increase_steps");
  assert.equal(result.adjustment.nextStrategy.step_target, 7500);
});

test("weekly check-in uses one reference date for trends and plateau detection", () => {
  const today = localTodayKey();
  const weightOffsets = new Set([-24, -23, -22, -13, -12, -11, -6, -5, -4]);
  const logs = Array.from({ length: 25 }, (_, index) => {
    const offset = index - 24;
    return {
      date: offsetDate(today, offset),
      calories: strategy.calorie_target,
      protein_g: strategy.protein_target_g,
      steps: strategy.step_target,
      ...(weightOffsets.has(offset) ? { weight_lbs: 200 } : {})
    };
  });
  const args = {
    logs,
    profile: { goal: "fat_loss", job_activity: "sedentary" },
    preferences: {},
    strategy
  };

  assert.deepEqual(runWeeklyCheckIn(args), runWeeklyCheckIn({ ...args, referenceDate: today }));
});

test("soreness-only recovery data can trigger fatigue protection", () => {
  const trend = analyzeTrends(
    [{ date: "2026-01-14", soreness_rating: 5 }],
    strategy,
    { referenceDate: "2026-01-14" }
  );

  assert.equal(trend.recovery_label, "poor");
});

test("observed TDEE uses non-overlapping weight samples to recover a linear slope", () => {
  const logs = Array.from({ length: 7 }, (_, index) => ({
    date: isoDate(index + 1),
    calories: 2000,
    weight_lbs: 200 - index * 0.2
  }));

  const result = estimateObservedTdee(logs);

  assert.equal(result.weekly_weight_rate_lbs, -1.4);
  assert.equal(result.observed_tdee, 2700);
});

test("safety flags constrain aggressive starting targets and halt weekly changes", () => {
  const profile = {
    sex: "male",
    current_weight_lbs: 200,
    goal_weight_lbs: 180,
    height_in: 70,
    age: 35,
    job_activity: "sedentary",
    average_steps: 4000,
    goal: "aggressive_fat_loss"
  };
  const unconstrained = calculateInitialStrategy(profile);
  const constrained = calculateInitialStrategy(profile, { safety_flags: ["pregnancy"] });
  const recalculated = recalculateTargets(profile, { safety_flags: ["pregnancy"] });

  assert.ok(constrained.calorie_target > unconstrained.calorie_target);
  assert.equal(recalculated.calorie_target, constrained.calorie_target);
  assert.match(constrained.notes.join(" "), /Safety flags/);

  const adjustment = decideWeeklyAdjustment({
    trend: completeTrend({ weight_change_percent_per_week: -0.02, trend_label: "losing" }),
    profile,
    preferences: { safety_flags: ["pregnancy"] },
    strategy
  });
  assert.equal(adjustment.decision, "seek_professional_guidance");
  assert.equal(adjustment.nextStrategy.calorie_target, strategy.calorie_target);
});

test("starting step targets stay within the strategy schema maximum", () => {
  const result = calculateInitialStrategy({
    sex: "male",
    current_weight_lbs: 200,
    height_in: 70,
    age: 35,
    job_activity: "sedentary",
    average_steps: 200000,
    goal: "maintenance"
  });

  assert.equal(result.step_target, 200000);
});
