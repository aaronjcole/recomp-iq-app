import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES } from "./support/fixtures.js";
import { addDaysStr } from "../../src/lib/loggingDateUtils.js";

const endDate = "2025-12-15";
const log = (id, fields = {}) => ({ id, date: endDate, calories: 2000, protein_g: 100, carbs_g: 200, fat_g: 40, ...fields });
const food = (id, fields = {}) => ({ id, date: endDate, meal: "lunch", name: "Report oats", serving_description: "1 bowl", quantity: 1,
  calories: 200, protein_g: 10, carbs_g: 20, fat_g: 4, fiber_g: 5, source: "manual", ...fields });

// This test-only route honors real filtering/sort/skip/limit. The general
// smoke fixture intentionally does not paginate GETs; do not change it here.
async function installReport(page, { dailyLogs = [log("daily-report")], foodEntries = [food("food-report")], failPage = false, ignoreSkip = false } = {}) {
  const store = await installAuthenticatedBase44(page, { entities: { ...ENTITY_FIXTURES, DailyLog: dailyLogs, FoodLogEntry: foodEntries } });
  const calls = [];
  const control = { failPage, ignoreSkip };
  await page.route(/\/entities\/(DailyLog|FoodLogEntry)(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const entity = /\/entities\/(DailyLog|FoodLogEntry)/.exec(url.pathname)[1];
    const query = JSON.parse(url.searchParams.get("q") || "{}");
    expect(query.created_by_id).toBe(AUTH_USER.id);
    const limit = Number(url.searchParams.get("limit") || 50);
    const skip = Number(url.searchParams.get("skip") || 0);
    const bounded = query.date?.$gte && query.date?.$lte;
    if (bounded) calls.push({ entity, query, limit, skip, sort: url.searchParams.get("sort") });
    if (bounded && entity === "FoodLogEntry" && control.failPage && skip >= 250) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Page unavailable" }) });
    }
    const rows = (store.entities[entity] || []).filter((row) => row.created_by_id === query.created_by_id
      && Object.entries(query.date || {}).every(([op, date]) => ({ $gte: row.date >= date, $gt: row.date > date, $lte: row.date <= date, $lt: row.date < date })[op]));
    const sort = url.searchParams.get("sort") || "id";
    const field = sort.replace(/^[-+]/, "");
    rows.sort((a, b) => String(a[field] || "").localeCompare(String(b[field] || "")) * (sort.startsWith("-") ? -1 : 1));
    const offset = bounded && control.ignoreSkip ? 0 : skip;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(rows.slice(offset, offset + limit)) });
  });
  return { store, calls, control };
}

const report = (page) => page.getByRole("region", { name: "Nutrition report", exact: true });
const nutrient = (page, key) => report(page).getByTestId(`nutrition-metric-${key}`);

test("nutrition report paginates both bounded owner-scoped sources past 500 rows", async ({ page }) => {
  const assertNoErrors = watchPageErrors(page);
  const dailyLogs = Array.from({ length: 630 }, (_, i) => log(`report-log-${String(i).padStart(4, "0")}`, {
    date: addDaysStr(endDate, -(i % 30)), updated_date: new Date(Date.UTC(2025, 11, 15, 0, 0, i)).toISOString()
  }));
  const foodEntries = Array.from({ length: 630 }, (_, i) => food(`report-food-${String(i).padStart(4, "0")}`, {
    date: addDaysStr(endDate, -(i % 30)), name: i === 629 ? "After page 500 food" : "Bulk rice", calories: i === 629 ? 9000 : 2
  }));
  const { calls } = await installReport(page, { dailyLogs, foodEntries });
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  await expect(report(page).getByRole("heading", { name: "Average vs current targets" })).toBeVisible();
  await report(page).getByRole("button", { name: "30 days", exact: true }).click();
  await expect(report(page)).toContainText("630 itemized entries in this range");
  await expect(report(page).getByRole("list", { name: "Top foods by calories" })).toContainText("After page 500 food");
  await expect(nutrient(page, "calories")).toContainText("2,000 kcal");
  await expect(nutrient(page, "calories")).toContainText("2,200 kcal");
  await expect(nutrient(page, "calories")).toContainText("30/30");
  await expect(report(page)).toContainText("Complete macro coverage: 30/30 days");
  await expect(report(page).getByRole("list", { name: "Daily macro energy" }).getByRole("img")).toHaveCount(30);
  await expect(report(page).getByRole("alert")).toHaveCount(0);
  for (const entity of ["DailyLog", "FoodLogEntry"]) {
    expect(calls.some((call) => call.entity === entity && call.skip === 500 && call.query.date.$gte === "2025-11-16")).toBe(true);
    expect(calls.some((call) => call.entity === entity && call.skip === 630)).toBe(true);
  }
  for (const call of calls) {
    expect(call.query.created_by_id).toBe(AUTH_USER.id);
    expect(call.query.date.$lte).toBe(endDate);
    expect(call.sort).toBe("id");
  }
  assertNoErrors();
});

test("metric coverage distinguishes missing days, explicit zero, and incomplete macros", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReport(page, { dailyLogs: [log("one", { calories: 1800, carbs_g: null, fat_g: null }),
    log("two", { date: "2025-12-14", calories: 0, protein_g: null, carbs_g: null, fat_g: null })], foodEntries: [] });
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  await expect(nutrient(page, "calories")).toContainText("900 kcal");
  await expect(nutrient(page, "calories")).toContainText("2/7");
  await expect(nutrient(page, "protein_g")).toContainText("100 g");
  await expect(nutrient(page, "protein_g")).toContainText("1/7");
  await expect(nutrient(page, "carbs_g")).toContainText("0/7");
  await expect(nutrient(page, "carbs_g")).toContainText("—");
  await expect(report(page)).toContainText("CURRENT strategy targets");
  await expect(report(page)).toContainText("Manually entered daily totals cannot be attributed");
  await expect(report(page).getByRole("list", { name: "Daily macro energy" }).getByRole("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("nutrition-report-mobile.png"), fullPage: true });
});

test("nutrition deep link keeps its selected date through keyboard section navigation and date changes", async ({ page }) => {
  await installReport(page);
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  const tabs = page.getByRole("tablist", { name: "Progress sections" });
  const nutrition = tabs.getByRole("tab", { name: "Nutrition", exact: true });
  await expect(nutrition).toHaveAttribute("aria-selected", "true");
  await nutrition.focus();
  await nutrition.press("Home");
  await expect(tabs.getByRole("tab", { name: "Overview" })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`date=${endDate}`));
  await tabs.getByRole("tab", { name: "Overview" }).press("End");
  await expect(nutrition).toBeFocused();
  await expect(nutrition).toHaveAttribute("aria-controls", "progress-panel-nutrition");
  await expect(page.getByRole("tabpanel", { name: "Nutrition", exact: true })).toBeVisible();
  await expect(nutrient(page, "calories")).toContainText("2,000 kcal");
  await report(page).getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page).toHaveURL(/date=2025-12-14/);
  await expect(nutrient(page, "calories")).toContainText("0/7");
  await page.reload();
  await expect(nutrition).toHaveAttribute("aria-selected", "true");
  await expect(nutrient(page, "calories")).toContainText("0/7");
});

test("a later food-page failure is visibly partial while daily totals remain available, then refresh recovers", async ({ page }) => {
  const { control } = await installReport(page, { foodEntries: Array.from({ length: 610 }, (_, i) => food(`food-${i}`)), failPage: true });
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  await expect(report(page).getByRole("alert")).toContainText("Partial nutrition report");
  await expect(report(page).getByRole("alert")).toContainText("Itemized foods incomplete: A request failed.");
  await expect(nutrient(page, "calories")).toContainText("2,000 kcal");
  await expect(nutrient(page, "fiber_g")).toContainText("partial");
  await expect(report(page)).toContainText("250 itemized entries loaded (partial)");
  control.failPage = false;
  await report(page).getByRole("button", { name: "Refresh report" }).click();
  await expect(report(page)).toContainText("610 itemized entries in this range");
  await expect(report(page).getByRole("alert")).toHaveCount(0);
});

test("ignored pagination is reported as partial instead of repeating or inflating food totals", async ({ page }) => {
  await installReport(page, { foodEntries: Array.from({ length: 610 }, (_, i) => food(`food-${i}`)), ignoreSkip: true });
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  await expect(report(page).getByRole("alert")).toContainText("inconsistent pages");
  await expect(report(page)).toContainText("250 itemized entries loaded (partial)");
});

test("refresh and page reload re-fetch edited and deleted rows instead of using global cached history", async ({ page }) => {
  const { store } = await installReport(page);
  await page.goto(`/progress?section=nutrition&date=${endDate}`);
  await expect(nutrient(page, "calories")).toContainText("2,000 kcal");
  store.entities.DailyLog.find((row) => row.id === "daily-report").calories = 2300;
  store.entities.FoodLogEntry.find((row) => row.id === "food-report").name = "Edited report oats";
  await report(page).getByRole("button", { name: "Refresh report" }).click();
  await expect(nutrient(page, "calories")).toContainText("2,300 kcal");
  await expect(report(page).getByRole("list", { name: "Top foods by calories" })).toContainText("Edited report oats");
  store.entities.FoodLogEntry = [];
  store.entities.DailyLog.find((row) => row.id === "daily-report").calories = 2100;
  await page.reload();
  await expect(nutrient(page, "calories")).toContainText("2,100 kcal");
  await expect(report(page)).toContainText("0 itemized entries in this range");
  await expect(report(page).getByRole("list", { name: "Top foods by calories" })).toHaveCount(0);
});

test("local diary edits and deletes refresh the retained report without an explicit refresh", async ({ page }) => {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const { store } = await installReport(page, { dailyLogs: [log("daily-report", { date: today })], foodEntries: [food("food-report", { date: today })] });
  const assertNoErrors = watchPageErrors(page);
  await page.goto("/progress?section=nutrition");
  await expect(nutrient(page, "calories")).toContainText("2,000 kcal");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Fuel", exact: true }).click();
  await page.getByRole("button", { name: "Edit Report oats", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit food entry", exact: true });
  await editor.getByLabel("Quantity", { exact: true }).fill("2");
  await editor.getByLabel("Food name", { exact: true }).fill("Edited report oats");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => store.entities.DailyLog.find((row) => row.id === "daily-report")?.calories).toBe(2200);
  await page.getByRole("link", { name: "Nutrition report", exact: true }).click();
  await expect(nutrient(page, "calories")).toContainText("2,200 kcal");
  await expect(report(page).getByRole("list", { name: "Top foods by calories" })).toContainText("Edited report oats");
  await expect(report(page).getByRole("list", { name: "Top foods by calories" })).toContainText("400 kcal");
  await nav.getByRole("link", { name: "Fuel", exact: true }).click();
  await page.getByRole("button", { name: "Delete Edited report oats", exact: true }).click();
  await expect.poll(() => store.entities.FoodLogEntry.length).toBe(0);
  await expect.poll(() => store.entities.DailyLog.find((row) => row.id === "daily-report")?.calories).toBe(1800);
  await page.getByRole("link", { name: "Nutrition report", exact: true }).click();
  await expect(nutrient(page, "calories")).toContainText("1,800 kcal");
  await expect(report(page)).toContainText("0 itemized entries in this range");
  assertNoErrors();
});
