// What base44/functions/decideWeeklyCheckIn does with the caller's records.
// Base44 has no transactions or unique constraints, so a decision is an
// idempotent state machine keyed by the check-in period:
//
//   1. The proposal is recomputed here from the caller's own records; the
//      client's copy is only accepted if its fingerprint matches.
//   2. One WeeklyCheckIn row stands for the period (the earliest created, see
//      standingCheckIn). A concurrent request that created a second row
//      deletes its own and settles the standing one instead.
//   3. Apply writes absolute targets stored on that row, then creates or reuses
//      one DecisionLedger entry linked to it, then marks the row applied. A
//      retry after a failure at any step finishes the same row and never
//      adjusts the targets a second time.
//
// Every query names the caller as owner (ownedQuery): admin RLS sees all rows.

import { isOwnedBy, ownedQuery } from "./ownerScope.js";
import {
  FINAL_CHECK_IN_STATUSES,
  WeeklyCheckInError,
  appliedStrategyPatch,
  buildWeeklyCheckInProposal,
  checkInPeriod,
  checkInRecordData,
  nonApplyStatus,
  normalizeDecisionRequest,
  snapshotTargets,
  standingCheckIn,
  targetsFingerprint
} from "./weeklyCheckInDomain.js";

// Enough rows for the 14-day trend plus countConsecutiveFlatWeeks' nine-week
// look-back, with room for duplicate rows on the same date.
export const CHECK_IN_LOG_LIMIT = 200;

// A `proposed` row younger than this is an apply still in flight in another
// request: keeping or customizing must not decline it underneath that apply.
// An older one can only be an interrupted apply, which the user may decline.
export const APPLY_IN_FLIGHT_MS = 60_000;

// The app reads the newest profile, preferences and strategy row; so does
// this, keeping only rows the caller owns.
async function loadInputs(entities, own, userId) {
  const mine = (rows) => rows.filter((row) => isOwnedBy(row, userId));
  const [profiles, preferences, strategies, logs] = await Promise.all([
    entities.UserProfile.filter(own(), "-created_date", 5),
    entities.UserPreferences.filter(own(), "-created_date", 5),
    entities.CurrentStrategy.filter(own(), "-created_date", 5),
    entities.DailyLog.filter(own(), "-date", CHECK_IN_LOG_LIMIT)
  ]);
  return {
    profile: mine(profiles)[0],
    preferences: mine(preferences)[0] ?? {},
    strategy: mine(strategies)[0],
    logs: mine(logs)
  };
}

async function standingFor(entities, own, userId, periodKey) {
  const rows = await entities.WeeklyCheckIn.filter(own({ period_key: periodKey }), "created_date", 20);
  return standingCheckIn(rows.filter((row) => isOwnedBy(row, userId)), periodKey);
}

async function linkedLedgerEntry(entities, own, userId, checkIn) {
  const existing = (await entities.DecisionLedger.filter(own({ weekly_check_in_id: checkIn.id }), "created_date", 10))
    .filter((row) => isOwnedBy(row, userId));
  if (existing.length) return existing[0];

  await entities.DecisionLedger.create({
    date: checkIn.end_date,
    previous_targets: checkIn.previous_targets,
    new_targets: checkIn.targets_for_next_week,
    reason: checkIn.decision_reason || checkIn.ai_summary,
    supporting_metrics: checkIn.supporting_metrics,
    weekly_check_in_id: checkIn.id
  });
  // A concurrent apply of the same check-in may have created one too: keep the
  // earliest and remove the rest (ties by id, so both requests agree).
  const linked = (await entities.DecisionLedger.filter(own({ weekly_check_in_id: checkIn.id }), "created_date", 10))
    .filter((row) => isOwnedBy(row, userId))
    .sort((a, b) =>
      String(a.created_date ?? "").localeCompare(String(b.created_date ?? "")) || String(a.id).localeCompare(String(b.id))
    );
  await Promise.allSettled(linked.slice(1).map((row) => entities.DecisionLedger.delete(row.id)));
  return linked[0];
}

async function finishApply(entities, own, userId, checkIn, strategy, nowMs) {
  const alreadyApplied = targetsFingerprint(snapshotTargets(strategy)) === targetsFingerprint(checkIn.targets_for_next_week);
  const updatedStrategy = alreadyApplied
    ? strategy
    : await entities.CurrentStrategy.update(strategy.id, appliedStrategyPatch(checkIn.targets_for_next_week));
  const ledgerEntry = await linkedLedgerEntry(entities, own, userId, checkIn);
  const applied = await entities.WeeklyCheckIn.update(checkIn.id, {
    status: "applied",
    user_decision: "apply",
    applied_at: new Date(nowMs).toISOString()
  });
  return { outcome: "applied", checkIn: applied, strategy: updatedStrategy, ledgerEntry };
}

function proposalChanged(proposal) {
  return new WeeklyCheckInError(409, "proposal_changed", "Your plan or data changed. Review the updated check-in.", { proposal });
}

/**
 * Settles a check-in that is still `proposed`: an apply that is in flight in
 * another request, or one that was interrupted before it finished.
 */
async function settleProposed(context, checkIn) {
  const { entities, own, user, request, inputs, nowMs } = context;
  const current = targetsFingerprint(snapshotTargets(inputs.strategy));
  // The strategy already carries this check-in's targets: the apply reached
  // step 3, so finish it (whatever this request asked), without re-adjusting.
  if (current === targetsFingerprint(checkIn.targets_for_next_week)) {
    return finishApply(entities, own, user.id, checkIn, inputs.strategy, nowMs);
  }
  if (current === targetsFingerprint(checkIn.previous_targets) && !inputs.strategy.manual_override) {
    if (request.decision === "apply") {
      return finishApply(entities, own, user.id, checkIn, inputs.strategy, nowMs);
    }
    const createdMs = Date.parse(checkIn.created_date ?? "");
    if (Number.isFinite(createdMs) && nowMs - createdMs < APPLY_IN_FLIGHT_MS) {
      throw new WeeklyCheckInError(409, "apply_in_progress", "This check-in is being applied in another window. Try again in a moment.");
    }
    const declined = await entities.WeeklyCheckIn.update(checkIn.id, { status: "declined", user_decision: request.decision });
    return { outcome: "recorded", checkIn: declined, strategy: inputs.strategy, ledgerEntry: null };
  }
  // The targets were changed some other way since: this proposal no longer
  // describes the plan, so it is retired and the user reviews a fresh one.
  await entities.WeeklyCheckIn.update(checkIn.id, { status: "superseded" });
  throw proposalChanged(buildWeeklyCheckInProposal({ ...inputs, referenceDate: request.referenceDate }));
}

async function settle(context, checkIn, createdId) {
  if (FINAL_CHECK_IN_STATUSES.includes(checkIn.status)) {
    return {
      outcome: checkIn.id === createdId ? "recorded" : "already_recorded",
      checkIn,
      strategy: context.inputs.strategy,
      ledgerEntry: null
    };
  }
  return settleProposed(context, checkIn);
}

/**
 * Records the caller's decision on this week's check-in and, for `apply`,
 * applies it exactly once. Returns { outcome, checkIn, strategy, ledgerEntry }
 * where outcome is "applied", "recorded" or "already_recorded".
 */
export async function decideWeeklyCheckIn(base44, user, body, { nowMs = Date.now() } = {}) {
  const request = normalizeDecisionRequest(body, nowMs);
  const entities = base44.entities;
  const own = (query) => ownedQuery(user.id, query);
  const inputs = await loadInputs(entities, own, user.id);
  if (!inputs.profile || !inputs.strategy) {
    throw new WeeklyCheckInError(409, "not_onboarded", "Finish onboarding before running a check-in");
  }
  const context = { entities, own, user, request, inputs, nowMs };
  const { period_key: periodKey } = checkInPeriod(request.referenceDate);

  const standing = await standingFor(entities, own, user.id, periodKey);
  if (standing) return settle(context, standing, null);

  const proposal = buildWeeklyCheckInProposal({ ...inputs, referenceDate: request.referenceDate });
  if (proposal.fingerprint !== request.proposalFingerprint) throw proposalChanged(proposal);
  if (request.decision === "apply" && !proposal.applicable) {
    throw new WeeklyCheckInError(
      422,
      "not_applicable",
      proposal.manual
        ? "Manual targets are on, so this check-in is advice only."
        : "This check-in does not change your targets."
    );
  }

  const status = request.decision === "apply" ? "proposed" : nonApplyStatus(proposal);
  const created = await entities.WeeklyCheckIn.create(checkInRecordData(proposal, { status, userDecision: request.decision }));
  const winner = await standingFor(entities, own, user.id, periodKey);
  if (!winner) throw new WeeklyCheckInError(500, "check_in_missing", "The check-in could not be recorded");
  if (winner.id !== created.id) {
    await entities.WeeklyCheckIn.delete(created.id).catch(() => undefined);
    return settle(context, winner, null);
  }
  return settle(context, created.status ? created : { ...created, status }, created.id);
}
