import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES, ADAPTIVE_MEAL_PLAN } from "./support/fixtures.js";
import { todayStr, addDaysStr } from "../../src/lib/loggingDateUtils.js";

const TODAY = todayStr();
const PAST = addDaysStr(TODAY, -1);
const FUTURE = addDaysStr(TODAY, 1);
const RECIPE = {
  id: "recipe-review-rice", title: "Review rice batch", servings: 4, tags: ["batch"],
  ingredients: [{ name: "Rice", quantity: 2, unit: "cup" }],
  instructions: ["Cook the rice.", "Divide into four servings."],
  nutrition_basis: "batch", batch_nutrition: { calories: 1200, protein_g: 80, carbs_g: 160, fat_g: 24, fiber_g: 12 },
};
const sheet = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const confirm = (page) => sheet(page).getByRole("button", { name: /^Add to / });
const duplicateClick = (locator) => locator.evaluate((button) => { button.click(); button.click(); });
const openLibrary = async (page) => {
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(page.getByLabel("Search recipes", { exact: true })).toBeVisible();
};
const state = async (page, recipes = [RECIPE], options = {}) => installAuthenticatedBase44(page, {
  ...options, entities: { ...ENTITY_FIXTURES, Recipe: recipes, FoodLogEntry: [] },
});

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

test("recipe builder saves instructions and whole-batch nutrition once without writing to the diary", async ({ page }) => {
  const { entities } = await state(page, []);
  const noErrors = watchPageErrors(page);
  const logs = JSON.stringify(entities.DailyLog);
  await page.goto("/nutrition");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Recipe title", { exact: true }).fill("New batch soup");
  await page.getByLabel("Recipe servings", { exact: true }).fill("4");
  await page.getByLabel("Ingredient 1 name", { exact: true }).fill("Lentils");
  await page.getByLabel("Ingredient 1 quantity", { exact: true }).fill("2");
  await page.getByLabel("Ingredient 1 unit", { exact: true }).fill("cup");
  await page.getByLabel("Recipe instructions", { exact: true }).fill("Simmer lentils.\nDivide into portions.");
  for (const [label, value] of [["calories", "1200"], ["protein (g)", "80"], ["carbs (g)", "160"], ["fat (g)", "24"], ["fiber (g)", "12"]]) {
    await page.getByLabel(`Batch ${label}`, { exact: true }).fill(value);
  }
  await expect(page.getByText(/Per serving: Calories: 300/)).toContainText("Carbs (g): 40 · Fat (g): 6");
  await duplicateClick(page.getByRole("button", { name: "Save recipe", exact: true }));
  await expect.poll(() => entities.Recipe.length).toBe(1);
  expect(entities.Recipe[0]).toMatchObject({ title: "New batch soup", servings: 4, instructions: ["Simmer lentils.", "Divide into portions."], nutrition_basis: "batch", batch_nutrition: RECIPE.batch_nutrition });
  expect(entities.FoodLogEntry).toEqual([]);
  expect(JSON.stringify(entities.DailyLog)).toBe(logs);
  noErrors();
});

test("library search, persisted favorites, details, yield edits, portions and deletion preserve diary history", async ({ page }) => {
  const { entities } = await state(page, [RECIPE, { ...RECIPE, id: "recipe-other", title: "Other bowl", ingredients: [{ name: "Beans", quantity: 1, unit: "cup" }] }]);
  const noErrors = watchPageErrors(page);
  await page.goto(`/nutrition?date=${PAST}`);
  await openLibrary(page);
  await page.getByLabel("Search recipes", { exact: true }).fill("rice");
  await expect(page.getByRole("button", { name: "View Other bowl", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `Favorite ${RECIPE.title}`, exact: true }).click();
  await expect.poll(() => entities.Recipe.find((row) => row.id === RECIPE.id).is_favorite).toBe(true);
  await page.reload();
  await openLibrary(page);
  await page.getByRole("button", { name: "Favorites only", exact: true }).click();
  await expect(page.getByRole("button", { name: "View Other bowl", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Unfavorite ${RECIPE.title}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: `View ${RECIPE.title}`, exact: true }).click();
  await expect(page.getByText("Cook the rice.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Edit ${RECIPE.title}`, exact: true }).click();
  await page.getByLabel("Recipe servings", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect.poll(() => entities.Recipe.find((row) => row.id === RECIPE.id).servings).toBe(2);
  const previousDay = entities.DailyLog.find((row) => row.date === PAST).calories;
  const today = entities.DailyLog.find((row) => row.date === TODAY).calories;
  await page.getByRole("button", { name: `Log ${RECIPE.title}`, exact: true }).click();
  await expect(sheet(page).getByLabel("Logging date", { exact: true })).toHaveValue(PAST);
  await expect(sheet(page).getByLabel("Carbs (g)", { exact: true })).toHaveValue("80");
  expect(entities.FoodLogEntry).toHaveLength(0);
  await sheet(page).getByRole("button", { name: "Lunch", exact: true }).click();
  await sheet(page).getByLabel("Quantity", { exact: true }).fill("1.5");
  await expect(sheet(page).getByLabel("Fat (g)", { exact: true })).toHaveValue("18");
  await duplicateClick(confirm(page));
  await expect(sheet(page)).toHaveCount(0);
  expect(entities.FoodLogEntry).toHaveLength(1);
  expect(entities.FoodLogEntry[0]).toMatchObject({ source: "recipe", source_food_id: RECIPE.id, date: PAST, meal: "lunch", quantity: 1.5, calories: 900, protein_g: 60, carbs_g: 120, fat_g: 18, fiber_g: 9 });
  expect(entities.DailyLog.find((row) => row.date === PAST).calories).toBe(previousDay + 900);
  expect(entities.DailyLog.find((row) => row.date === TODAY).calories).toBe(today);
  await page.getByRole("button", { name: `Delete ${RECIPE.title}`, exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete recipe", exact: true }).click();
  await expect.poll(() => entities.Recipe.some((row) => row.id === RECIPE.id)).toBe(false);
  expect(entities.FoodLogEntry).toHaveLength(1);
  noErrors();
});

test("unknown recipe macros stay blank in review, block save, and cancel makes no diary changes", async ({ page }) => {
  const incomplete = { ...RECIPE, batch_nutrition: { calories: 800, protein_g: 40 }, carbs_g_per_serving: 99 };
  const { entities } = await state(page, [incomplete]);
  const logs = JSON.stringify(entities.DailyLog);
  await page.goto("/nutrition");
  await openLibrary(page);
  await expect(page.getByText(/Nutrition incomplete/)).toBeVisible();
  await page.getByRole("button", { name: `Log ${RECIPE.title}`, exact: true }).click();
  await expect(sheet(page).getByLabel("Carbs (g)", { exact: true })).toHaveValue("");
  await expect(sheet(page).getByLabel("Fat (g)", { exact: true })).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
  await sheet(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(entities.FoodLogEntry).toEqual([]);
  expect(JSON.stringify(entities.DailyLog)).toBe(logs);
});

test("failed recipe saves retain editor values and expose a retryable error", async ({ page }) => {
  await state(page, []);
  await page.route("**/entities/Recipe", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Recipe save unavailable" }) });
  });
  await page.goto("/nutrition");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByLabel("Recipe title", { exact: true }).fill("Keep my draft");
  await page.getByLabel("Ingredient 1 name", { exact: true }).fill("Rice");
  await page.getByLabel("Ingredient 1 quantity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save recipe", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Recipe|503/ })).toBeVisible();
  await expect(page.getByLabel("Recipe title", { exact: true })).toHaveValue("Keep my draft");
  await expect(page.getByRole("button", { name: "Save recipe", exact: true })).toBeEnabled();
});

test("planner build never logs, explicit Log reviews the planned historical date and future plans stay disabled", async ({ page }) => {
  const plan = { ...ADAPTIVE_MEAL_PLAN, days: ADAPTIVE_MEAL_PLAN.days.slice(0, 2).map((day, index) => ({ ...day, date: index ? FUTURE : PAST })) };
  const { entities } = await state(page, [], { mealPlan: plan });
  const logs = JSON.stringify(entities.DailyLog);
  const noErrors = watchPageErrors(page);
  await page.goto("/nutrition/meal-plan");
  await page.getByRole("button", { name: "Build this week", exact: true }).click();
  await expect(page.getByText("Future plan · logging unavailable", { exact: true })).toBeVisible();
  expect(entities.FoodLogEntry).toEqual([]);
  expect(JSON.stringify(entities.DailyLog)).toBe(logs);
  const futureLog = page.getByRole("button", { name: `Log ${plan.days[1].meals[0].title} on ${FUTURE}`, exact: true });
  await page.getByText("Future plan · logging unavailable", { exact: true }).click();
  await expect(futureLog).toBeDisabled();
  const meal = plan.days[0].meals[0];
  await page.getByRole("button", { name: `Log ${meal.title} on ${PAST}`, exact: true }).click();
  await expect(sheet(page).getByLabel("Logging date", { exact: true })).toHaveValue(PAST);
  await expect(sheet(page).getByRole("button", { name: "Breakfast", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet(page).getByLabel("Calories", { exact: true })).toHaveValue(String(meal.calories));
  expect(entities.FoodLogEntry).toEqual([]);
  await sheet(page).getByLabel("Quantity", { exact: true }).fill("0.5");
  await confirm(page).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(entities.FoodLogEntry).toEqual([expect.objectContaining({ date: PAST, meal: "breakfast", source: "plan", source_food_id: meal.id, calories: meal.calories / 2, carbs_g: meal.carbsG / 2 })]);
  noErrors();
});

test("recipe and planner grocery checks persist independently under the same account cache", async ({ page }) => {
  await state(page);
  const noErrors = watchPageErrors(page);
  await page.goto("/nutrition");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Select all recipes", exact: true }).click();
  await page.getByRole("checkbox", { name: "2 cup Rice", exact: true }).check();
  await page.goto("/nutrition/meal-plan");
  await page.getByRole("button", { name: "Build this week", exact: true }).click();
  await page.getByRole("checkbox", { name: "7 cup berries", exact: true }).check();
  await page.goto("/nutrition");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Select all recipes", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "2 cup Rice", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Clear checked", exact: true }).click();
  await page.goto("/nutrition/meal-plan");
  await expect(page.getByRole("checkbox", { name: "7 cup berries", exact: true })).toBeChecked();
  noErrors();
});
