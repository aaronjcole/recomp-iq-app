// Ported 1:1 from RecompIQ src/services/localRecompService.ts. Composes the
// fitness modules into the high-level operations used by onboarding, the
// weekly check-in, and the projection view. Pure functions.

import { calculateInitialStrategy } from "./calculators";
import { decideWeeklyAdjustment } from "./adjustments";
import { analyzeTrends } from "./trends";
import { generateWeightProjection } from "./projections";

export function recalculateTargets(profile) {
  const calc = calculateInitialStrategy(profile);
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

export function runWeeklyCheckIn(args) {
  const trend = analyzeTrends(args.logs, args.strategy);
  return {
    trend,
    adjustment: decideWeeklyAdjustment({ trend, profile: args.profile, preferences: args.preferences, strategy: args.strategy })
  };
}

export function recalculateProjection(args) {
  return generateWeightProjection({
    logs: args.logs,
    mode: "current_plan",
    weeks: 12,
    calorieTarget: args.strategy.calorie_target,
    tdee: args.tdee,
    goalWeight: args.profile.goal_weight_lbs
  });
}