// Ported 1:1 from RecompIQ src/lib/fitness/trends.ts. Pure functions.

import { summarizeAdherence } from "./adherence";

export function sortLogs(logs) {
  return [...logs].sort((a, b) => a.date.localeCompare(b.date));
}

export function average(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function calculateMovingAverage(points, windowDays) {
  return sortLogs(points).map((point, index, sorted) => {
    const window = sorted.slice(Math.max(0, index - windowDays + 1), index + 1);
    return { date: point.date, value: Number(average(window.map((item) => item.value)).toFixed(2)) };
  });
}

export function analyzeTrends(logs, strategy) {
  const sorted = sortLogs(logs);
  const weightLogs = sorted.filter((log) => typeof log.weight_lbs === "number");
  const current7 = weightLogs.slice(-7);
  const previous7 = weightLogs.slice(-14, -7);
  const avgCurrent = current7.length >= 3 ? average(current7.map((log) => log.weight_lbs)) : null;
  const avgPrevious = previous7.length >= 3 ? average(previous7.map((log) => log.weight_lbs)) : null;
  const weightChange = avgCurrent !== null && avgPrevious !== null ? Number((avgCurrent - avgPrevious).toFixed(2)) : null;
  const weightPct = weightChange !== null && avgPrevious ? Number((weightChange / avgPrevious).toFixed(4)) : null;
  const waistLogs = sorted.filter((log) => typeof log.waist_in === "number");
  const waistChange =
    waistLogs.length >= 2
      ? Number((waistLogs[waistLogs.length - 1].waist_in - waistLogs[0].waist_in).toFixed(2))
      : null;
  const adherence = summarizeAdherence(sorted.slice(-7), {
    calories: strategy.calorie_target,
    protein: strategy.protein_target_g,
    steps: strategy.step_target,
    workouts: strategy.lifting_days_target
  });
  const hunger = average(sorted.slice(-7).map((log) => log.hunger_rating));
  const energy = average(sorted.slice(-7).map((log) => log.energy_rating));
  const sleep = average(sorted.slice(-7).map((log) => log.sleep_hours));
  const soreness = average(sorted.slice(-7).map((log) => log.soreness_rating));
  return {
    days_logged: sorted.length,
    avg_weight_current_7_day: avgCurrent === null ? null : Number(avgCurrent.toFixed(2)),
    avg_weight_previous_7_day: avgPrevious === null ? null : Number(avgPrevious.toFixed(2)),
    weight_change_lbs: weightChange,
    weight_change_percent_per_week: weightPct,
    waist_change_in: waistChange,
    ...adherence,
    hunger_average: hunger === null ? null : Number(hunger.toFixed(1)),
    energy_average: energy === null ? null : Number(energy.toFixed(1)),
    sleep_average: sleep === null ? null : Number(sleep.toFixed(1)),
    trend_label:
      weightChange === null ? "insufficient_data" : weightChange < -0.3 ? "losing" : weightChange > 0.3 ? "gaining" : "flat",
    waist_label: waistChange === null ? "unavailable" : waistChange < -0.2 ? "down" : waistChange > 0.2 ? "up" : "flat",
    recovery_label:
      sleep === null && energy === null
        ? "unknown"
        : (sleep ?? 8) >= 7 && (energy ?? 3) >= 3 && (soreness ?? 3) <= 3
          ? "good"
          : (sleep ?? 8) < 6 || (energy ?? 3) <= 2 || (soreness ?? 3) >= 4
            ? "poor"
            : "moderate"
  };
}