import assert from "node:assert/strict";
import test from "node:test";
import {
  AutopilotRequestError,
  buildWeeklyAutopilotReview,
  normalizeAutopilotRequest
} from "../../base44/shared/weeklyAutopilotDomain.js";

const STRATEGY = {
  calorie_target: 2200,
  protein_target_g: 170,
  lifting_days_target: 3,
  goal_type: "body_recomposition"
};

const PROFILE = { goal: "body_recomposition", training_days_per_week: 3 };

function dailyLog(day, overrides = {}) {
  return {
    date: `2026-08-0${day}`,
    calories: 2200,
    protein_g: 170,
    weight_lbs: 180 - day * 0.1,
    sleep_hours: 7.5,
    energy_rating: 4,
    soreness_rating: 2,
    ...overrides
  };
}

const HABITS = [
  { id: "water", name: "Water", kind: "count", target_value: 100 },
  { id: "read", name: "Read", kind: "check" }
];

const HABIT_ENTRIES = Array.from({ length: 7 }, (_, index) => [
  { habit_id: "water", date: `2026-08-0${index + 1}`, value: 100 },
  { habit_id: "read", date: `2026-08-0${index + 1}`, done: true }
]).flat();

test("Weekly Autopilot connects five weekly signals and holds a well-supported plan steady", () => {
  const review = buildWeeklyAutopilotReview({
    weekEnd: "2026-08-07",
    strategy: STRATEGY,
    profile: PROFILE,
    preferences: { safety_flags: [] },
    logs: Array.from({ length: 7 }, (_, index) => dailyLog(index + 1)),
    sessions: [
      { date: "2026-08-01", type: "strength" },
      { date: "2026-08-03", type: "strength" },
      { date: "2026-08-05", type: "mixed" }
    ],
    habits: HABITS,
    habitEntries: HABIT_ENTRIES,
    checkIn: { recommendation_decision: "keep_plan" }
  });

  assert.equal(review.weekStart, "2026-08-01");
  assert.equal(review.weekEnd, "2026-08-07");
  assert.equal(review.confidence.level, "high");
  assert.deepEqual(review.scorecard.map((signal) => signal.key), [
    "nutrition", "training", "recovery", "habits", "progress"
  ]);
  assert.equal(review.primaryAction.key, "hold_steady");
  assert.match(review.mealPlanImpact, /keep/i);
  assert.match(review.trainingBlockImpact, /progress/i);
});

test("low nutrition consistency becomes the one primary action before target changes", () => {
  const review = buildWeeklyAutopilotReview({
    weekEnd: "2026-08-07",
    strategy: STRATEGY,
    profile: PROFILE,
    preferences: {},
    logs: [
      dailyLog(1, { calories: 2900, protein_g: 100 }),
      dailyLog(2, { calories: 2800, protein_g: 110 }),
      dailyLog(3, { calories: 2200, protein_g: 170 }),
      dailyLog(4, { calories: 2850, protein_g: 105 })
    ],
    sessions: [{ date: "2026-08-02", type: "strength" }],
    habits: HABITS,
    habitEntries: HABIT_ENTRIES.slice(0, 4),
    checkIn: { recommendation_decision: "focus_on_adherence" }
  });

  assert.equal(review.primaryAction.key, "nutrition_consistency");
  assert.match(review.primaryAction.title, /meal anchor/i);
  assert.match(review.mealPlanImpact, /simpl/i);
  assert.equal(review.scorecard.find((signal) => signal.key === "nutrition").status, "opportunity");
});

test("active safety guidance overrides automated adjustment suggestions", () => {
  const review = buildWeeklyAutopilotReview({
    weekEnd: "2026-08-07",
    strategy: STRATEGY,
    profile: PROFILE,
    preferences: { safety_flags: ["active"] },
    logs: [dailyLog(1), dailyLog(2), dailyLog(3)],
    sessions: [],
    habits: HABITS,
    habitEntries: [],
    checkIn: null
  });

  assert.equal(review.primaryAction.key, "safety_guidance");
  assert.equal(review.adjustmentsAllowed, false);
  assert.match(review.primaryAction.detail, /qualified professional/i);
});

test("missing data lowers confidence and duplicate calendar rows count once", () => {
  const review = buildWeeklyAutopilotReview({
    weekEnd: "2026-08-07",
    strategy: STRATEGY,
    profile: PROFILE,
    preferences: {},
    logs: [
      dailyLog(7, { id: "old", updated_date: "2026-08-07T08:00:00Z", calories: 1800, sleep_hours: null, energy_rating: null, soreness_rating: null }),
      dailyLog(7, { id: "new", updated_date: "2026-08-07T09:00:00Z", calories: 2200, sleep_hours: null, energy_rating: null, soreness_rating: null })
    ],
    sessions: [],
    habits: HABITS,
    habitEntries: [],
    checkIn: null
  });

  assert.equal(review.confidence.level, "low");
  assert.equal(review.confidence.loggedDays, 1);
  assert.equal(review.primaryAction.key, "collect_evidence");
  assert.equal(review.scorecard.find((signal) => signal.key === "recovery").status, "insufficient");
});

test("a goal-opposed weight signal asks for validation before changing targets", () => {
  const logs = Array.from({ length: 7 }, (_, index) => dailyLog(index + 1, {
    weight_lbs: 180 + index * 0.2
  }));
  const review = buildWeeklyAutopilotReview({
    weekEnd: "2026-08-07",
    strategy: { ...STRATEGY, goal_type: "fat_loss" },
    profile: { ...PROFILE, goal: "fat_loss" },
    preferences: {},
    logs,
    sessions: [
      { date: "2026-08-01", type: "strength" },
      { date: "2026-08-03", type: "strength" },
      { date: "2026-08-05", type: "strength" }
    ],
    habits: HABITS,
    habitEntries: HABIT_ENTRIES,
    checkIn: null
  });

  assert.equal(review.scorecard.find((signal) => signal.key === "progress").status, "opportunity");
  assert.equal(review.primaryAction.key, "validate_progress");
  assert.match(review.primaryAction.detail, /second week/i);
});

test("autopilot request dates are strict", () => {
  assert.deepEqual(normalizeAutopilotRequest({ weekEnd: "2026-08-07" }), { weekEnd: "2026-08-07" });
  assert.throws(
    () => normalizeAutopilotRequest({ weekEnd: "August 7" }),
    (error) => error instanceof AutopilotRequestError
  );
});
