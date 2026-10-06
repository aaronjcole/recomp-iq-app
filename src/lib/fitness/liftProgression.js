// Per-exercise history, personal records and a conservative next-session
// suggestion. Pure functions; covered by tests/fitness/lift-progression.test.js.
//
// A StrengthLog row is one lift in one session: its best set (by estimated
// 1RM) plus the number of working sets. ExerciseSession.sets holds every set,
// which is what volume is computed from.

import { estimateOneRepMax } from "./calculators.js";

const DAY_MS = 86400000;
export const STALE_AFTER_DAYS = 14;
const PLATEAU_SESSIONS = 3;
const PLATEAU_TOLERANCE_LBS = 1;
const DECLINE_PERCENT = 5;
const REP_CEILING = 12;
const DELOAD_FACTOR = 0.9;

/** One key per exercise however it was typed: "Bench Press " and "bench  press" match. */
export function liftKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function dayNumber(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function e1rmOf(log) {
  if (typeof log.estimated_1rm === "number" && log.estimated_1rm > 0) return log.estimated_1rm;
  return estimateOneRepMax(Number(log.weight) || 0, Number(log.reps) || 0);
}

/**
 * Every logged session of one exercise, oldest first, each marked `is_pr` when
 * it beat every earlier session's estimated 1RM (the first session never is).
 */
export function liftSessions(strengthLogs, key) {
  const rows = (Array.isArray(strengthLogs) ? strengthLogs : [])
    .filter((log) => log && liftKey(log.lift_name) === key && /^\d{4}-\d{2}-\d{2}$/.test(String(log.date)))
    .map((log) => ({ ...log, estimated_1rm: e1rmOf(log) }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created_date ?? "").localeCompare(String(b.created_date ?? "")));
  let best = null;
  return rows.map((row) => {
    const isPr = best !== null && row.estimated_1rm > best;
    best = best === null ? row.estimated_1rm : Math.max(best, row.estimated_1rm);
    return { ...row, is_pr: isPr };
  });
}

/** Exercises with history, most-logged first, each with the latest spelling as its name. */
export function loggedLifts(strengthLogs) {
  const byKey = new Map();
  for (const log of Array.isArray(strengthLogs) ? strengthLogs : []) {
    const key = liftKey(log?.lift_name);
    if (!key) continue;
    const current = byKey.get(key) ?? { key, name: log.lift_name.trim(), count: 0, last: "" };
    current.count += 1;
    if (String(log.date) >= current.last) {
      current.last = String(log.date);
      current.name = log.lift_name.trim();
    }
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

function weekStart(date) {
  const day = dayNumber(date);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
  return new Date((day - weekday) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Weekly volume (sum of weight × reps over every logged set) for one exercise,
 * oldest week first, from ExerciseSession.sets.
 */
export function weeklyVolume(sessions, key, weeks = 8) {
  const byWeek = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(session?.date))) continue;
    for (const set of Array.isArray(session.sets) ? session.sets : []) {
      if (liftKey(set?.exercise_name) !== key) continue;
      const volume = (Number(set.weight_lbs) || 0) * (Number(set.reps) || 0);
      if (volume <= 0) continue;
      const week = weekStart(session.date);
      byWeek.set(week, (byWeek.get(week) ?? 0) + volume);
    }
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([week, volume]) => ({ week, volume: Math.round(volume) }));
}

/**
 * The entries a workout is about to save that beat the lift's best estimated
 * 1RM so far. A first-ever log of a lift is not a record.
 */
export function newPersonalRecords(strengthLogs, entries) {
  const records = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const history = liftSessions(strengthLogs, liftKey(entry.lift_name));
    if (history.length === 0) continue;
    const previous = Math.max(...history.map((row) => row.estimated_1rm));
    const value = e1rmOf(entry);
    if (value > previous) records.push({ lift_name: entry.lift_name, estimated_1rm: value, previous_1rm: previous });
  }
  return records;
}

function increment(weight) {
  return weight >= 50 ? 5 : 2.5;
}

function roundToPlate(weight) {
  return Math.max(0, Math.round(weight / 2.5) * 2.5);
}

/**
 * A conservative target for the next session of one exercise, or null with no
 * history. `recovery` is the weekly trend's recovery_label ("good", "moderate",
 * "poor" or "unknown"); `today` is the local YYYY-MM-DD date.
 *
 * Kinds: "progress" (double progression: +1 rep, or +weight at 12 reps),
 * "hold" (repeat last time), "deload" (about 90% after a stall).
 *
 * @param {Array<object>} strengthLogs
 * @param {string} key liftKey of the exercise
 * @param {{ recovery?: string, today?: string }} [options]
 */
export function nextSessionSuggestion(strengthLogs, key, { recovery = "unknown", today } = {}) {
  const history = liftSessions(strengthLogs, key);
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  const weight = Number(last.weight) || 0;
  const reps = Math.max(1, Number(last.reps) || 1);
  const sets = Math.max(1, Number(last.sets) || 1);
  const base = { last: { date: last.date, weight, reps, sets, estimated_1rm: last.estimated_1rm } };

  const daysAway = today ? dayNumber(today) - dayNumber(last.date) : 0;
  if (daysAway >= STALE_AFTER_DAYS) {
    return { ...base, kind: "hold", weight, reps, reason: `It's been ${daysAway} days. Repeat last time before adding load.` };
  }

  const recent = history.slice(-PLATEAU_SESSIONS);
  const stalled = recent.length === PLATEAU_SESSIONS
    && Math.max(...recent.map((row) => row.estimated_1rm)) - Math.min(...recent.map((row) => row.estimated_1rm)) <= PLATEAU_TOLERANCE_LBS;

  if (stalled && weight > 0) {
    return {
      ...base,
      kind: "deload",
      weight: roundToPlate(weight * DELOAD_FACTOR),
      reps,
      reason: recovery === "poor"
        ? "Stalled for 3 sessions and recovery is poor. Take a lighter session (about 90%), then build back."
        : "Stalled for 3 sessions. A lighter session (about 90%) usually helps more than grinding the same weight."
    };
  }

  if (recovery === "poor") {
    return { ...base, kind: "hold", weight, reps, reason: "Recovery is poor this week. Repeat last time rather than adding load." };
  }

  const previous = history[history.length - 2];
  if (previous && last.estimated_1rm < previous.estimated_1rm * (1 - DECLINE_PERCENT / 100)) {
    return { ...base, kind: "hold", weight, reps, reason: "Last session was down on the one before. Repeat it before progressing." };
  }

  if (weight === 0 || reps < REP_CEILING) {
    return { ...base, kind: "progress", weight, reps: reps + 1, reason: "Same weight, one more rep." };
  }
  const nextWeight = roundToPlate(weight + increment(weight));
  return {
    ...base,
    kind: "progress",
    weight: nextWeight,
    reps: Math.max(5, reps - 4),
    reason: `You reached ${reps} reps. Add ${nextWeight - weight} lb and work back up.`
  };
}
