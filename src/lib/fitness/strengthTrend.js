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

const PLATEAU_MIN_SESSIONS = 3;
const PLATEAU_EFFORT_THRESHOLD = 0.9;
const PLATEAU_1RM_TOLERANCE_LBS = 1;

/**
 * Detects lifts where the estimated 1RM has stalled across recent high-effort sessions.
 *
 * @param {Array<{date:string, lift_name:string, weight:number, reps:number, estimated_1rm:number}>} strengthLogs
 * @returns {Array<{lift_name:string, best_ever_1rm:number, recent_sessions:Array<{date:string, effort_pct:number, weight:number, reps:number, estimated_1rm:number}>}>}
 */
export function detectPlateaus(strengthLogs) {
  if (!Array.isArray(strengthLogs) || strengthLogs.length < PLATEAU_MIN_SESSIONS) return [];

  const byLift = new Map();
  for (const log of strengthLogs) {
    if (!log?.lift_name || typeof log.estimated_1rm !== "number") continue;
    if (!byLift.has(log.lift_name)) byLift.set(log.lift_name, []);
    byLift.get(log.lift_name).push(log);
  }

  const plateaus = [];

  for (const [liftName, logs] of byLift) {
    const sorted = logs.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const bestEver1rm = Math.max(...sorted.map((l) => l.estimated_1rm));
    if (!bestEver1rm) continue;

    const highEffort = sorted
      .map((l) => ({
        date: l.date,
        effort_pct: Math.round((l.estimated_1rm / bestEver1rm) * 100),
        weight: l.weight,
        reps: l.reps,
        estimated_1rm: l.estimated_1rm
      }))
      .filter((l) => l.effort_pct >= PLATEAU_EFFORT_THRESHOLD * 100);

    if (highEffort.length < PLATEAU_MIN_SESSIONS) continue;

    const recent = highEffort.slice(-PLATEAU_MIN_SESSIONS);
    const max1rm = Math.max(...recent.map((l) => l.estimated_1rm));
    const min1rm = Math.min(...recent.map((l) => l.estimated_1rm));

    if (max1rm - min1rm <= PLATEAU_1RM_TOLERANCE_LBS) {
      plateaus.push({ lift_name: liftName, best_ever_1rm: bestEver1rm, recent_sessions: recent });
    }
  }

  return plateaus;
}
