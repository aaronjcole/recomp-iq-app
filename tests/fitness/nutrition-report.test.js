import test from "node:test";
import assert from "node:assert/strict";
import { buildNutritionReport, nutritionReportRange, nutritionValue } from "../../src/lib/nutritionReport.js";
import { fetchNutritionReportData, fetchNutritionReportEntity } from "../../src/lib/nutritionReportData.js";

const endDate = "2026-10-15";
const ownerId = "report-owner";
const strategy = { calorie_target: 2200, protein_target_g: 170, carb_target_g: 210, fat_target_g: 70 };
const daily = (id, fields = {}) => ({ id, date: endDate, created_by_id: ownerId, ...fields });
const food = (id, fields = {}) => daily(id, { name: "Oats", quantity: 2, calories: 200, protein_g: 10, carbs_g: 30, fat_g: 4, fiber_g: 5, ...fields });
const report = (fields = {}) => buildNutritionReport({ endDate, strategy, ...fields });
const metric = (result, key) => result.metrics.find((item) => item.key === key);

test("nutrition report ranges are inclusive across month, year, and leap boundaries", () => {
  assert.deepEqual(nutritionReportRange("2026-01-03", 7), { startDate: "2025-12-28", endDate: "2026-01-03", days: 7 });
  assert.equal(nutritionReportRange("2024-03-01", 30).startDate, "2024-02-01");
  for (const invalid of ["", "2026-02-30", "2026-13-01", "2026-2-01", null]) assert.throws(() => nutritionReportRange(invalid, 7));
  assert.throws(() => nutritionReportRange(endDate, 14));
});

test("unknown and malformed nutrients are never coerced to zero", () => {
  for (const value of [null, undefined, "", " ", NaN, Infinity, -1, "bad", false, true, [], {}]) assert.equal(nutritionValue(value), null);
  assert.equal(nutritionValue(0), 0);
  assert.equal(nutritionValue("0"), 0);
  assert.equal(nutritionValue("20.5"), 20.5);
});

test("missing days and missing metrics have independent average denominators", () => {
  const result = report({ dailyLogs: [daily("a", { calories: 2000, protein_g: 100, carbs_g: 0 }),
    daily("b", { date: "2026-10-14", calories: 0, protein_g: null, fat_g: 30 }),
    daily("weight-only", { date: "2026-10-13", weight_lbs: 180 })] });
  assert.equal(metric(result, "calories").average, 1000);
  assert.equal(metric(result, "calories").coverage, 2);
  assert.equal(metric(result, "protein_g").average, 100);
  assert.equal(metric(result, "protein_g").coverage, 1);
  assert.equal(metric(result, "carbs_g").average, 0);
  assert.equal(metric(result, "carbs_g").coverage, 1);
  assert.equal(metric(result, "fat_g").average, 30);
  assert.equal(result.byDay.length, 7);
  assert.equal(result.macroCoverage, 0);
});

test("an empty report has no averages or macro bars, not seven zero days", () => {
  const result = report();
  assert.ok(result.metrics.every((item) => item.average === null && item.coverage === 0));
  assert.ok(result.byDay.every((item) => item.macroEnergy === null));
  assert.equal(result.itemizedCount, 0);
});

test("macro energy uses 4/4/9, includes explicit zero, and is distinct from recorded calories", () => {
  const result = report({ dailyLogs: [daily("a", { calories: 999, protein_g: 10, carbs_g: 20, fat_g: 5 }),
    daily("zero", { date: "2026-10-14", protein_g: 0, carbs_g: 0, fat_g: 0 })] });
  assert.equal(result.byDay.at(-1).macroEnergy, 165);
  assert.deepEqual(result.byDay.at(-1).energy, { protein_g: 40, carbs_g: 80, fat_g: 45 });
  assert.equal(result.byDay.at(-2).macroEnergy, 0);
  assert.equal(result.macroCoverage, 2);
  assert.equal(metric(result, "calories").average, 999);
});

test("daily totals include itemized foods already and current targets do not depend on report dates", () => {
  const result = report({ dailyLogs: [daily("a", { calories: 2000, protein_g: 100 })], foodEntries: [food("f")] });
  assert.equal(metric(result, "calories").total, 2000);
  assert.equal(metric(result, "calories").target, 2200);
  assert.equal(metric(result, "protein_g").target, 170);
  assert.equal(metric(result, "carbs_g").target, 210);
  assert.equal(metric(result, "fat_g").target, 70);
  assert.equal(metric(result, "fiber_g").target, null);
  assert.equal(metric(report({ strategy: { calorie_target: 0 } }), "calories").percentOfTarget, null);
  assert.equal(metric(report({ strategy: {} }), "calories").target, null);
});

test("duplicate daily records take newest revision once, without reviving a cleared metric", () => {
  const old = daily("old", { calories: 1000, protein_g: 100, updated_date: "2026-10-15T01:00:00Z" });
  const latest = daily("new", { calories: 2000, protein_g: null, updated_date: "2026-10-15T02:00:00Z" });
  for (const dailyLogs of [[old, latest, old], [latest, old, old]]) {
    const result = report({ dailyLogs });
    assert.equal(metric(result, "calories").average, 2000);
    assert.equal(metric(result, "calories").coverage, 1);
    assert.equal(metric(result, "protein_g").coverage, 0);
    assert.equal(result.duplicateDailyCount, 2);
  }
});

test("duplicate food ids resolve to newest, but repeated names remain separate servings", () => {
  const old = food("a", { calories: 100, updated_date: "2026-10-15T01:00:00Z" });
  const edited = food("a", { calories: 300, updated_date: "2026-10-15T02:00:00Z" });
  const result = report({ foodEntries: [old, edited, food("b", { name: " oats ", calories: 200 })] });
  assert.equal(result.itemizedCount, 2);
  assert.deepEqual(result.contributors.calories, [{ name: "Oats", total: 500, entries: 2 }]);
  assert.equal(metric(result, "fiber_g").average, 10);
  assert.equal(metric(result, "calories").average, null);
});

test("fiber coverage requires every item on the day to have fiber, not just any item", () => {
  const result = report({ foodEntries: [food("a"), food("b", { fiber_g: undefined }),
    food("c", { date: "2026-10-14", fiber_g: 0 }), food("d", { date: "2026-10-13", fiber_g: null })] });
  assert.equal(metric(result, "fiber_g").coverage, 1);
  assert.equal(metric(result, "fiber_g").average, 0);
});

test("out-of-range, pending and unpersisted items do not enter contributors or coverage", () => {
  const result = report({ dailyLogs: [daily("past", { date: "2026-10-08", calories: 9000 }), daily("future", { date: "2026-10-16", calories: 9000 })],
    foodEntries: [food("past", { date: "2026-10-08" }), food("future", { date: "2026-10-16" }), food("pending", { pending: true }), food(null)] });
  assert.equal(result.itemizedCount, 0);
  assert.equal(metric(result, "calories").coverage, 0);
  assert.deepEqual(result.contributors.calories, []);
});

test("top five contributors rank each nutrient independently, without re-scaling quantity", () => {
  const result = report({ foodEntries: Array.from({ length: 7 }, (_, i) => food(`f${i}`, { name: `Food ${i}`, calories: i * 100, protein_g: 7 - i, quantity: 100 })) });
  assert.equal(result.contributors.calories.length, 5);
  assert.deepEqual(result.contributors.calories[0], { name: "Food 6", total: 600, entries: 1 });
  assert.equal(result.contributors.protein_g[0].name, "Food 0");
});

function paginated(rows, { serverCap = Infinity, failAt = Infinity, ignoreSkip = false } = {}) {
  const calls = [];
  return { calls, async filter(query, sort, limit, skip) {
    calls.push({ query, sort, limit, skip });
    if (skip >= failAt) throw new Error("outage");
    const offset = ignoreSkip ? 0 : skip;
    return rows.filter((row) => row.created_by_id === query.created_by_id && row.date >= query.date.$gte && row.date <= query.date.$lte)
      .sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + Math.min(limit, serverCap));
  } };
}
const query = { ownerId, startDate: "2026-10-09", endDate };

test("both report sources paginate independently beyond globally capped 500-row history", async () => {
  const rows = Array.from({ length: 630 }, (_, i) => daily(`id-${String(i).padStart(4, "0")}`, { calories: i }));
  const dailyEntity = paginated(rows);
  const foodEntity = paginated(rows.slice(0, 512));
  const result = await fetchNutritionReportData({ DailyLog: dailyEntity, FoodLogEntry: foodEntity }, { ownerId, endDate });
  assert.equal(result.daily.records.length, 630);
  assert.equal(result.foods.records.length, 512);
  assert.equal(result.daily.complete, true);
  assert.equal(result.foods.complete, true);
  assert.deepEqual(dailyEntity.calls.map((call) => call.skip), [0, 250, 500, 630]);
  assert.deepEqual(foodEntity.calls.map((call) => call.skip), [0, 250, 500, 512]);
  for (const call of [...dailyEntity.calls, ...foodEntity.calls]) {
    assert.deepEqual(call.query, { created_by_id: ownerId, date: { $gte: "2026-10-09", $lte: endDate } });
    assert.equal(call.sort, "id");
  }
});

test("short server-capped pages are not assumed to prove completeness", async () => {
  const entity = paginated(Array.from({ length: 510 }, (_, i) => daily(`f-${i}`)), { serverCap: 100 });
  const result = await fetchNutritionReportEntity(entity, query);
  assert.equal(result.records.length, 510);
  assert.equal(result.complete, true);
  assert.deepEqual(entity.calls.map((call) => call.skip), [0, 100, 200, 300, 400, 500, 510]);
});

test("a failed later page retains loaded records and does not fail the other source", async () => {
  const rows = Array.from({ length: 600 }, (_, i) => daily(`f-${i}`));
  const result = await fetchNutritionReportData({ DailyLog: paginated([daily("daily")]), FoodLogEntry: paginated(rows, { failAt: 250 }) }, { ownerId, endDate });
  assert.equal(result.daily.complete, true);
  assert.equal(result.foods.complete, false);
  assert.equal(result.foods.issue, "error");
  assert.equal(result.foods.records.length, 250);
});

test("ignored offsets and duplicate pages are partial, never complete or double counted", async () => {
  const result = await fetchNutritionReportEntity(paginated(Array.from({ length: 600 }, (_, i) => daily(`f-${i}`)), { ignoreSkip: true }), query);
  assert.equal(result.complete, false);
  assert.equal(result.issue, "pagination");
  assert.equal(result.records.length, 250);
  assert.equal(result.pages, 2);
});

test("an overlapping page stays partial even if the final empty page is reached", async () => {
  const pages = [[daily("a"), daily("b")], [daily("b"), daily("c")], []];
  const result = await fetchNutritionReportEntity({ filter: async () => pages.shift() }, query);
  assert.equal(result.records.length, 3);
  assert.equal(result.complete, false);
  assert.equal(result.issue, "pagination");
});

test("safety caps explicitly mark the report incomplete", async () => {
  const entity = paginated(Array.from({ length: 600 }, (_, i) => daily(`f-${i}`)));
  const result = await fetchNutritionReportEntity(entity, { ...query, maxRecords: 500 });
  assert.equal(result.complete, false);
  assert.equal(result.issue, "limit");
  assert.equal(result.records.length, 500);
  assert.equal(entity.calls.length, 2);
  const pageLimited = await fetchNutritionReportEntity(entity, { ...query, maxPages: 1 });
  assert.equal(pageLimited.issue, "limit");
});

test("empty successful sources are complete, while unavailable sources are not", async () => {
  const result = await fetchNutritionReportData({ DailyLog: paginated([]), FoodLogEntry: { filter: async () => { throw new Error("offline"); } } }, { ownerId, endDate });
  assert.equal(result.daily.complete, true);
  assert.equal(result.foods.complete, false);
  assert.equal(result.foods.records.length, 0);
});

test("malformed, unowned, out-of-range and oversized responses cannot claim complete coverage", async () => {
  for (const response of [{ data: [] }, [food("foreign", { created_by_id: "other" })], [food("past", { date: "2020-01-01" })], [{ date: endDate }], null]) {
    const result = await fetchNutritionReportEntity({ filter: async () => response }, query);
    assert.equal(result.complete, false);
    assert.equal(result.issue, "invalid-response");
    assert.equal(result.records.length, 0);
  }
  const oversized = await fetchNutritionReportEntity({ filter: async () => [daily("a"), daily("b")] }, { ...query, pageSize: 1 });
  assert.equal(oversized.issue, "invalid-response");
});

test("missing owner or invalid range fails closed before any request", async () => {
  let calls = 0;
  const entity = { filter: async () => { calls += 1; return []; } };
  for (const fields of [{ ownerId: "" }, { endDate: "2026-02-30" }, { days: 90 }]) {
    await assert.rejects(fetchNutritionReportData({ DailyLog: entity, FoodLogEntry: entity }, { ownerId, endDate, ...fields }));
  }
  assert.equal(calls, 0);
});
