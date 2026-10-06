// Weekly Check-In v2: the proposal a user reviews before any target changes.
// Shared by the app (which shows the proposal without writing anything) and
// the decideWeeklyCheckIn function (which recomputes it from the caller's own
// records and is the only path that applies it). Pure functions; see
// docs/features/weekly-check-in-v2.md.

import { decideWeeklyAdjustment } from "./fitnessAdjustments.js";
import {
  analyzeTrends,
  countConsecutiveFlatWeeks,
  dedupeLogsByDate,
  logsInCalendarWindow,
  normalizeDateKey
} from "./fitnessTrends.js";

// Bump when the proposal rules change, so a recorded check-in says which
// rules produced it and a stale client's proposal no longer matches.
export const WEEKLY_CHECK_IN_RULE_VERSION = "weekly-check-in/2";

export const CHECK_IN_STATUSES = Object.freeze(["proposed", "applied", "declined", "acknowledged", "superseded"]);
export const FINAL_CHECK_IN_STATUSES = Object.freeze(["applied", "declined", "acknowledged"]);
export const CHECK_IN_DECISIONS = Object.freeze(["apply", "keep_current", "customize"]);

// What a check-in may change on CurrentStrategy, and what is snapshotted
// before and after. Nothing else (goal, training days, manual_override) is
// ever written by a check-in.
export const CHECK_IN_TARGET_KEYS = Object.freeze([
  "calorie_target",
  "protein_target_g",
  "carb_target_g",
  "fat_target_g",
  "step_target",
  "behavior_focus"
]);

export const TARGET_LABELS = Object.freeze({
  calorie_target: { label: "Calories", unit: "kcal" },
  protein_target_g: { label: "Protein", unit: "g" },
  carb_target_g: { label: "Carbs", unit: "g" },
  fat_target_g: { label: "Fat", unit: "g" },
  step_target: { label: "Steps", unit: "steps" }
});

const DAY_MS = 86400000;

export class WeeklyCheckInError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = "WeeklyCheckInError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function dayNumber(key) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function shiftDateKey(key, days) {
  return new Date((dayNumber(key) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** The seven local calendar days ending on `referenceDate`. */
export function checkInPeriod(referenceDate) {
  const end = normalizeDateKey(referenceDate);
  if (!end) throw new WeeklyCheckInError(400, "invalid_reference_date", "referenceDate must be a YYYY-MM-DD date");
  const start = shiftDateKey(end, -6);
  return { start_date: start, end_date: end, period_key: `${start}:${end}` };
}

export function snapshotTargets(strategy) {
  const snapshot = {};
  for (const key of CHECK_IN_TARGET_KEYS) {
    const value = strategy?.[key];
    snapshot[key] = value === undefined ? null : value;
  }
  return snapshot;
}

export function targetsFingerprint(targets) {
  return CHECK_IN_TARGET_KEYS.map((key) => `${key}=${targets?.[key] ?? ""}`).join("|");
}

function targetChanges(previous, next) {
  const changes = [];
  for (const [key, { label, unit }] of Object.entries(TARGET_LABELS)) {
    const from = previous[key];
    const to = next[key];
    if (typeof to === "number" && to !== from) {
      changes.push({ key, label, unit, from, to, delta: typeof from === "number" ? to - from : null });
    }
  }
  return changes;
}

function windowCounts(logs, referenceDate) {
  const deduped = dedupeLogsByDate(logs);
  const current = logsInCalendarWindow(deduped, referenceDate, 7);
  const previous = logsInCalendarWindow(deduped, referenceDate, 7, 7);
  const weighIns = (rows) => rows.filter((log) => typeof log.weight_lbs === "number" && Number.isFinite(log.weight_lbs)).length;
  return {
    logged_days_current: current.length,
    missing_days_current: 7 - current.length,
    weigh_ins_current: weighIns(current),
    weigh_ins_previous: weighIns(previous)
  };
}

/**
 * How much the proposal can be trusted. Low: under 14 days of data or too few
 * weigh-ins for a weekly average (3 per week). High: both weeks well weighed
 * (5+ weigh-ins) with at most one unlogged day this week. Medium otherwise.
 */
export function checkInConfidence(metrics) {
  if (metrics.days_logged < 14 || metrics.weigh_ins_current < 3 || metrics.weigh_ins_previous < 3) return "low";
  if (metrics.weigh_ins_current >= 5 && metrics.weigh_ins_previous >= 5 && metrics.missing_days_current <= 1) return "high";
  return "medium";
}

function pct(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

export function decisionLabel(decision) {
  return String(decision ?? "").replace(/_/g, " ");
}

/**
 * The weekly check-in proposal for the seven days ending on `referenceDate`.
 * Deterministic: the same records always produce the same proposal and
 * fingerprint. It never writes anything.
 */
export function buildWeeklyCheckInProposal({ logs, profile, preferences, strategy, referenceDate }) {
  const period = checkInPeriod(referenceDate);
  const safeLogs = Array.isArray(logs) ? logs : [];
  const trend = analyzeTrends(safeLogs, strategy, { referenceDate: period.end_date });
  const consecutiveFlatWeeks = countConsecutiveFlatWeeks(safeLogs, period.end_date);
  const adjustment = decideWeeklyAdjustment({
    trend,
    profile: profile ?? {},
    preferences: preferences ?? {},
    strategy,
    consecutiveFlatWeeks
  });

  const manual = Boolean(strategy?.manual_override);
  const previous = snapshotTargets(strategy);
  const next = snapshotTargets({ ...strategy, ...adjustment.nextStrategy });
  const changes = targetChanges(previous, next);
  const focusChanged = (next.behavior_focus ?? "") !== (previous.behavior_focus ?? "");

  const metrics = {
    days_logged: trend.days_logged,
    ...windowCounts(safeLogs, period.end_date),
    avg_weight_current: trend.avg_weight_current_7_day,
    avg_weight_previous: trend.avg_weight_previous_7_day,
    weight_change_lbs: trend.weight_change_lbs,
    weight_change_percent_per_week: trend.weight_change_percent_per_week,
    waist_change_in: trend.waist_change_in,
    calorie_adherence: trend.calorie_adherence,
    protein_adherence: trend.protein_adherence,
    step_adherence: trend.step_adherence,
    workout_adherence: trend.workout_adherence,
    hunger_average: trend.hunger_average,
    energy_average: trend.energy_average,
    sleep_average: trend.sleep_average,
    trend_label: trend.trend_label,
    waist_label: trend.waist_label,
    recovery_label: trend.recovery_label,
    consecutive_flat_weeks: consecutiveFlatWeeks
  };

  const proposal = {
    rule_version: WEEKLY_CHECK_IN_RULE_VERSION,
    ...period,
    decision: adjustment.decision,
    reason: adjustment.reason,
    previous_targets: previous,
    targets_for_next_week: next,
    changes,
    focus_changed: focusChanged,
    has_changes: changes.length > 0 || focusChanged,
    manual,
    // Manual targets belong to the user, so a proposal is only advice there.
    applicable: !manual && (changes.length > 0 || focusChanged),
    safety_flag: adjustment.decision === "seek_professional_guidance",
    insufficient_data: adjustment.decision === "keep_collecting_data",
    confidence: checkInConfidence(metrics),
    supporting_metrics: metrics
  };
  return { ...proposal, fingerprint: proposalFingerprint(proposal) };
}

export function proposalFingerprint(proposal) {
  return [
    proposal.rule_version,
    proposal.period_key,
    proposal.decision,
    `manual=${proposal.manual ? 1 : 0}`,
    `from:${targetsFingerprint(proposal.previous_targets)}`,
    `to:${targetsFingerprint(proposal.targets_for_next_week)}`
  ].join("#");
}

export function summarizeProposal(proposal) {
  const m = proposal.supporting_metrics;
  const change = m.weight_change_lbs !== null && m.weight_change_lbs !== undefined
    ? ` (${m.weight_change_lbs > 0 ? "+" : ""}${m.weight_change_lbs} lb vs last week)`
    : "";
  return [
    `7-day avg weight: ${m.avg_weight_current ?? "—"} lb${change}.`,
    `Adherence — calories ${pct(m.calorie_adherence)}, protein ${pct(m.protein_adherence)}, steps ${pct(m.step_adherence)}, workouts ${pct(m.workout_adherence)}.`,
    `Recommendation: ${decisionLabel(proposal.decision)} — ${proposal.reason}`
  ].join(" ");
}

/** The WeeklyCheckIn row recorded for a proposal and the user's decision. */
export function checkInRecordData(proposal, { status, userDecision }) {
  const m = proposal.supporting_metrics;
  return {
    period_key: proposal.period_key,
    start_date: proposal.start_date,
    end_date: proposal.end_date,
    status,
    user_decision: userDecision,
    rule_version: proposal.rule_version,
    confidence: proposal.confidence,
    recommendation_decision: proposal.decision,
    decision_reason: proposal.reason,
    ai_summary: summarizeProposal(proposal),
    previous_targets: proposal.previous_targets,
    targets_for_next_week: proposal.targets_for_next_week,
    supporting_metrics: m,
    avg_weight_current: m.avg_weight_current ?? undefined,
    avg_weight_previous: m.avg_weight_previous ?? undefined,
    weight_change: m.weight_change_lbs ?? undefined,
    calorie_adherence: m.calorie_adherence ?? undefined,
    protein_adherence: m.protein_adherence ?? undefined,
    step_adherence: m.step_adherence ?? undefined,
    workout_adherence: m.workout_adherence ?? undefined,
    hunger_average: m.hunger_average ?? undefined,
    energy_average: m.energy_average ?? undefined,
    sleep_average: m.sleep_average ?? undefined
  };
}

/** The final status recorded when the user keeps or customizes their plan. */
export function nonApplyStatus(proposal) {
  return proposal.has_changes ? "declined" : "acknowledged";
}

/** The strategy patch an applied check-in writes: its target keys only. */
export function appliedStrategyPatch(targets) {
  const patch = {};
  for (const key of CHECK_IN_TARGET_KEYS) {
    const value = targets?.[key];
    if (value !== null && value !== undefined) patch[key] = value;
  }
  return patch;
}

/**
 * The check-in that stands for a period: the earliest-created row that is not
 * superseded, ties broken by id so every concurrent request picks the same one.
 */
export function standingCheckIn(rows, periodKey) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.period_key === periodKey && row.status !== "superseded")
    .sort((a, b) =>
      String(a.created_date ?? "").localeCompare(String(b.created_date ?? "")) || String(a.id).localeCompare(String(b.id))
    )[0] ?? null;
}

const MAX_FINGERPRINT_LENGTH = 4000;

/**
 * Validates a decideWeeklyCheckIn body. The reference date is the user's local
 * "today", so it may differ from the server's UTC date by one day either way,
 * never more.
 */
export function normalizeDecisionRequest(body, nowMs = Date.now()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WeeklyCheckInError(400, "invalid_request", "A JSON object body is required");
  }
  const decision = body.decision;
  if (!CHECK_IN_DECISIONS.includes(decision)) {
    throw new WeeklyCheckInError(400, "invalid_decision", "decision must be apply, keep_current or customize");
  }
  const referenceDate = normalizeDateKey(body.referenceDate);
  if (!referenceDate) {
    throw new WeeklyCheckInError(400, "invalid_reference_date", "referenceDate must be a YYYY-MM-DD date");
  }
  const serverDay = Math.floor(nowMs / DAY_MS);
  if (Math.abs(dayNumber(referenceDate) - serverDay) > 1) {
    throw new WeeklyCheckInError(400, "invalid_reference_date", "referenceDate must be today");
  }
  const fingerprint = body.proposalFingerprint;
  if (typeof fingerprint !== "string" || fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
    throw new WeeklyCheckInError(400, "invalid_fingerprint", "proposalFingerprint is required");
  }
  return { decision, referenceDate, proposalFingerprint: fingerprint };
}
