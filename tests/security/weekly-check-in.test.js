import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WeeklyCheckInError,
  buildWeeklyCheckInProposal,
  checkInPeriod,
  normalizeDecisionRequest,
  standingCheckIn
} from "../../base44/shared/weeklyCheckInDomain.js";
import { decideWeeklyCheckIn } from "../../base44/shared/weeklyCheckInPersistence.js";
import { fakeBase44Client } from "./fakeBase44Client.js";

// Executes decideWeeklyCheckIn against an admin-visibility fake (every user's
// rows are readable), so only the code's own owner scoping keeps a decision on
// the caller's data. The scenario is a fat-loss plateau with good adherence,
// which the engine answers with a 150 kcal reduction.

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CALLER = { id: "user-caller" };
const OTHER = "user-other";
const TODAY = "2026-10-06";
const NOW = Date.parse(`${TODAY}T12:00:00.000Z`);

const STRATEGY = {
  id: "strategy-1",
  created_by_id: CALLER.id,
  created_date: "2026-08-01T00:00:00.000Z",
  calorie_target: 2200,
  protein_target_g: 180,
  carb_target_g: 220,
  fat_target_g: 70,
  step_target: 9000,
  lifting_days_target: 3,
  cardio_days_target: 2,
  goal_type: "fat_loss",
  behavior_focus: "Hit protein daily."
};
const PROFILE = { id: "profile-1", created_by_id: CALLER.id, goal: "fat_loss", job_activity: "active" };
const PREFERENCES = { id: "prefs-1", created_by_id: CALLER.id, safety_flags: [] };

function shift(days) {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function plateauLogs(days = 28, ownerId = CALLER.id) {
  return Array.from({ length: days }, (_, index) => ({
    id: `log-${ownerId}-${index}`,
    created_by_id: ownerId,
    date: shift(-index),
    weight_lbs: 200,
    calories: 2200,
    protein_g: 180,
    steps: 9000,
    sleep_hours: 7.5,
    energy_rating: 4,
    soreness_rating: 2,
    workout_completed: index % 2 === 0
  }));
}

function client({ strategy = STRATEGY, preferences = PREFERENCES, logs = plateauLogs(), extra = {}, fail = {}, leak = {} } = {}) {
  return fakeBase44Client({
    callerId: CALLER.id,
    tables: {
      UserProfile: [PROFILE],
      UserPreferences: [preferences],
      CurrentStrategy: [strategy],
      DailyLog: logs,
      WeeklyCheckIn: [],
      DecisionLedger: [],
      ...extra
    },
    fail,
    leak
  });
}

function proposalFor(base44) {
  const own = (name) => base44.store[name].filter((row) => row.created_by_id === CALLER.id);
  return buildWeeklyCheckInProposal({
    logs: own("DailyLog"),
    profile: own("UserProfile")[0],
    preferences: own("UserPreferences")[0],
    strategy: own("CurrentStrategy")[0],
    referenceDate: TODAY
  });
}

const decide = (base44, decision, proposal, overrides = {}) =>
  decideWeeklyCheckIn(
    base44,
    CALLER,
    { decision, referenceDate: TODAY, proposalFingerprint: proposal.fingerprint, ...overrides },
    { nowMs: NOW }
  );

const writesTo = (base44, entity) => base44.writes().filter((call) => call.entity === entity);

test("the plateau proposal is deterministic and lists the exact target changes", () => {
  const logs = plateauLogs();
  const input = { logs, profile: PROFILE, preferences: PREFERENCES, strategy: STRATEGY, referenceDate: TODAY };
  const proposal = buildWeeklyCheckInProposal(input);

  assert.equal(proposal.decision, "reduce_calories");
  assert.equal(proposal.period_key, `${shift(-6)}:${TODAY}`);
  assert.equal(proposal.applicable, true);
  assert.equal(proposal.confidence, "high");
  assert.equal(proposal.supporting_metrics.missing_days_current, 0);
  assert.deepEqual(
    proposal.changes.map(({ key, from, to }) => [key, from, to]),
    [["calorie_target", 2200, 2050], ["carb_target_g", 220, 183]]
  );
  // Out-of-order and duplicate rows for a date do not change the proposal.
  const shuffled = [...logs].reverse().concat(logs.slice(0, 5).map((log) => ({ ...log, id: `${log.id}-dup` })));
  assert.equal(buildWeeklyCheckInProposal({ ...input, logs: shuffled }).fingerprint, proposal.fingerprint);
  assert.equal(buildWeeklyCheckInProposal(input).fingerprint, proposal.fingerprint);
});

test("manual targets, safety flags and insufficient data never produce an applicable proposal", () => {
  const base = { logs: plateauLogs(), profile: PROFILE, preferences: PREFERENCES, strategy: STRATEGY, referenceDate: TODAY };

  const manual = buildWeeklyCheckInProposal({ ...base, strategy: { ...STRATEGY, manual_override: true } });
  assert.equal(manual.manual, true);
  assert.equal(manual.has_changes, true);
  assert.equal(manual.applicable, false);

  const flagged = buildWeeklyCheckInProposal({ ...base, preferences: { safety_flags: ["eating_disorder_history"] } });
  assert.equal(flagged.decision, "seek_professional_guidance");
  assert.equal(flagged.safety_flag, true);
  assert.equal(flagged.applicable, false);

  const early = buildWeeklyCheckInProposal({ ...base, logs: plateauLogs(10) });
  assert.equal(early.decision, "keep_collecting_data");
  assert.equal(early.insufficient_data, true);
  assert.equal(early.confidence, "low");
  assert.equal(early.applicable, false);
});

test("decision requests are validated before anything is read", () => {
  const body = { decision: "apply", referenceDate: TODAY, proposalFingerprint: "x" };
  assert.deepEqual(normalizeDecisionRequest(body, NOW), { decision: "apply", referenceDate: TODAY, proposalFingerprint: "x" });
  // The user's local today may be one day either side of the server's UTC date.
  assert.ok(normalizeDecisionRequest({ ...body, referenceDate: shift(1) }, NOW));
  assert.ok(normalizeDecisionRequest({ ...body, referenceDate: shift(-1) }, NOW));
  for (const bad of [
    null,
    [],
    { ...body, decision: "approve" },
    { ...body, referenceDate: "2026-10-6" },
    { ...body, referenceDate: shift(-3) },
    { ...body, referenceDate: shift(2) },
    { ...body, proposalFingerprint: "" },
    { ...body, proposalFingerprint: "x".repeat(5000) }
  ]) {
    assert.throws(() => normalizeDecisionRequest(bad, NOW), (error) => error instanceof WeeklyCheckInError && error.status === 400);
  }
  assert.throws(() => checkInPeriod("not-a-date"), WeeklyCheckInError);
});

test("applying changes the strategy once, links one ledger entry, and a repeat is a no-op", async () => {
  const base44 = client();
  const proposal = proposalFor(base44);
  const result = await decide(base44, "apply", proposal);

  assert.equal(result.outcome, "applied");
  assert.equal(result.checkIn.status, "applied");
  assert.equal(result.checkIn.user_decision, "apply");
  assert.equal(result.checkIn.applied_at, new Date(NOW).toISOString());
  assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2050);
  assert.equal(base44.store.CurrentStrategy[0].carb_target_g, 183);
  // Only check-in targets are written; goal and training days are untouched.
  assert.deepEqual(Object.keys(writesTo(base44, "CurrentStrategy")[0].args[1]).sort(), [
    "behavior_focus", "calorie_target", "carb_target_g", "fat_target_g", "protein_target_g", "step_target"
  ]);
  assert.equal(base44.store.WeeklyCheckIn.length, 1);
  assert.equal(base44.store.DecisionLedger.length, 1);
  const ledger = base44.store.DecisionLedger[0];
  assert.equal(ledger.weekly_check_in_id, result.checkIn.id);
  assert.equal(ledger.previous_targets.calorie_target, 2200);
  assert.equal(ledger.new_targets.calorie_target, 2050);

  // The same click again (or a network retry) returns the recorded check-in.
  const writesBefore = base44.writes().length;
  const again = await decide(base44, "apply", proposal);
  assert.equal(again.outcome, "already_recorded");
  assert.equal(again.checkIn.id, result.checkIn.id);
  assert.equal(base44.writes().length, writesBefore);
  assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2050);
});

test("two tabs applying the same proposal at once adjust the targets once", async () => {
  const base44 = client();
  const proposal = proposalFor(base44);
  const results = await Promise.all([decide(base44, "apply", proposal), decide(base44, "apply", proposal)]);

  assert.ok(results.every((result) => ["applied", "already_recorded"].includes(result.outcome)));
  assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2050);
  assert.equal(base44.store.WeeklyCheckIn.length, 1);
  assert.equal(base44.store.WeeklyCheckIn[0].status, "applied");
  assert.equal(base44.store.DecisionLedger.length, 1);
});

test("keeping the current plan records the decision without changing the strategy", async () => {
  const base44 = client();
  const result = await decide(base44, "keep_current", proposalFor(base44));
  assert.equal(result.outcome, "recorded");
  assert.equal(result.checkIn.status, "declined");
  assert.equal(result.checkIn.user_decision, "keep_current");
  assert.equal(writesTo(base44, "CurrentStrategy").length, 0);
  assert.equal(base44.store.DecisionLedger.length, 0);

  const nothingToChange = client({ logs: plateauLogs(10) });
  const acknowledged = await decide(nothingToChange, "keep_current", proposalFor(nothingToChange));
  assert.equal(acknowledged.checkIn.status, "acknowledged");
});

test("the client cannot apply a stale, manual, insufficient-data or safety-flagged proposal", async () => {
  // A fingerprint from another proposal answers 409 with the server's proposal.
  const stale = client();
  await assert.rejects(
    () => decide(stale, "apply", proposalFor(stale), { proposalFingerprint: "weekly-check-in/2#forged" }),
    (error) => error.status === 409 && error.code === "proposal_changed" && error.extra.proposal.decision === "reduce_calories"
  );
  assert.equal(stale.writes().length, 0);

  for (const base44 of [
    client({ strategy: { ...STRATEGY, manual_override: true } }),
    client({ logs: plateauLogs(10) }),
    client({ preferences: { ...PREFERENCES, safety_flags: ["pregnancy"] } })
  ]) {
    await assert.rejects(() => decide(base44, "apply", proposalFor(base44)), (error) => error.status === 422);
    assert.equal(base44.writes().length, 0);
  }

  // Manual mode can still record that the user kept their own targets.
  const manual = client({ strategy: { ...STRATEGY, manual_override: true } });
  const kept = await decide(manual, "keep_current", proposalFor(manual));
  assert.equal(kept.checkIn.status, "declined");
  assert.equal(writesTo(manual, "CurrentStrategy").length, 0);
});

test("a failure after the strategy update is repaired by retrying, without a second adjustment", async () => {
  for (const failing of ["WeeklyCheckIn.update", "DecisionLedger.create"]) {
    let failed = false;
    const base44 = client({
      fail: {
        [`user.${failing}`]: () => {
          if (failed) return null;
          failed = true;
          return Object.assign(new Error("network"), { status: 503 });
        }
      }
    });
    const proposal = proposalFor(base44);
    await assert.rejects(() => decide(base44, "apply", proposal), /network/);
    assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2050, failing);
    assert.equal(base44.store.WeeklyCheckIn[0].status, "proposed", failing);

    const retried = await decide(base44, "apply", proposal);
    assert.equal(retried.outcome, "applied", failing);
    assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2050, failing);
    assert.equal(writesTo(base44, "CurrentStrategy").length, 1, failing);
    assert.equal(base44.store.DecisionLedger.length, 1, failing);
    assert.equal(base44.store.WeeklyCheckIn[0].status, "applied", failing);
  }
});

test("keeping the plan cannot decline an apply that is still in flight, only an interrupted one", async () => {
  let failed = false;
  const base44 = client({
    fail: {
      "user.CurrentStrategy.update": () => {
        if (failed) return null;
        failed = true;
        return Object.assign(new Error("network"), { status: 503 });
      }
    }
  });
  const proposal = proposalFor(base44);
  await assert.rejects(() => decide(base44, "apply", proposal), /network/);
  const row = base44.store.WeeklyCheckIn[0];

  // Seconds later this looks like an apply running in another window.
  row.created_date = new Date(NOW - 5_000).toISOString();
  await assert.rejects(() => decide(base44, "keep_current", proposal), (error) => error.status === 409 && error.code === "apply_in_progress");
  assert.equal(row.status, "proposed");

  // Minutes later it can only be an interrupted apply, which the user may decline.
  row.created_date = new Date(NOW - 5 * 60_000).toISOString();
  const kept = await decide(base44, "keep_current", proposal);
  assert.equal(kept.checkIn.status, "declined");
  assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2200);
  assert.equal(base44.store.DecisionLedger.length, 0);
});

test("targets changed elsewhere before an interrupted apply finished are never overwritten", async () => {
  let failed = false;
  const base44 = client({
    fail: {
      "user.CurrentStrategy.update": () => {
        if (failed) return null;
        failed = true;
        return Object.assign(new Error("network"), { status: 503 });
      }
    }
  });
  const proposal = proposalFor(base44);
  await assert.rejects(() => decide(base44, "apply", proposal), /network/);
  // The user then sets their own calories on the Nutrition page.
  base44.store.CurrentStrategy[0].calorie_target = 2400;

  await assert.rejects(() => decide(base44, "apply", proposal), (error) => error.status === 409 && error.code === "proposal_changed");
  assert.equal(base44.store.CurrentStrategy[0].calorie_target, 2400);
  assert.equal(base44.store.WeeklyCheckIn[0].status, "superseded");
  assert.equal(base44.store.DecisionLedger.length, 0);
});

test("another owner's check-ins, strategy and logs never affect the caller's decision", async () => {
  const theirCheckIn = {
    id: "their-check-in",
    created_by_id: OTHER,
    created_date: "2026-01-01T00:00:00.000Z",
    period_key: `${shift(-6)}:${TODAY}`,
    status: "applied"
  };
  const theirStrategy = { ...STRATEGY, id: "their-strategy", created_by_id: OTHER, created_date: "2030-06-01T00:00:00.000Z", calorie_target: 3000 };
  const base44 = client({
    leak: {
      WeeklyCheckIn: [theirCheckIn],
      CurrentStrategy: [theirStrategy],
      DailyLog: plateauLogs(28, OTHER).map((log) => ({ ...log, weight_lbs: 250 }))
    }
  });
  const result = await decide(base44, "apply", proposalFor(base44));
  assert.equal(result.outcome, "applied");
  assert.notEqual(result.checkIn.id, theirCheckIn.id);
  assert.ok(writesTo(base44, "CurrentStrategy").every((call) => call.args[0] === STRATEGY.id));
  assert.equal(theirStrategy.calorie_target, 3000);
});

test("the standing check-in for a period is the earliest non-superseded row", () => {
  const key = "2026-09-30:2026-10-06";
  const rows = [
    { id: "b", period_key: key, created_date: "2026-10-06T10:00:00.000Z", status: "applied" },
    { id: "a", period_key: key, created_date: "2026-10-06T10:00:00.000Z", status: "proposed" },
    { id: "z", period_key: key, created_date: "2026-10-06T09:00:00.000Z", status: "superseded" },
    { id: "y", period_key: "other", created_date: "2026-10-01T00:00:00.000Z", status: "applied" }
  ];
  assert.equal(standingCheckIn(rows, key).id, "a");
  assert.equal(standingCheckIn([], key), null);
});

test("decideWeeklyCheckIn authenticates the caller and never takes an owner from the body", () => {
  const source = readFileSync(resolve(repoRoot, "base44/functions/decideWeeklyCheckIn/entry.ts"), "utf8");
  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.match(source, /if \(!user\?\.id\) return json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  assert.match(source, /decideWeeklyCheckIn\(base44, user, body\)/);
  assert.match(source, /error instanceof WeeklyCheckInError/);
  assert.doesNotMatch(source, /body\?\.(userId|owner_id|created_by_id)|asServiceRole/);
});
