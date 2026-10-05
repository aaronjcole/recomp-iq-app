import test from "node:test";
import assert from "node:assert/strict";
import {
  blockProgress,
  blockWeekFor,
  parseCompletedSessions,
  withCompletedSession
} from "../../src/lib/fitness/trainingBlockProgress.js";

const weekStart = "2026-08-03"; // a Monday
const blockWeeks = 5;
const scheduleLength = 4;

function complete(completed, dayIndex, date) {
  return withCompletedSession(completed, { weekStart, blockWeeks, dayIndex, sessionId: `s-${date}`, date });
}

test("block weeks are counted from week_start and clamped to the block", () => {
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-08-03"), 1);
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-08-09"), 1);
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-08-10"), 2);
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-09-06"), 5);
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-12-01"), 5, "after the block ends it stays on the last week");
  assert.equal(blockWeekFor(weekStart, blockWeeks, "2026-07-01"), 1);
  assert.equal(blockWeekFor(undefined, blockWeeks, "2026-08-20"), 1);
});

test("each schedule day can be completed once per week, not once per block", () => {
  let completed = [];
  for (let day = 0; day < scheduleLength; day += 1) completed = complete(completed, day, "2026-08-04");
  assert.equal(complete(completed, 0, "2026-08-06"), null, "same day, same week is a no-op");

  // Week 2: everything is open again.
  const week2 = blockProgress({ completed, weekStart, blockWeeks, scheduleLength, today: "2026-08-11" });
  assert.equal(week2.week, 2);
  assert.equal(week2.doneThisWeek.size, 0);
  assert.equal(week2.nextDayIndex, 0);
  assert.equal(week2.completedCount, 4);

  completed = complete(completed, 0, "2026-08-11");
  assert.ok(completed, "week 2 day 0 can be completed");
  assert.equal(completed.at(-1).week, 2);
  const after = blockProgress({ completed, weekStart, blockWeeks, scheduleLength, today: "2026-08-12" });
  assert.equal(after.completedCount, 5);
  assert.equal(after.totalSessions, 20);
  assert.equal(after.nextDayIndex, 1);
});

test("a full block reaches 20 of 20", () => {
  let completed = [];
  for (let week = 0; week < blockWeeks; week += 1) {
    for (let day = 0; day < scheduleLength; day += 1) {
      const date = new Date(Date.UTC(2026, 7, 3 + week * 7 + day)).toISOString().slice(0, 10);
      completed = complete(completed, day, date);
    }
  }
  const progress = blockProgress({ completed, weekStart, blockWeeks, scheduleLength, today: "2026-09-06" });
  assert.equal(progress.completedCount, 20);
  assert.equal(progress.nextDayIndex, null);
});

test("completions saved before weeks were recorded are placed by their date", () => {
  const legacy = parseCompletedSessions(JSON.stringify([
    { day_index: 0, session_id: "a", completed_date: "2026-08-04" },
    { day_index: 1, session_id: "b", completed_date: "2026-08-12" }
  ]));
  const week2 = blockProgress({ completed: legacy, weekStart, blockWeeks, scheduleLength, today: "2026-08-13" });
  assert.deepEqual([...week2.doneThisWeek], [1]);
  assert.equal(week2.nextDayIndex, 0);
  assert.equal(week2.completedCount, 2);
  assert.deepEqual(parseCompletedSessions("not json"), []);
  assert.deepEqual(parseCompletedSessions('{"day_index":0}'), []);
});
