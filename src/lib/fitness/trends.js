// Ported 1:1 from RecompOne src/lib/fitness/trends.ts. Pure functions.

import { summarizeAdherence } from "./adherence.js";

const DAY_MS = 86400000;

function dateKey(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function dayNumber(value) {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function localTodayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function recordTimestamp(log, index) {
  const timestamp = Date.parse(log?.updated_date || log?.created_date || "");
  return Number.isFinite(timestamp) ? timestamp : index;
}

function mergeDefined(previous, next) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * Coalesces duplicate DailyLog-style records into one row per calendar date.
 * Later server timestamps win for overlapping fields while partial duplicate
 * records keep non-overlapping values from both rows.
 */
export function dedupeLogsByDate(logs) {
  const ordered = (Array.isArray(logs) ? logs : [])
    .map((log, index) => ({ log, index, key: dateKey(log?.date) }))
    .filter((item) => item.key)
    .sort((a, b) => a.key.localeCompare(b.key) || recordTimestamp(a.log, a.index) - recordTimestamp(b.log, b.index));
  const byDate = new Map();
  for (const { log, key } of ordered) {
    byDate.set(key, mergeDefined(byDate.get(key) || {}, { ...log, date: key }));
  }
  return [...byDate.values()];
}

export function logsInCalendarWindow(logs, endDate, windowDays, offsetDays = 0) {
  const end = dayNumber(endDate);
  if (end === null || !Number.isFinite(windowDays) || windowDays <= 0) return [];
  const windowEnd = end - Math.max(0, offsetDays);
  const windowStart = windowEnd - windowDays + 1;
  return logs.filter((log) => {
    const day = dayNumber(log.date);
    return day !== null && day >= windowStart && day <= windowEnd;
  });
}

export function sortLogs(logs) {
  return [...(Array.isArray(logs) ? logs : [])].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
}

export function average(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function calculateMovingAverage(points, windowDays) {
  const sorted = dedupeLogsByDate(points);
  return sorted.map((point) => {
    const window = logsInCalendarWindow(sorted, point.date, windowDays);
    const value = average(window.map((item) => item.value));
    return { date: point.date, value: value === null ? null : Number(value.toFixed(2)) };
  });
}

export function countConsecutiveFlatWeeks(logs, referenceDate, thresholdLbs = 0.3) {
  const sorted = dedupeLogsByDate(logs);
  const weights = sorted.filter((log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs));
  const endDate = dateKey(referenceDate) || dateKey(weights.at(-1)?.date);
  if (!endDate) return 0;

  let consecutive = 0;
  for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
    const current = logsInCalendarWindow(weights, endDate, 7, weekOffset * 7);
    const previous = logsInCalendarWindow(weights, endDate, 7, (weekOffset + 1) * 7);
    if (current.length < 3 || previous.length < 3) break;
    const change = average(current.map((log) => log.weight_lbs)) - average(previous.map((log) => log.weight_lbs));
    if (Math.abs(change) > thresholdLbs) break;
    consecutive++;
  }
  return consecutive;
}

export function analyzeTrends(logs, strategy, options = {}) {
  const sorted = dedupeLogsByDate(logs);
  const referenceDate = dateKey(options.referenceDate) || localTodayKey();
  const recent14 = logsInCalendarWindow(sorted, referenceDate, 14);
  const currentWindow = logsInCalendarWindow(sorted, referenceDate, 7);
  const previousWindow = logsInCalendarWindow(sorted, referenceDate, 7, 7);
  const current7 = currentWindow.filter((log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs));
  const previous7 = previousWindow.filter((log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs));
  const avgCurrent = current7.length >= 3 ? average(current7.map((log) => log.weight_lbs)) : null;
  const avgPrevious = previous7.length >= 3 ? average(previous7.map((log) => log.weight_lbs)) : null;
  const weightChange = avgCurrent !== null && avgPrevious !== null ? Number((avgCurrent - avgPrevious).toFixed(2)) : null;
  const weightPct = weightChange !== null && avgPrevious ? Number((weightChange / avgPrevious).toFixed(4)) : null;
  const currentWaist = average(currentWindow.map((log) => log.waist_in));
  const previousWaist = average(previousWindow.map((log) => log.waist_in));
  const waistChange =
    currentWaist !== null && previousWaist !== null ? Number((currentWaist - previousWaist).toFixed(2)) : null;
  const adherence = summarizeAdherence(
    currentWindow,
    {
      calories: strategy.calorie_target,
      protein: strategy.protein_target_g,
      steps: strategy.step_target,
      workouts: strategy.lifting_days_target
    },
    { expectedDays: 7 }
  );
  const hunger = average(currentWindow.map((log) => log.hunger_rating));
  const energy = average(currentWindow.map((log) => log.energy_rating));
  const sleep = average(currentWindow.map((log) => log.sleep_hours));
  const soreness = average(currentWindow.map((log) => log.soreness_rating));
  return {
    days_logged: recent14.length,
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
