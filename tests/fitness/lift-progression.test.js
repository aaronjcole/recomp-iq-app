import test from "node:test";
import assert from "node:assert/strict";
import {
  liftKey,
  liftSessions,
  loggedLifts,
  newPersonalRecords,
  nextSessionSuggestion,
  weeklyVolume
} from "../../src/lib/fitness/liftProgression.js";
import { estimateOneRepMax } from "../../src/lib/fitness/calculators.js";

const log = (date, weight, reps, extra = {}) => ({
  date,
  lift_name: "Bench Press",
  weight,
  reps,
  sets: 3,
  estimated_1rm: estimateOneRepMax(weight, reps),
  ...extra
});

test("lifts are grouped however the name was typed", () => {
  assert.equal(liftKey("  Bench   Press "), "bench press");
  const logs = [
    log("2026-09-01", 185, 5),
    log("2026-09-08", 185, 6, { lift_name: "bench press" }),
    log("2026-09-03", 225, 5, { lift_name: "Squat" })
  ];
  assert.equal(liftSessions(logs, "bench press").length, 2);
  // The latest spelling names the lift; most-logged lifts come first.
  assert.deepEqual(loggedLifts(logs).map(({ key, name, count }) => [key, name, count]), [
    ["bench press", "bench press", 2],
    ["squat", "Squat", 1]
  ]);
});

test("a session is a PR only when it beats every earlier session", () => {
  const sessions = liftSessions([
    log("2026-09-15", 195, 5),
    log("2026-09-01", 185, 5),
    log("2026-09-08", 185, 5),
    log("2026-09-22", 190, 5)
  ], "bench press");
  assert.deepEqual(sessions.map((row) => [row.date, row.is_pr]), [
    ["2026-09-01", false],
    ["2026-09-08", false],
    ["2026-09-15", true],
    ["2026-09-22", false]
  ]);
});

test("new personal records compare against history; a first-ever log is not one", () => {
  const history = [log("2026-09-01", 185, 5), log("2026-09-08", 190, 5)];
  const records = newPersonalRecords(history, [
    log("2026-09-15", 195, 5),
    log("2026-09-15", 185, 5, { lift_name: "BENCH press" }),
    log("2026-09-15", 315, 5, { lift_name: "Deadlift" })
  ]);
  assert.deepEqual(records, [{ lift_name: "Bench Press", estimated_1rm: 228, previous_1rm: 222 }]);
});

test("weekly volume sums weight x reps per Monday-start week for that lift only", () => {
  const sessions = [
    { date: "2026-09-29", sets: [
      { exercise_name: "Bench Press", weight_lbs: 185, reps: 5 },
      { exercise_name: "bench press", weight_lbs: 185, reps: 5 },
      { exercise_name: "Squat", weight_lbs: 225, reps: 5 }
    ] },
    { date: "2026-10-04", sets: [{ exercise_name: "Bench Press", weight_lbs: 100, reps: 10 }] },
    { date: "2026-10-06", sets: [{ exercise_name: "Bench Press", weight_lbs: 0, reps: 20 }] },
    { date: "2026-10-07", sets: [{ exercise_name: "Bench Press", weight_lbs: 190, reps: 5 }] }
  ];
  assert.deepEqual(weeklyVolume(sessions, "bench press"), [
    { week: "2026-09-28", volume: 2850 },
    { week: "2026-10-05", volume: 950 }
  ]);
  assert.equal(weeklyVolume(sessions, "bench press", 1).length, 1);
});

test("the suggestion progresses with double progression", () => {
  const today = "2026-10-06";
  const plusRep = nextSessionSuggestion([log("2026-10-01", 185, 6)], "bench press", { recovery: "good", today });
  assert.deepEqual([plusRep.kind, plusRep.weight, plusRep.reps], ["progress", 185, 7]);
  assert.deepEqual(plusRep.last, { date: "2026-10-01", weight: 185, reps: 6, sets: 3, estimated_1rm: 222 });

  const plusWeight = nextSessionSuggestion([log("2026-10-01", 185, 12)], "bench press", { today });
  assert.deepEqual([plusWeight.kind, plusWeight.weight, plusWeight.reps], ["progress", 190, 8]);

  const light = nextSessionSuggestion([log("2026-10-01", 30, 12, { lift_name: "Curl" })], "curl", { today });
  assert.equal(light.weight, 32.5);

  const bodyweight = nextSessionSuggestion([log("2026-10-01", 0, 15, { lift_name: "Pull-up", estimated_1rm: 0 })], "pull-up", { today });
  assert.deepEqual([bodyweight.kind, bodyweight.weight, bodyweight.reps], ["progress", 0, 16]);

  assert.equal(nextSessionSuggestion([], "bench press", { today }), null);
});

test("the suggestion holds after poor recovery, a drop, or a long break", () => {
  const today = "2026-10-06";
  const poor = nextSessionSuggestion([log("2026-10-01", 185, 6)], "bench press", { recovery: "poor", today });
  assert.deepEqual([poor.kind, poor.weight, poor.reps], ["hold", 185, 6]);

  const dropped = nextSessionSuggestion([log("2026-09-28", 205, 5), log("2026-10-01", 185, 5)], "bench press", { today });
  assert.equal(dropped.kind, "hold");

  const away = nextSessionSuggestion([log("2026-09-20", 185, 6)], "bench press", { recovery: "good", today });
  assert.equal(away.kind, "hold");
  assert.match(away.reason, /16 days/);
});

test("three stalled sessions suggest a deload of about 10%", () => {
  const stalled = [log("2026-09-24", 185, 5), log("2026-09-28", 185, 5), log("2026-10-02", 185, 5)];
  const deload = nextSessionSuggestion(stalled, "bench press", { recovery: "good", today: "2026-10-06" });
  assert.deepEqual([deload.kind, deload.weight, deload.reps], ["deload", 167.5, 5]);
  const poor = nextSessionSuggestion(stalled, "bench press", { recovery: "poor", today: "2026-10-06" });
  assert.equal(poor.kind, "deload");
  assert.match(poor.reason, /recovery is poor/);
});
