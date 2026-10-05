// Ported 1:1 from RecompOne src/services/localRecompService.ts. Composes the
// fitness modules into the high-level operations used by onboarding, the
// weekly check-in, and the projection view. Pure functions.

import { calculateInitialStrategy } from "./calculators.js";
import { decideWeeklyAdjustment } from "./adjustments.js";
import { analyzeTrends, countConsecutiveFlatWeeks, normalizeDateKey } from "./trends.js";
import { generateWeightProjection } from "./projections.js";

function localTodayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function recalculateTargets(profile, preferences = {}) {
  const calc = calculateInitialStrategy(profile, preferences);
  return {
    calorie_target: calc.calorie_target,
    protein_target_g: calc.protein_target_g,
    fat_target_g: calc.fat_target_g,
    carb_target_g: calc.carb_target_g,
    step_target: calc.step_target,
    lifting_days_target: Math.min(Math.max(profile.training_days_per_week || 3, 2), 4),
    cardio_days_target: profile.cardio_days_per_week,
    goal_type: profile.goal,
    weekly_adjustment_rule: "Use 14+ days of data and small bounded changes.",
    behavior_focus: "Build the logging habit and add realistic steps."
  };
}

// The five targets a user can author by hand in CustomTargetsCard. While
// strategy.manual_override is on they belong to the user, so recalculating from
// biometrics or a goal change must leave them alone.
export const MANUAL_TARGET_KEYS = Object.freeze([
  "calorie_target",
  "protein_target_g",
  "carb_target_g",
  "fat_target_g",
  "step_target"
]);

/**
 * The CurrentStrategy patch written after a profile edit (biometrics or goal):
 * targets recalculated for `goal`, minus the user's own targets when
 * `manualOverride` is on.
 */
export function recalculatedStrategyUpdate(profile, preferences, { goal, manualOverride }) {
  const strat = recalculateTargets({ ...profile, goal }, preferences ?? {});
  if (manualOverride) {
    for (const key of MANUAL_TARGET_KEYS) delete strat[key];
  }
  return { ...strat, goal_type: goal };
}

export function runWeeklyCheckIn(args) {
  const referenceDate = normalizeDateKey(args.referenceDate) || localTodayKey();
  const trend = analyzeTrends(args.logs, args.strategy, { referenceDate });
  const consecutiveFlatWeeks =
    typeof args.consecutiveFlatWeeks === "number"
      ? args.consecutiveFlatWeeks
      : countConsecutiveFlatWeeks(args.logs, referenceDate);
  return {
    trend,
    adjustment: decideWeeklyAdjustment({
      trend,
      profile: args.profile,
      preferences: args.preferences,
      strategy: args.strategy,
      consecutiveFlatWeeks,
      strengthCrashing: args.strengthCrashing
    })
  };
}

export function recalculateProjection(args) {
  return generateWeightProjection({
    logs: args.logs,
    mode: "current_plan",
    weeks: 12,
    calorieTarget: args.strategy.calorie_target,
    tdee: args.tdee,
    goalWeight: args.profile.goal_weight_lbs,
    currentWeight: args.profile.current_weight_lbs
  });
}
