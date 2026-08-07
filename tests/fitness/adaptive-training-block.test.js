import assert from "node:assert/strict";
import test from "node:test";
import {
  TrainingPlanRequestError,
  buildAdaptiveTrainingBlock,
  normalizeTrainingPlanRequest
} from "../../base44/shared/adaptiveTrainingBlockDomain.js";

const PROFILE = {
  training_days_per_week: 4,
  experience_level: "intermediate",
  goal: "body_recomposition"
};

const STRATEGY = {
  lifting_days_target: 4,
  goal_type: "body_recomposition"
};

const SESSIONS = [
  { date: "2026-07-30", type: "strength", duration_minutes: 55, perceived_exertion: 7 },
  { date: "2026-07-28", type: "strength", duration_minutes: 50, perceived_exertion: 7 },
  { date: "2026-07-25", type: "mixed", duration_minutes: 60, perceived_exertion: 8 },
  { date: "2026-07-22", type: "strength", duration_minutes: 52, perceived_exertion: 7 },
  { date: "2026-07-18", type: "strength", duration_minutes: 48, perceived_exertion: 7 },
  { date: "2026-07-15", type: "strength", duration_minutes: 50, perceived_exertion: 6 }
];

const STRENGTH_LOGS = [
  { date: "2026-07-30", lift_name: "Barbell Bench Press", estimated_1rm: 235 },
  { date: "2026-07-22", lift_name: "Barbell Bench Press", estimated_1rm: 230 },
  { date: "2026-07-28", lift_name: "Back Squat", estimated_1rm: 315 },
  { date: "2026-07-18", lift_name: "Back Squat", estimated_1rm: 305 },
  { date: "2026-07-25", lift_name: "Chest-Supported Row", estimated_1rm: 180 }
];

test("adaptive training builds the requested 4–6 week block with a final deload", () => {
  const plan = buildAdaptiveTrainingBlock({
    request: { weekStart: "2026-08-03", equipment: "full_gym", blockLengthWeeks: 5 },
    profile: PROFILE,
    preferences: { preferred_training: "strength" },
    strategy: STRATEGY,
    sessions: SESSIONS,
    strengthLogs: STRENGTH_LOGS,
    checkIn: { workout_adherence: 0.8, energy_average: 4, sleep_average: 4 }
  });

  assert.equal(plan.blockLengthWeeks, 5);
  assert.equal(plan.schedule.length, 4);
  assert.equal(plan.split, "upper_lower");
  assert.equal(plan.weeks.length, 5);
  assert.equal(plan.weeks.at(-1).phase, "deload");
  assert.ok(plan.schedule.every((session) => session.exercises.length >= 4));
  assert.ok(plan.schedule.flatMap((session) => session.exercises).every((exercise) => (
    exercise.sets >= 2 && exercise.targetRpe >= 6 && exercise.targetRpe <= 8
  )));
});

test("recent tracked lifts remain in the full-gym plan without prescribing invented loads", () => {
  const plan = buildAdaptiveTrainingBlock({
    request: { weekStart: "2026-08-03", equipment: "full_gym", blockLengthWeeks: 4 },
    profile: PROFILE,
    preferences: {},
    strategy: STRATEGY,
    sessions: SESSIONS,
    strengthLogs: STRENGTH_LOGS,
    checkIn: null
  });
  const exercises = plan.schedule.flatMap((session) => session.exercises);

  assert.ok(exercises.some((exercise) => exercise.name === "Barbell Bench Press"));
  assert.ok(exercises.some((exercise) => exercise.name === "Back Squat"));
  assert.ok(exercises.every((exercise) => !Object.hasOwn(exercise, "weight")));
  assert.match(plan.progressionRule, /rep range/i);
});

test("a bodyweight-home plan avoids gym-only equipment and keeps three beginner days", () => {
  const plan = buildAdaptiveTrainingBlock({
    request: { weekStart: "2026-08-03", equipment: "bodyweight_home", blockLengthWeeks: 4 },
    profile: { ...PROFILE, training_days_per_week: 3, experience_level: "beginner" },
    preferences: { preferred_training: "home workouts" },
    strategy: { ...STRATEGY, lifting_days_target: 3 },
    sessions: [],
    strengthLogs: [],
    checkIn: null
  });
  const exerciseNames = plan.schedule.flatMap((session) => session.exercises).map((exercise) => exercise.name.toLowerCase());

  assert.equal(plan.schedule.length, 3);
  assert.equal(plan.split, "full_body_rotation");
  assert.equal(plan.adaptation.mode, "on_ramp");
  assert.equal(exerciseNames.some((name) => /barbell|machine|lat pulldown/.test(name)), false);
});

test("low adherence and high exertion reduce starting volume", () => {
  const fatigued = buildAdaptiveTrainingBlock({
    request: { weekStart: "2026-08-03", equipment: "dumbbells", blockLengthWeeks: 6 },
    profile: { ...PROFILE, experience_level: "advanced" },
    preferences: {},
    strategy: STRATEGY,
    sessions: SESSIONS.map((session) => ({ ...session, perceived_exertion: 9 })),
    strengthLogs: STRENGTH_LOGS,
    checkIn: { workout_adherence: 0.45, energy_average: 2, sleep_average: 2 }
  });

  assert.equal(fatigued.adaptation.mode, "recovery_biased");
  assert.ok(fatigued.schedule.flatMap((session) => session.exercises).every((exercise) => exercise.sets <= 3));
  assert.ok(fatigued.weeks[0].targetRpe <= 6.5);
});

test("training-plan requests strictly validate date, equipment, and block length", () => {
  assert.deepEqual(normalizeTrainingPlanRequest({
    weekStart: "2026-08-03",
    equipment: "dumbbells",
    blockLengthWeeks: 6
  }), {
    weekStart: "2026-08-03",
    equipment: "dumbbells",
    blockLengthWeeks: 6
  });
  assert.throws(
    () => normalizeTrainingPlanRequest({ weekStart: "2026-08-03", equipment: "garage", blockLengthWeeks: 5 }),
    (error) => error instanceof TrainingPlanRequestError
  );
  assert.throws(
    () => normalizeTrainingPlanRequest({ weekStart: "2026-08-03", equipment: "full_gym", blockLengthWeeks: 7 }),
    (error) => error instanceof TrainingPlanRequestError
  );
});
