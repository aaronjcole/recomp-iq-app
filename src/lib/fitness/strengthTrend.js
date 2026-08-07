// Pure strength-trend analysis for the Recomp Signal hero. Follows the engine
// conventions: pure functions, imported from ./trends helpers, exported via index.js.

import { sortLogs } from "./trends.js";

const WINDOW_DAYS = 28;
const MIN_SPAN_DAYS = 10;
const DAY_MS = 86400000;

/**
 * Computes an honest e1RM trend across lifts from StrengthLog records.
 * Returns null when there isn't enough data — never fabricates a number.
 *
 * @param {Array<{date:string, lift_name:string, estimated_1rm:number}>} strengthLogs
 * @returns {{change_percent:number, direction:"up"|"flat"|"down", lifts_used:number, per_lift:Array<{lift_name:string, change_percent:number}>, confidence:"low"|"medium"|"high"}|null}
 */
export function strengthTrend(strengthLogs) {
  if (!Array.isArray(strengthLogs) || strengthLogs.length < 2) return null;

  const byLift = new Map();
  for (const log of strengthLogs) {
    if (!log?.lift_name || typeof log.estimated_1rm !== "number") continue;
    if (!byLift.has(log.lift_name)) byLift.set(log.lift_name, []);
    byLift.get(log.lift_name).push(log);
  }

  const perLift = [];
  const rawChanges = [];
  let minDate = Infinity;
  let maxDate = -Infinity;

  for (const [liftName, logs] of byLift) {
    const sorted = sortLogs(logs);
    const latest = sorted[sorted.length - 1];
    const latestMs = new Date(latest.date).getTime();
    const windowStart = latestMs - WINDOW_DAYS * DAY_MS;
    const inWindow = sorted.filter((l) => new Date(l.date).getTime() >= windowStart);
    if (inWindow.length < 2) continue;

    const earliest = inWindow[0];
    const spanDays = (latestMs - new Date(earliest.date).getTime()) / DAY_MS;
    if (spanDays < MIN_SPAN_DAYS) continue;

    const base = earliest.estimated_1rm;
    if (!base) continue;

    const changePercent = ((latest.estimated_1rm - base) / base) * 100;
    rawChanges.push(changePercent);
    perLift.push({ lift_name: liftName, change_percent: Number(changePercent.toFixed(1)) });
    minDate = Math.min(minDate, new Date(earliest.date).getTime());
    maxDate = Math.max(maxDate, latestMs);
  }

  if (perLift.length === 0) return null;

  const liftsUsed = perLift.length;
  const avg = rawChanges.reduce((sum, v) => sum + v, 0) / liftsUsed;
  const changePercent = Number(avg.toFixed(1));
  const direction = changePercent > 1 ? "up" : changePercent < -1 ? "down" : "flat";
  const spanDays = (maxDate - minDate) / DAY_MS;

  /** @type {"low" | "medium" | "high"} */
  let confidence;
  if (liftsUsed >= 3 && spanDays >= 21) confidence = "high";
  else if (liftsUsed < 2 || spanDays < 14) confidence = "low";
  else confidence = "medium";

  return {
    change_percent: changePercent,
    direction,
    lifts_used: liftsUsed,
    per_lift: perLift,
    confidence
  };
}
