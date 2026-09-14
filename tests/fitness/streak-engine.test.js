import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStreakStats, hitTargets } from "../../src/lib/fitness/gamification.js";

const STRATEGY = {
  calorie_target: 2000,
  protein_target_g: 150,
  fat_target_g: 65,
  carb_target_g: 200,
  step_target: 8000,
  lifting_days_target: 3,
  cardio_days_target: 2,
  goal_type: "body_recomposition",
};

function hitDay(date, overrides = {}) {
  return { date, calories: 2000, protein_g: 150, steps: 8000, ...overrides };
}

function missDay(date, overrides = {}) {
  return { date, calories: 3000, protein_g: 80, steps: 2000, ...overrides };
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

test("hitTargets returns true only when all three targets are met", () => {
  assert.equal(hitTargets(hitDay("2026-01-01"), STRATEGY), true);
  assert.equal(hitTargets(missDay("2026-01-01"), STRATEGY), false);
  assert.equal(hitTargets(null, STRATEGY), false);
  assert.equal(hitTargets(hitDay("2026-01-01"), null), false);
  // protein below 90% floor
  assert.equal(
    hitTargets(hitDay("2026-01-01", { protein_g: 130 }), STRATEGY),
    false
  );
  // steps below target when target is set
  assert.equal(
    hitTargets(hitDay("2026-01-01", { steps: 5000 }), STRATEGY),
    false
  );
});

test("current streak counts consecutive hit days ending today", () => {
  const logs = [hitDay(daysAgo(0)), hitDay(daysAgo(1)), hitDay(daysAgo(2))];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 3);
  assert.equal(stats.longest, 3);
  assert.equal(stats.lastBroken, 0);
});

test("a logged-but-missed today resets the current streak to zero", () => {
  const logs = [hitDay(daysAgo(1)), hitDay(daysAgo(2)), missDay(daysAgo(0))];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 0);
  assert.equal(stats.lastBroken, 2, "recovery nudge surfaces the lost run");
});

test("an unlogged today keeps the streak alive through yesterday", () => {
  const logs = [hitDay(daysAgo(1)), hitDay(daysAgo(2)), hitDay(daysAgo(3))];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 3);
});

test("freeze absorbs a single missed day after five hits", () => {
  // 6 hits, one miss in the middle (after 5 hits from today), then more hits
  const logs = [
    hitDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    hitDay(daysAgo(3)),
    hitDay(daysAgo(4)),
    missDay(daysAgo(5)),
    hitDay(daysAgo(6)),
    hitDay(daysAgo(7)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 8, "miss at day 5 is frozen, run continues");
  assert.equal(stats.freezeUsed, true);
  assert.equal(stats.frozenDate, daysAgo(5));
  assert.equal(stats.freezeArmed, false, "freeze already consumed");
});

test("freeze is not granted before five hits", () => {
  // only 3 hits then a miss — freeze not earned
  const logs = [
    hitDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    missDay(daysAgo(3)),
    hitDay(daysAgo(4)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 3, "streak stops at the unfrozen miss");
  assert.equal(stats.freezeUsed, false);
});

test("freeze is armed once five hits accumulate and no freeze used", () => {
  const logs = [
    hitDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    hitDay(daysAgo(3)),
    hitDay(daysAgo(4)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 5);
  assert.equal(stats.freezeArmed, true);
  assert.equal(stats.freezeUsed, false);
});

test("longest streak tracks the best run across full history", () => {
  // a 4-day run, a gap, then a 6-day run (current)
  const logs = [
    hitDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    hitDay(daysAgo(3)),
    hitDay(daysAgo(4)),
    hitDay(daysAgo(5)),
    // gap at daysAgo(6) (unlogged)
    hitDay(daysAgo(7)),
    hitDay(daysAgo(8)),
    hitDay(daysAgo(9)),
    hitDay(daysAgo(10)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 6);
  assert.equal(stats.longest, 6, "current 6-day run is the longest");
});

test("longest streak can exceed the current run", () => {
  // current run is 3, but an earlier 5-day run existed
  const logs = [
    hitDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    // gap at daysAgo(3)
    hitDay(daysAgo(4)),
    hitDay(daysAgo(5)),
    hitDay(daysAgo(6)),
    hitDay(daysAgo(7)),
    hitDay(daysAgo(8)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 3);
  assert.equal(stats.longest, 5, "earlier 5-day run is the personal best");
});

test("recovery nudge shows the lost streak when current is zero", () => {
  // today is a miss; a 4-day run ended yesterday
  const logs = [
    missDay(daysAgo(0)),
    hitDay(daysAgo(1)),
    hitDay(daysAgo(2)),
    hitDay(daysAgo(3)),
    hitDay(daysAgo(4)),
  ];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 0);
  assert.equal(stats.lastBroken, 4);
});

test("no streak history yields zeros with no recovery nudge", () => {
  const logs = [missDay(daysAgo(0)), missDay(daysAgo(1))];
  const stats = calculateStreakStats(logs, STRATEGY);
  assert.equal(stats.current, 0);
  assert.equal(stats.longest, 0);
  assert.equal(stats.lastBroken, 0);
});

test("missing strategy returns all zeros", () => {
  const stats = calculateStreakStats([hitDay(daysAgo(0))], null);
  assert.equal(stats.current, 0);
  assert.equal(stats.longest, 0);
  assert.equal(stats.lastBroken, 0);
});