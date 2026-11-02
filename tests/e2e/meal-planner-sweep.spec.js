import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES } from "./support/fixtures.js";
import { buildAdaptiveMealPlan } from "../../base44/shared/adaptiveMealPlanDomain.js";
import { MEAL_PLAN_CACHE } from "../../src/lib/planCache.js";
import { todayStr } from "../../src/lib/loggingDateUtils.js";

test.describe.configure({ timeout: 60000 });
test.use({ viewport: { width: 320, height: 480 } });

const PLAN = buildAdaptiveMealPlan({
  weekStart: todayStr(),
  strategy: { calorie_target: 2200, protein_target_g: 170, carb_target_g: 210, fat_target_g: 70 },
  preferences: { diet_style: "Omnivore" }, checkIn: null
});
const PLAN_KEY = `${MEAL_PLAN_CACHE}_${AUTH_USER.id}`;
const RECIPE_A = { id: "sweep-rice", title: "Sweep rice batch", servings: 2, ingredients: [{ name: "Rice", quantity: 2, unit: "cup" }] };
const RECIPE_B = { id: "sweep-lentils", title: "Sweep lentil batch", servings: 2, ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }] };
const review = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const rebuild = (page) => page.getByRole("button", { name: "Rebuild this week", exact: true });
const swap = (page) => page.getByRole("button", { name: "Swap breakfast", exact: true }).first();
const mealLog = (page, plan = PLAN) => page.getByRole("button", { name: `Log ${plan.days[0].meals[0].title} on ${plan.days[0].date}`, exact: true });

async function installPlanner(page, plan = PLAN, recipes = [RECIPE_A, RECIPE_B]) {
  const mock = await installAuthenticatedBase44(page, {
    mealPlan: PLAN, entities: { ...ENTITY_FIXTURES, Recipe: recipes, FoodLogEntry: [] }
  });
  const noErrors = watchPageErrors(page);
  // Seed once only: subsequent reloads must inspect the page's own saved plan.
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
  }, { key: PLAN_KEY, value: plan });
  return { ...mock, noErrors };
}

async function openPlanner(page, plan = PLAN) {
  await page.goto("/nutrition/meal-plan");
  await expect(page.getByRole("heading", { name: plan.days[0].meals[0].title, exact: true }).first()).toBeVisible({ timeout: 15000 });
}

async function holdFunction(page, name, response) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  await page.route(`**/functions/${name}`, async (route) => {
    calls += 1;
    await gate;
    if (response) await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
    else await route.fallback();
  });
  return { release: () => release(), calls: () => calls };
}

test("long meal and grocery labels fit a short narrow screen and Log opens one cancellable review", async ({ page }, testInfo) => {
  const plan = structuredClone(PLAN);
  plan.days[0].meals[0].title = "LongMealName".repeat(14);
  plan.groceryList[0].name = "LongIngredientName".repeat(14);
  const mock = await installPlanner(page, plan);
  const before = JSON.stringify(mock.entities.DailyLog);
  await openPlanner(page, plan);
  const title = await page.getByRole("heading", { name: plan.days[0].meals[0].title, exact: true }).first().boundingBox();
  const swapButton = await swap(page).boundingBox();
  expect(title.x + title.width).toBeLessThanOrEqual(swapButton.x + 1);
  const groceries = page.getByRole("region", { name: "Meal plan grocery list", exact: true });
  await groceries.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const log = mealLog(page, plan);
  await log.click();
  await expect(review(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  // Visibility starts during slide-in; assert the settled sheet geometry, not
  // its intentionally off-screen entrance-animation frame.
  await expect.poll(async () => {
    const bounds = await review(page).boundingBox();
    return bounds ? bounds.y + bounds.height : Infinity;
  }).toBeLessThanOrEqual(481);
  const sheetBounds = await review(page).boundingBox();
  expect(sheetBounds.y).toBeGreaterThanOrEqual(0);
  expect(sheetBounds.y + sheetBounds.height).toBeLessThanOrEqual(481);
  await testInfo.attach("settled-review-geometry", { body: JSON.stringify(sheetBounds), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("settled-review.png") });
  await expect(review(page).getByLabel("Logging date", { exact: true })).toHaveValue(plan.days[0].date);
  await review(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review(page)).toHaveCount(0);
  await expect(log).toBeFocused();
  expect(mock.entities.FoodLogEntry).toEqual([]);
  expect(JSON.stringify(mock.entities.DailyLog)).toBe(before);
  mock.noErrors();
});

test("a pending swap locks rebuild, variety, logging and grocery edits until the week is consistent", async ({ page }) => {
  const mock = await installPlanner(page);
  const pending = await holdFunction(page, "swapAdaptiveMeal");
  await openPlanner(page);
  try {
    await swap(page).click();
    await expect.poll(pending.calls).toBe(1);
    await expect(rebuild(page)).toBeDisabled();
    await expect(mealLog(page)).toBeDisabled();
    for (const button of await page.getByRole("button", { name: /^Swap / }).all()) await expect(button).toBeDisabled();
    await expect(page.getByRole("button", { name: "Rotation", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "AI variety", exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Meal plan grocery list" }).getByRole("checkbox").first()).toBeDisabled();
  } finally { pending.release(); }
  await expect(rebuild(page)).toBeEnabled();
  await expect(mealLog(page)).toHaveCount(0);
  expect(mock.entities.FoodLogEntry).toEqual([]);
  mock.noErrors();
});

test("failed rebuild retains the old plan and grocery checks, then a retry replaces the week", async ({ page }) => {
  const mock = await installPlanner(page);
  const pending = await holdFunction(page, "generateAdaptiveMealPlan", { status: 503, body: { error: "Planner temporarily unavailable" } });
  await openPlanner(page);
  const grocery = page.getByRole("region", { name: "Meal plan grocery list" }).getByRole("checkbox").first();
  await grocery.check();
  try {
    await rebuild(page).click();
    await expect.poll(pending.calls).toBe(1);
    await expect(swap(page)).toBeDisabled();
    await expect(mealLog(page)).toBeDisabled();
    await expect(grocery).toBeDisabled();
    await expect(page.getByRole("heading", { name: PLAN.days[0].meals[0].title, exact: true }).first()).toBeVisible();
  } finally { pending.release(); }
  await expect(page.getByRole("alert")).toContainText("Planner temporarily unavailable");
  await expect(grocery).toBeChecked();
  await expect(rebuild(page)).toBeEnabled();
  // Remove only this spec's override; the existing SDK mock serves the retry.
  await page.unroute("**/functions/generateAdaptiveMealPlan");
  await rebuild(page).click();
  await expect(rebuild(page)).toBeEnabled();
  await expect(grocery).not.toBeChecked();
  expect(mock.entities.FoodLogEntry).toEqual([]);
  mock.noErrors();
});

test("leaving the planner during a swap cannot replace the cached week after unmount", async ({ page }) => {
  const mock = await installPlanner(page);
  const pending = await holdFunction(page, "swapAdaptiveMeal");
  await openPlanner(page);
  try {
    await swap(page).click();
    await expect.poll(pending.calls).toBe(1);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/nutrition$/);
    const response = page.waitForResponse((item) => item.url().includes("/functions/swapAdaptiveMeal"));
    pending.release();
    await response;
    await openPlanner(page);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PLAN_KEY)).toEqual(PLAN);
  } finally { pending.release(); }
  expect(mock.entities.FoodLogEntry).toEqual([]);
  mock.noErrors();
});

test("recipe groceries wrap controls and retain ticks when recipes are reselected individually", async ({ page }) => {
  const mock = await installPlanner(page);
  const openGroceries = async () => {
    await page.goto("/nutrition");
    await page.getByRole("tab", { name: "Tools", exact: true }).click();
    return page.getByRole("region", { name: "Recipe grocery list", exact: true });
  };
  let groceries = await openGroceries();
  await groceries.getByRole("button", { name: "Select all recipes", exact: true }).click();
  await groceries.getByRole("checkbox", { name: "2 cup Rice", exact: true }).check();
  await groceries.getByRole("checkbox", { name: "1 cup Lentils", exact: true }).check();
  const bounds = await groceries.boundingBox();
  for (const name of ["Select all recipes", "Clear checked"]) {
    const button = await groceries.getByRole("button", { name, exact: true }).boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(bounds.x);
    expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  groceries = await openGroceries();
  await groceries.getByRole("checkbox", { name: RECIPE_A.title, exact: true }).check();
  await expect(groceries.getByRole("checkbox", { name: "2 cup Rice", exact: true })).toBeChecked();
  await groceries.getByRole("checkbox", { name: RECIPE_B.title, exact: true }).check();
  await expect(groceries.getByRole("checkbox", { name: "1 cup Lentils", exact: true })).toBeChecked();
  mock.noErrors();
});

test("an incomplete cached plan is ignored instead of crashing the planner", async ({ page }) => {
  const mock = await installPlanner(page, { days: [], groceryList: [] });
  await page.goto("/nutrition/meal-plan");
  await expect(page.getByRole("button", { name: "Build this week", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(rebuild(page)).toHaveCount(0);
  mock.noErrors();
});
