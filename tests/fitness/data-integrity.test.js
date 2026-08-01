import test from "node:test";
import assert from "node:assert/strict";

import { summarizeAdherence } from "../../src/lib/fitness/adherence.js";
import { buildWeeklyQuests } from "../../src/lib/fitness/gamification.js";
import {
  analyzeTrends,
  countConsecutiveFlatWeeks,
  dedupeLogsByDate
} from "../../src/lib/fitness/trends.js";

const strategy = {
  calorie_target: 2000,
  protein_target_g: 160,
  step_target: 6000,
  lifting_days_target: 3
};

function dateRange(start, count) {
  const startMs = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(startMs + index * 86400000).toISOString().slice(0, 10)
  );
}

test("adherence merges out-of-order duplicates by server timestamp and rejects invalid dates", () => {
  const result = summarizeAdherence(
    [
      {
        date: "2026-01-01",
        calories: 2000,
        workout_completed: false,
        updated_date: "2026-01-01T12:00:00Z"
      },
      {
        date: "2026-01-01",
        calories: 0,
        workout_completed: true,
        updated_date: "2026-01-01T08:00:00Z"
      },
      { date: "2026-01-02", calories: 2000, workout_completed: true },
      { date: "2026-02-30", calories: 2000, workout_completed: true },
      { date: "2026-01-03-extra", calories: 2000, workout_completed: true },
      { date: "not-a-date", calories: 2000, workout_completed: true }
    ],
    { calories: 2000, protein: 160, steps: 6000, workouts: 2 },
    { expectedDays: 2 }
  );

  assert.equal(result.calorie_adherence, 1);
  assert.equal(result.workout_adherence, 0.5);
});

test("leap-day trend windows exclude stale, future, malformed, and duplicate records", () => {
  const dates = dateRange("2028-02-19", 14);
  const logs = dates.map((date, index) => ({
    date,
    weight_lbs: index < 7 ? 200 : 198,
    calories: 2000,
    protein_g: 160,
    steps: 6000,
    updated_date: `${date}T08:00:00Z`
  }));
  logs.reverse();
  logs.push(
    { date: "2028-02-18", weight_lbs: 500, calories: 0 },
    { date: "2028-03-04", weight_lbs: 40, calories: 0 },
    { date: "2028-02-30", weight_lbs: 1200, calories: 0 },
    {
      date: "2028-03-03",
      weight_lbs: 197,
      updated_date: "2028-03-03T20:00:00Z"
    }
  );

  const result = analyzeTrends(logs, strategy, { referenceDate: "2028-03-03" });
  assert.equal(result.days_logged, 14);
  assert.equal(result.avg_weight_previous_7_day, 200);
  assert.equal(result.avg_weight_current_7_day, 197.86);
  assert.equal(result.weight_change_lbs, -2.14);
  assert.equal(result.calorie_adherence, 1);
});

test("deduplication preserves partial fields while the newest overlapping value wins", () => {
  const result = dedupeLogsByDate([
    {
      date: "2026-01-01",
      weight_lbs: 200,
      calories: 1800,
      updated_date: "2026-01-01T20:00:00Z"
    },
    {
      date: "2026-01-01",
      weight_lbs: 201,
      protein_g: 160,
      updated_date: "2026-01-01T08:00:00Z"
    }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].weight_lbs, 200);
  assert.equal(result[0].calories, 1800);
  assert.equal(result[0].protein_g, 160);
});

test("plateau detection is calendar-based and ignores duplicate rows", () => {
  const logs = dateRange("2026-01-01", 21).flatMap((date) => [
    { date, weight_lbs: 200, updated_date: `${date}T08:00:00Z` },
    { date, weight_lbs: 200, updated_date: `${date}T20:00:00Z` }
  ]);
  logs.reverse();

  assert.equal(countConsecutiveFlatWeeks(logs, "2026-01-21"), 2);
  assert.equal(countConsecutiveFlatWeeks(logs, "2026-01-14"), 1);
});

test("weekly quests use unique dates from the current calendar window", () => {
  const stalePerfectWeek = dateRange("2026-01-01", 7).map((date) => ({
    date,
    weight_lbs: 200,
    protein_g: 160,
    steps: 6000,
    workout_completed: true,
    waist_in: 40
  }));
  const duplicateRecentDay = Array.from({ length: 10 }, (_, index) => ({
    date: "2026-02-01",
    weight_lbs: 199,
    protein_g: 160,
    steps: 6000,
    workout_completed: true,
    waist_in: 39.5,
    updated_date: `2026-02-01T${String(index + 8).padStart(2, "0")}:00:00Z`
  }));

  const quests = buildWeeklyQuests(
    [...stalePerfectWeek, ...duplicateRecentDay],
    strategy,
    { referenceDate: "2026-02-07" }
  );

  assert.deepEqual(
    quests.map(({ id, complete }) => [id, complete]),
    [
      ["weigh-ins", false],
      ["protein", false],
      ["steps", false],
      ["strength", false],
      ["measurement", true]
    ]
  );
  assert.equal(quests[0].detail, "1/5 morning weights");
  assert.equal(quests[3].detail, "1/3 sessions completed");
});
