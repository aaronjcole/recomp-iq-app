import test from "node:test";
import assert from "node:assert/strict";
import { buildProgressInsights, goalDirection } from "../../src/lib/fitness/progressInsights.js";

// A full two weeks of good-adherence data; each test changes what it needs.
function trend(overrides = {}) {
  return {
    days_logged: 14,
    avg_weight_current_7_day: 180,
    avg_weight_previous_7_day: 181,
    weight_change_lbs: -1,
    waist_change_in: -0.3,
    calorie_adherence: 0.9,
    protein_adherence: 0.92,
    step_adherence: 0.95,
    workout_adherence: 1,
    sleep_average: 7.5,
    energy_average: 4,
    trend_label: "losing",
    waist_label: "down",
    recovery_label: "good",
    ...overrides
  };
}

const lift = (date, e1rm, name = "Bench Press") => ({ date, lift_name: name, estimated_1rm: e1rm });
const rising = [lift("2026-09-10", 200), lift("2026-10-02", 210), lift("2026-09-10", 300, "squat"), lift("2026-10-02", 306, "Squat ")];
const falling = [lift("2026-09-10", 210), lift("2026-10-02", 195)];

test("goals map to the weight direction that counts as progress", () => {
  assert.equal(goalDirection("fat_loss"), "loss");
  assert.equal(goalDirection("aggressive_fat_loss"), "loss");
  assert.equal(goalDirection("lean_bulk"), "gain");
  assert.equal(goalDirection("body_recomposition"), "recomp");
  assert.equal(goalDirection("maintenance"), "maintenance");
});

test("facts, signals and the explanation are kept separate", () => {
  const insights = buildProgressInsights({ trend: trend(), strengthLogs: rising, goal: "fat_loss" });
  assert.deepEqual(insights.observed.map((fact) => fact.measure), ["Weight", "Waist", "Strength", "Recovery", "Consistency"]);
  assert.match(insights.observed[0].text, /180 lb, -1 lb vs the week before/);
  // Lifts typed differently are one lift.
  assert.match(insights.observed[2].text, /across 2 lifts/);
  assert.deepEqual(insights.signals, {
    weight: "favorable", waist: "favorable", strength: "favorable", recovery: "favorable", adherence: "favorable"
  });
  assert.equal(insights.agreement, "agree");
  assert.match(insights.explanation.text, /consistent with fat loss/);
  assert.equal(insights.confidence, "high");
  assert.deepEqual(insights.missing, []);
});

test("weight down with strength down is a conflict, explained as possible muscle loss or fatigue", () => {
  const insights = buildProgressInsights({ trend: trend({ recovery_label: "poor" }), strengthLogs: falling, goal: "fat_loss" });
  assert.equal(insights.signals.strength, "unfavorable");
  assert.equal(insights.agreement, "conflict");
  assert.match(insights.explanation.text, /muscle loss or accumulated fatigue/);
  assert.match(insights.explanation.watch, /Recovery is also poor/);
});

test("waist down with a flat scale reads as possible recomposition, not a stall", () => {
  const insights = buildProgressInsights({
    trend: trend({ trend_label: "flat", weight_change_lbs: 0.1 }),
    strengthLogs: rising,
    goal: "fat_loss"
  });
  assert.match(insights.explanation.text, /recomposition/);
  assert.match(insights.explanation.text, /water retention/);
});

test("a gain during poor recovery is explained as likely water, not fat", () => {
  const insights = buildProgressInsights({
    trend: trend({ trend_label: "gaining", weight_change_lbs: 1.4, waist_label: "flat", waist_change_in: 0, recovery_label: "poor", sleep_average: 5.5 }),
    goal: "fat_loss"
  });
  assert.match(insights.explanation.text, /Water retention/);
  assert.equal(insights.signals.recovery, "unfavorable");
});

test("gain goals read rising weight as progress, and a rising waist as part fat", () => {
  const lean = buildProgressInsights({
    trend: trend({ trend_label: "gaining", weight_change_lbs: 0.5, waist_label: "flat", waist_change_in: 0 }),
    strengthLogs: rising,
    goal: "lean_bulk"
  });
  assert.equal(lean.signals.weight, "favorable");
  assert.match(lean.explanation.text, /lean gain/);
  const fat = buildProgressInsights({
    trend: trend({ trend_label: "gaining", weight_change_lbs: 0.9, waist_label: "up", waist_change_in: 0.4 }),
    goal: "lean_bulk"
  });
  assert.equal(fat.signals.waist, "unfavorable");
  assert.match(fat.explanation.text, /part of the gain is fat/);
});

test("low consistency is named before any body-composition reading, and caps confidence", () => {
  const insights = buildProgressInsights({
    trend: trend({ calorie_adherence: 0.6, step_adherence: 0.7 }),
    strengthLogs: rising,
    goal: "fat_loss"
  });
  assert.equal(insights.signals.adherence, "unfavorable");
  assert.match(insights.explanation.text, /below 80% for calories, steps/);
  assert.equal(insights.confidence, "medium");
});

test("missing measures are listed with a reason, and too little data stays low confidence", () => {
  const insights = buildProgressInsights({
    trend: trend({
      days_logged: 9,
      weight_change_lbs: null,
      trend_label: "insufficient_data",
      waist_change_in: null,
      waist_label: "unavailable",
      sleep_average: null,
      energy_average: null,
      recovery_label: "unknown"
    }),
    goal: "fat_loss"
  });
  assert.deepEqual(insights.missing.map((item) => item.measure), ["Weight", "Waist", "Strength", "Recovery"]);
  assert.equal(insights.agreement, "insufficient");
  assert.equal(insights.confidence, "low");
  assert.match(insights.explanation.text, /too early/);

  const none = buildProgressInsights({ trend: null, goal: "fat_loss" });
  assert.equal(none.explanation, null);
  assert.equal(none.missing[0].measure, "Everything");
});
