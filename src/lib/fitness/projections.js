// Ported 1:1 from RecompIQ src/lib/fitness/projections.ts. Pure functions.

import { average, calculateMovingAverage, sortLogs } from "./trends";

export { calculateMovingAverage };

export function calculateWeightTrend(logs) {
  const weights = sortLogs(logs).filter((log) => typeof log.weight_lbs === "number");
  if (weights.length < 14) return null;
  const current = average(weights.slice(-7).map((log) => log.weight_lbs));
  const previous = average(weights.slice(-14, -7).map((log) => log.weight_lbs));
  return current !== null && previous !== null ? Number((current - previous).toFixed(2)) : null;
}

export function calculateWeightVariance(logs) {
  const values = logs.map((log) => log.weight_lbs).filter((v) => typeof v === "number");
  const avg = average(values) ?? 0;
  const variance = average(values.map((v) => Math.pow(v - avg, 2))) ?? 0;
  return Number(Math.sqrt(variance).toFixed(2));
}

export function calculateProjectionConfidence(logs, variance) {
  const count = logs.filter((log) => typeof log.weight_lbs === "number").length;
  if (count < 14 || variance > 2.5) return "low";
  if (count < 28 || variance > 1.5) return "medium";
  return "high";
}

export function estimateStepCalorieDelta(bodyWeightLbs, additionalSteps) {
  const perThousand = Math.min(70, Math.max(30, bodyWeightLbs * 0.18));
  return Math.round((additionalSteps / 1000) * perThousand);
}

export function generateMilestoneForecasts(input) {
  const start = input.startDate ?? new Date("2026-06-30T12:00:00Z");
  return input.milestones.map((weight_lbs) => {
    if (input.dailyChange >= 0 && weight_lbs < input.startWeight) return { weight_lbs, estimated_date: null, confidence: input.confidence };
    if (input.dailyChange <= 0 && weight_lbs > input.startWeight) return { weight_lbs, estimated_date: null, confidence: input.confidence };
    const days = Math.round((weight_lbs - input.startWeight) / input.dailyChange);
    if (!Number.isFinite(days) || days < 0 || days > input.weeks * 7) return { weight_lbs, estimated_date: null, confidence: input.confidence };
    const date = new Date(start);
    date.setDate(date.getDate() + days);
    return { weight_lbs, estimated_date: date.toISOString().slice(0, 10), confidence: input.confidence };
  });
}

export function generateWeightProjection(input) {
  const weightLogs = sortLogs(input.logs).filter((log) => typeof log.weight_lbs === "number");
  const currentAvg = average(weightLogs.slice(-7).map((log) => log.weight_lbs)) ?? weightLogs.at(-1)?.weight_lbs ?? 0;
  const variance = calculateWeightVariance(weightLogs);
  const confidence = calculateProjectionConfidence(weightLogs, variance);
  const observedWeekly = calculateWeightTrend(weightLogs) ?? (input.tdee - input.calorieTarget) / 500;
  const planWeekly = -((input.tdee - input.calorieTarget) * 7) / 3500;
  const bodyWeight = currentAvg || 250;
  const stepWeekly = -(estimateStepCalorieDelta(bodyWeight, 2000) * 7) / 3500;
  const calorieWeekly = -((150 * 7) / 3500);
  const byMode = {
    current_trajectory: observedWeekly,
    current_plan: observedWeekly * 0.45 + planWeekly * 0.55,
    conservative: Math.min(0, observedWeekly * 0.65),
    reduce_150_calories: observedWeekly + calorieWeekly,
    add_2000_steps: observedWeekly + stepWeekly,
    combined: observedWeekly + calorieWeekly + stepWeekly
  };
  const daily = byMode[input.mode] / 7;
  const median = currentAvg + daily * input.weeks * 7;
  const band =
    confidence === "high" ? Math.max(1.4, variance * 1.2) : confidence === "medium" ? Math.max(2.5, variance * 1.8) : Math.max(4, variance * 2.5);
  const milestones = [250, 240, input.goalWeight ?? 230].filter((value, index, array) => array.indexOf(value) === index);
  return {
    projection_window_weeks: input.weeks,
    mode: input.mode,
    current_weight_trend_start: Number(currentAvg.toFixed(1)),
    projected_median_end_weight: Number(median.toFixed(1)),
    projected_low_end_weight: Number((median - band).toFixed(1)),
    projected_high_end_weight: Number((median + band).toFixed(1)),
    confidence,
    milestones: generateMilestoneForecasts({ startWeight: currentAvg, dailyChange: daily, weeks: input.weeks, milestones, confidence }),
    explanation:
      weightLogs.length < 7
        ? "Need at least 7 weigh-ins for a basic projection."
        : `Estimated ${input.weeks}-week range: ${(median - band).toFixed(1)}–${(median + band).toFixed(1)} lb. This is conditional, not guaranteed.`,
    limitations: ["Water retention, sodium, creatine, soreness, and missing logs can widen the range.", "Use this to plan, not to judge a single day."]
  };
}

export function generateScenarioProjection(args) {
  return ["current_plan", "reduce_150_calories", "add_2000_steps", "combined"].map((mode) =>
    generateWeightProjection({ ...args, mode })
  );
}