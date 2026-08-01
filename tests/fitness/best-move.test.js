import test from "node:test";
import assert from "node:assert/strict";

import { deriveBestMove } from "../../src/lib/fitness/bestMove.js";

const strategy = {
  calorie_target: 2000,
  protein_target_g: 160,
  step_target: 7000
};

const signal = { score: 82, label: "High confidence" };

function trend(overrides = {}) {
  return {
    days_logged: 14,
    calorie_adherence: 0.9,
    protein_adherence: 0.9,
    step_adherence: 0.9,
    trend_label: "flat",
    recovery_label: "good",
    sleep_average: 7.5,
    energy_average: 4,
    ...overrides
  };
}

test("best move waits for enough evidence before suggesting a plan change", () => {
  const move = deriveBestMove({
    signal: { score: 30, label: "Early read" },
    strategy,
    todayLog: null,
    trend: trend({ days_logged: 6 })
  });

  assert.equal(move.id, "collect-data");
  assert.equal(move.action.type, "log");
  assert.match(move.summary, /6 of 14/);
  assert.match(move.guardrail, /does not change/);
});

test("poor recovery takes priority over nutrition and activity nudges", () => {
  const move = deriveBestMove({
    signal,
    strategy,
    todayLog: { calories: 500, protein_g: 20, steps: 1000 },
    trend: trend({
      recovery_label: "poor",
      protein_adherence: 0.4,
      step_adherence: 0.4,
      sleep_average: 5.5,
      energy_average: 2
    })
  });

  assert.equal(move.id, "recovery-first");
  assert.equal(move.action.to, "/training");
  assert.ok(move.alternatives.some((item) => item.label === "Cut calories"));
});

test("low consistency keeps the current plan instead of tightening targets", () => {
  const move = deriveBestMove({
    signal,
    strategy,
    todayLog: { calories: 1200, protein_g: 90, steps: 4000 },
    trend: trend({ calorie_adherence: 0.62, protein_adherence: 0.65 })
  });

  assert.equal(move.id, "repeat-plan");
  assert.match(move.title, /don’t tighten it/);
  assert.equal(move.action.to, "/nutrition");
});

test("a protein gap becomes the one daily move when weekly calorie consistency is sound", () => {
  const move = deriveBestMove({
    signal,
    strategy,
    todayLog: { calories: 1400, protein_g: 100, steps: 6500 },
    trend: trend({ protein_adherence: 0.7 })
  });

  assert.equal(move.id, "protein-first");
  assert.match(move.summary, /60g short/);
  assert.equal(move.action.to, "/nutrition");
});

test("the default move explicitly holds steady and never mutates its inputs", () => {
  const inputTrend = trend();
  const input = {
    preferences: {},
    signal,
    strategy,
    todayLog: { calories: 1900, protein_g: 155, steps: 7000 },
    trend: inputTrend
  };
  const before = structuredClone(input);
  const move = deriveBestMove(input);

  assert.equal(move.id, "hold-steady");
  assert.equal(move.action.to, "/more");
  assert.deepEqual(input, before);
});

test("an active safety flag keeps aggressive changes out of the recommendation", () => {
  const move = deriveBestMove({
    preferences: { safety_flags: ["clinical_context"] },
    signal,
    strategy,
    todayLog: {},
    trend: trend({ recovery_label: "poor" })
  });

  assert.equal(move.id, "safety-hold");
  assert.ok(move.alternatives.every((item) => item.reason.startsWith("Rejected")));
});
