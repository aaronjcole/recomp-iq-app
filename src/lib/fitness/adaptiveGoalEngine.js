// Ported 1:1 from RecompOne src/lib/fitness/adaptiveGoalEngine.ts. Blends a
// Mifflin-St Jeor static TDEE with an observed TDEE derived from intake and
// weight rate, then produces safe, bounded recommendations. Pure functions.

import { calculateBMR, calculateCalorieTarget, calculateMacroTargets, calculateTDEE } from "./calculators.js";
import { average, sortLogs } from "./trends.js";

const ENERGY_PER_LB = 3500;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function goalProteinPerLb(goal) {
  if (goal === "muscle_gain" || goal === "lean_bulk" || goal === "aggressive_gain") return 0.82;
  if (goal === "maintenance") return 0.75;
  return 0.9;
}

function confidenceFromData(daysUsed, calorieDays, weightDays, rate) {
  if (daysUsed >= 21 && calorieDays >= 16 && weightDays >= 14 && rate !== null) return "high";
  if (daysUsed >= 14 && calorieDays >= 10 && weightDays >= 8 && rate !== null) return "medium";
  return "low";
}

function goalCopy(goal) {
  const copy = {
    maintenance: "hold weight steady while preserving performance and routine consistency",
    body_recomposition: "lean out slowly while keeping training performance central",
    fat_loss_biased_recomp: "bias fat loss while protecting strength and recovery",
    fat_loss: "lose fat at a sustainable pace",
    aggressive_fat_loss: "lose fat faster, with tighter safety and recovery checks",
    strength_retention_cut: "cut with strength retention as the main guardrail",
    muscle_gain: "gain weight to support muscle growth",
    lean_bulk: "gain slowly while limiting unnecessary fat gain",
    aggressive_gain: "gain faster, accepting more fat-gain risk"
  };
  return copy[goal];
}

export function estimateObservedTdee(logs, windowDays = 28) {
  const sorted = sortLogs(logs).slice(-windowDays);
  const calorieLogs = sorted.filter((log) => typeof log.calories === "number");
  const weightLogs = sorted.filter((log) => typeof log.weight_lbs === "number");
  const daysUsed = sorted.length;
  if (calorieLogs.length < 7 || weightLogs.length < 6) {
    return {
      observed_tdee: null,
      days_used: daysUsed,
      calorie_days_used: calorieLogs.length,
      weight_days_used: weightLogs.length,
      weekly_weight_rate_lbs: null
    };
  }

  const sampleSize = Math.min(7, Math.floor(weightLogs.length / 2));
  const firstWeights = weightLogs.slice(0, sampleSize);
  const lastWeights = weightLogs.slice(-sampleSize);
  const firstAvg = average(firstWeights.map((log) => log.weight_lbs));
  const lastAvg = average(lastWeights.map((log) => log.weight_lbs));
  const firstDate = average(firstWeights.map((log) => new Date(log.date).getTime()));
  const lastDate = average(lastWeights.map((log) => new Date(log.date).getTime()));
  const elapsedDays = Math.max(1, (lastDate - firstDate) / 86400000);
  const dailyWeightRate = (lastAvg - firstAvg) / elapsedDays;
  const weeklyWeightRate = dailyWeightRate * 7;
  const avgCalories = average(calorieLogs.map((log) => log.calories));
  const observed = avgCalories - dailyWeightRate * ENERGY_PER_LB;

  return {
    observed_tdee: Math.round(observed),
    days_used: daysUsed,
    calorie_days_used: calorieLogs.length,
    weight_days_used: weightLogs.length,
    weekly_weight_rate_lbs: Number(weeklyWeightRate.toFixed(2))
  };
}

export function buildAdaptiveGoalPlan(args) {
  const { profile, logs, strategy } = args;
  const bmr = calculateBMR({ sex: profile.sex, weight_lbs: profile.current_weight_lbs, height_in: profile.height_in, age: profile.age });
  const staticTdee = calculateTDEE(bmr, profile.job_activity);
  const observed = estimateObservedTdee(logs);
  const confidence = confidenceFromData(observed.days_used, observed.calorie_days_used, observed.weight_days_used, observed.weekly_weight_rate_lbs);
  const observedTdee = observed.observed_tdee && observed.observed_tdee > 1000 ? observed.observed_tdee : null;
  const observedWeight = confidence === "high" ? 0.72 : confidence === "medium" ? 0.55 : 0.25;
  const modeled = observedTdee ? Math.round(staticTdee * (1 - observedWeight) + observedTdee * observedWeight) : staticTdee;
  const range = confidence === "high" ? 120 : confidence === "medium" ? 190 : 280;
  const rawTarget = calculateCalorieTarget(modeled, profile.goal);
  const previousTarget = strategy?.calorie_target;
  const limitedTarget = previousTarget ? clamp(rawTarget, previousTarget - 175, previousTarget + 175) : rawTarget;
  const proteinPreference = Math.round(profile.current_weight_lbs * goalProteinPerLb(profile.goal));
  const macros = calculateMacroTargets({
    calories: limitedTarget,
    current_weight_lbs: profile.current_weight_lbs,
    goal_weight_lbs: profile.goal_weight_lbs,
    proteinPreferenceG: proteinPreference
  });
  const cautions = [];
  if (profile.goal === "aggressive_fat_loss") cautions.push("Aggressive fat loss should back off if sleep, hunger, mood, or training performance worsens.");
  if (profile.goal === "aggressive_gain") cautions.push("Faster weight gain increases the chance that more of the gain is fat mass.");
  if (confidence === "low") cautions.push("Keep this as a starting estimate until at least 14 days of calorie and weight data are logged.");
  if ((observed.weekly_weight_rate_lbs ?? 0) < -profile.current_weight_lbs * 0.012)
    cautions.push("Recent loss rate may be too fast; prioritize recovery and adherence before lowering calories.");

  return {
    static_tdee: staticTdee,
    observed_tdee: observedTdee,
    modeled_tdee: modeled,
    low_end: modeled - range,
    high_end: modeled + range,
    confidence,
    days_used: observed.days_used,
    calorie_days_used: observed.calorie_days_used,
    weight_days_used: observed.weight_days_used,
    weekly_weight_rate_lbs: observed.weekly_weight_rate_lbs,
    recommended_calorie_target: Math.round(limitedTarget / 10) * 10,
    recommended_protein_g: macros.protein_target_g,
    recommended_fat_g: macros.fat_target_g,
    recommended_carb_g: macros.carb_target_g,
    goal: profile.goal,
    explanation: `Modeled from a Mifflin-St Jeor starting estimate${observedTdee ? " blended with observed intake and weight trend" : ""} to ${goalCopy(profile.goal)}.`,
    cautions
  };
}
