// Ported 1:1 from RecompIQ src/lib/fitness/projections.ts. Pure functions.

import {
  average,
  calculateMovingAverage,
  dedupeLogsByDate,
  logsInCalendarWindow
} from "./trends.js";

export { calculateMovingAverage };

function finiteNumber(...values) {
  return values.find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}

export function calculateWeightTrend(logs, options = {}) {
  const weights = dedupeLogsByDate(logs).filter(
    (log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs)
  );
  const referenceDate = options.referenceDate || weights.at(-1)?.date;
  const currentWeights = logsInCalendarWindow(weights, referenceDate, 7);
  const previousWeights = logsInCalendarWindow(weights, referenceDate, 7, 7);
  if (currentWeights.length < 3 || previousWeights.length < 3) return null;
  const current = average(currentWeights.map((log) => log.weight_lbs));
  const previous = average(previousWeights.map((log) => log.weight_lbs));
  return current !== null && previous !== null ? Number((current - previous).toFixed(2)) : null;
}

export function calculateWeightVariance(logs) {
  const values = dedupeLogsByDate(logs)
    .map((log) => log.weight_lbs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const avg = average(values) ?? 0;
  const variance = average(values.map((v) => Math.pow(v - avg, 2))) ?? 0;
  return Number(Math.sqrt(variance).toFixed(2));
}

export function calculateProjectionConfidence(logs, variance) {
  const count = dedupeLogsByDate(logs).filter(
    (log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs)
  ).length;
  if (count < 14 || variance > 2.5) return "low";
  if (count < 28 || variance > 1.5) return "medium";
  return "high";
}

export function estimateStepCalorieDelta(bodyWeightLbs, additionalSteps) {
  const perThousand = Math.min(70, Math.max(30, bodyWeightLbs * 0.18));
  return Math.round((additionalSteps / 1000) * perThousand);
}

export function generateMilestoneForecasts(input) {
  const start = input.startDate ? new Date(input.startDate) : new Date();
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
  const weightLogs = dedupeLogsByDate(input.logs).filter(
    (log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs)
  );
  const referenceDate = input.referenceDate || weightLogs.at(-1)?.date;
  const currentWeightLogs = logsInCalendarWindow(weightLogs, referenceDate, 7);
  const profileWeight = finiteNumber(
    input.currentWeight,
    input.currentWeightLbs,
    input.profileWeight,
    input.profile?.current_weight_lbs,
    input.startWeight
  );
  const currentAvg = finiteNumber(
    average(currentWeightLogs.map((log) => log.weight_lbs)),
    weightLogs.at(-1)?.weight_lbs,
    profileWeight
  );
  const variance = calculateWeightVariance(weightLogs);
  const confidence = calculateProjectionConfidence(weightLogs, variance);
  const planWeekly = (input.calorieTarget - input.tdee) / 500;
  const observedWeekly = calculateWeightTrend(weightLogs, { referenceDate }) ?? planWeekly;
  const bodyWeight = currentAvg ?? profileWeight ?? 250;
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
  const weeklyChange = byMode[input.mode] ?? byMode.current_plan;
  const daily = weeklyChange / 7;
  const median = currentAvg === null ? null : currentAvg + daily * input.weeks * 7;
  const band =
    confidence === "high" ? Math.max(1.4, variance * 1.2) : confidence === "medium" ? Math.max(2.5, variance * 1.8) : Math.max(4, variance * 2.5);
  const milestones = [250, 240, input.goalWeight ?? 230].filter((value, index, array) => array.indexOf(value) === index);
  return {
    projection_window_weeks: input.weeks,
    mode: input.mode,
    current_weight_trend_start: currentAvg === null ? null : Number(currentAvg.toFixed(1)),
    projected_median_end_weight: median === null ? null : Number(median.toFixed(1)),
    projected_low_end_weight: median === null ? null : Number((median - band).toFixed(1)),
    projected_high_end_weight: median === null ? null : Number((median + band).toFixed(1)),
    confidence,
    milestones:
      currentAvg === null
        ? milestones.map((weight_lbs) => ({ weight_lbs, estimated_date: null, confidence }))
        : generateMilestoneForecasts({
            startWeight: currentAvg,
            dailyChange: daily,
            weeks: input.weeks,
            milestones,
            confidence,
            startDate: input.startDate
          }),
    explanation:
      currentAvg === null
        ? "Log a weigh-in or provide a current profile weight to start a projection."
        : currentWeightLogs.length < 7
          ? "Using your latest available weight and planned calorie balance until at least 7 recent weigh-ins are available."
        : `Estimated ${input.weeks}-week range: ${(median - band).toFixed(1)}–${(median + band).toFixed(1)} lb. This is conditional, not guaranteed.`,
    limitations: ["Water retention, sodium, creatine, soreness, and missing logs can widen the range.", "Use this to plan, not to judge a single day."]
  };
}

export function generateScenarioProjection(args) {
  return ["current_plan", "reduce_150_calories", "add_2000_steps", "combined"].map((mode) =>
    generateWeightProjection({ ...args, mode })
  );
}
