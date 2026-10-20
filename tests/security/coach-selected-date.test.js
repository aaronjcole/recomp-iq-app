import test from "node:test";
import assert from "node:assert/strict";
import { coachDayFacts } from "../../base44/shared/coachDayContext.js";
import { buildCoachPrompt, normalizeCoachRequest, CoachRequestError } from "../../base44/shared/coachDomain.js";
import { makeCoachRequest } from "../../src/lib/coachContract.js";
const strategy = { calorie_target: 2000, protein_target_g: 150 };
const date = "2026-01-20";

test("selected-day facts never use another day's last log", () => {
  const facts = coachDayFacts([{ date: "2026-01-19", calories: 1500, protein_g: 100 }], strategy, date);
  assert.equal(facts.calories.consumed, null);
  assert.equal(facts.calories.remaining, null);
  assert.equal(facts.recorded, false);
});
test("known zero, missing metrics, over-target values and duplicate partial records retain meaning", () => {
  const facts = coachDayFacts([{ date, calories: 0, protein_g: 170, updated_date: "2026-01-20T10:00:00Z" }, { date, calories: 2100, updated_date: "2026-01-20T11:00:00Z" }], strategy, date);
  assert.equal(facts.calories.remaining, -100);
  assert.equal(facts.protein.remaining, -20);
  assert.equal(coachDayFacts([{ date, calories: 0 }], strategy, date).calories.remaining, 2000);
  assert.equal(coachDayFacts([{ date }], strategy, date).protein.remaining, null);
});
test("coach request accepts a real explicit date, rejects malformed dates, and keeps old callers compatible", () => {
  assert.equal(normalizeCoachRequest(makeCoachRequest("Protein?", [], date)).referenceDate, date);
  assert.equal(Object.hasOwn(normalizeCoachRequest({ message: "Hello" }), "referenceDate"), false);
  for (const referenceDate of ["bad", "2026-02-30", "2999-01-01", 0]) assert.throws(() => normalizeCoachRequest({ message: "Hello", referenceDate }), CoachRequestError);
});
test("prompt labels the selected date and current-target basis and refuses a substituted latest log", () => {
  const prompt = buildCoachPrompt({ request: normalizeCoachRequest({ message: "How much protein today?", referenceDate: date }), strategy, dailyLogs: [{ date: "2026-01-19", calories: 1500, notes: "private" }] });
  assert.match(prompt, /"reference_date":"2026-01-20"/);
  assert.match(prompt, /"latest_daily_log":null/);
  assert.match(prompt, /current targets \(not historical target snapshots\)/);
  assert.doesNotMatch(prompt, /"notes"/);
});

test("all Coach prompt fields share canonical merged records rather than contradictory partial duplicates", () => {
  const prompt = buildCoachPrompt({ request: normalizeCoachRequest({ message: "Protein?", referenceDate: date }), strategy,
    dailyLogs: [{ date, protein_g: 70, updated_date: `${date}T09:00:00Z` }, { date, calories: 1200, updated_date: `${date}T10:00:00Z` }] });
  const context = JSON.parse(prompt.split("CURRENT USER CONTEXT:\n")[1].split("\n\nCONVERSATION:")[0]);
  assert.equal(context.selected_date_facts.protein.consumed, 70);
  assert.equal(context.latest_daily_log.protein_g, 70);
  assert.equal(context.recent_daily_logs.length, 1);
  assert.equal(context.recent_daily_logs[0].protein_g, 70);
});
