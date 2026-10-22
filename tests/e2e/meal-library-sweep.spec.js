import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import { todayStr, addDaysStr } from "../../src/lib/loggingDateUtils.js";

const TODAY = todayStr();
const PAST = addDaysStr(TODAY, -1);
const RECIPE = {
  id: "library-sweep-recipe", title: "Sweep rice bowl", servings: 2,
  ingredients: [{ name: "Rice", quantity: 2, unit: "cups" }],
  description: "A batch of rice", instructions: ["Cook rice.", "Divide into portions."],
  nutrition_basis: "batch", batch_nutrition: { calories: 600, protein_g: 40, carbs_g: 80, fat_g: 12, fiber_g: 6 }
};
const TEMPLATE = {
  id: "library-sweep-template", name: "Sweep saved dinner",
  items: [{ name: "Rice", serving_description: "1 cup", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 }],
  total_calories: 200, total_protein_g: 4, total_carbs_g: 44, total_fat_g: 1
};
test.use({ viewport: { width: 320, height: 740 } });

async function setup(page, recipes = [RECIPE], templates = [TEMPLATE], foods = ENTITY_FIXTURES.FoodItem) {
  const state = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, Recipe: recipes, MealTemplate: templates, FoodItem: foods, FoodLogEntry: [] }
  });
  return { ...state, noErrors: watchPageErrors(page) };
}
const doubleTap = (button) => button.evaluate((element) => { element.click(); element.click(); });
const review = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const editor = (page) => page.getByRole("region", { name: "Recipe editor", exact: true });
const templateName = (page) => page.getByLabel("Template name", { exact: true });

async function holdWrites(page, pattern, methods = ["POST"]) {
  let release;
  let started;
  const pending = new Promise((resolve) => { release = resolve; });
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const writes = [];
  await page.route(pattern, async (route) => {
    if (!methods.includes(route.request().method())) return route.fallback();
    writes.push(route.request().postDataJSON());
    started();
    await pending;
    await route.fallback();
  });
  return { writes, release, requestStarted };
}
async function draftTemplate(page) {
  await templateName(page).fill("New sweep meal");
  await page.getByLabel("Add item manually", { exact: true }).fill("Oats");
  await page.getByLabel("Template item calories", { exact: true }).fill("250");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
}
async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("long recipe content and narrow ingredient rows stay inside the phone viewport", async ({ page }) => {
  const longRecipe = { ...RECIPE, title: "R".repeat(200), description: "D".repeat(1000), instructions: ["I".repeat(600)], ingredients: [{ name: "L".repeat(200), quantity: 1, unit: "cup" }] };
  const { noErrors } = await setup(page, [longRecipe]);
  await page.goto("/nutrition?segment=library");
  await page.getByRole("button", { name: `View ${longRecipe.title}`, exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: `Delete ${longRecipe.title}`, exact: true }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Keep recipe", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${longRecipe.title}`, exact: true }).click();
  await expect(editor(page).getByLabel("Recipe title", { exact: true })).toBeFocused();
  const ingredient = await editor(page).getByLabel("Ingredient 1 name", { exact: true }).boundingBox();
  const quantity = await editor(page).getByLabel("Ingredient 1 quantity", { exact: true }).boundingBox();
  expect(ingredient.width).toBeGreaterThan(150);
  expect(quantity.y).toBeGreaterThan(ingredient.y);
  await expectNoHorizontalOverflow(page);
  noErrors();
});

test("a pending recipe save cannot be cancelled or replaced by another editor", async ({ page }) => {
  const { entities, noErrors } = await setup(page);
  await page.goto("/nutrition?segment=library");
  await page.getByRole("button", { name: `View ${RECIPE.title}`, exact: true }).click();
  await page.getByRole("button", { name: `Edit ${RECIPE.title}`, exact: true }).click();
  await editor(page).getByLabel("Recipe description", { exact: true }).fill("Saved description");
  const write = await holdWrites(page, "**/entities/Recipe/*", ["PUT", "PATCH"]);
  try {
    await doubleTap(editor(page).getByRole("button", { name: "Save recipe", exact: true }));
    await write.requestStarted;
    await expect(editor(page).getByRole("button", { name: "Cancel recipe editing", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Create recipe", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Log ${RECIPE.title}`, exact: true })).toHaveCount(0);
    expect(write.writes).toHaveLength(1);
  } finally { write.release(); }
  await expect(editor(page)).toHaveCount(0);
  await expect.poll(() => entities.Recipe[0].description).toBe("Saved description");
  await expect(page.getByRole("button", { name: `Edit ${RECIPE.title}`, exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Create recipe", exact: true }).click();
  await expect(editor(page).getByLabel("Recipe title", { exact: true })).toHaveValue("");
  await editor(page).getByRole("button", { name: "Cancel recipe editing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create recipe", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: `View ${RECIPE.title}`, exact: true })).toBeVisible();
  noErrors();
});

test("repeated favorite taps write once before the disabled state commits", async ({ page }) => {
  const { entities, noErrors } = await setup(page);
  await page.goto("/nutrition?segment=library");
  const write = await holdWrites(page, "**/entities/Recipe/*", ["PUT", "PATCH"]);
  try {
    await doubleTap(page.getByRole("button", { name: `Favorite ${RECIPE.title}`, exact: true }));
    await write.requestStarted;
    expect(write.writes).toHaveLength(1);
  } finally { write.release(); }
  await expect.poll(() => entities.Recipe[0].is_favorite).toBe(true);
  await expect(page.getByRole("button", { name: `Unfavorite ${RECIPE.title}`, exact: true })).toBeEnabled();
  noErrors();
});

test("recipe review disappears on browser navigation and does not reopen from a hidden cached tab", async ({ page }) => {
  const { entities, noErrors } = await setup(page);
  await page.goto("/more");
  await page.getByRole("button", { name: /^Meal templates/ }).click();
  await page.getByRole("button", { name: `Log ${RECIPE.title}`, exact: true }).click();
  await expect(review(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/more$/);
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Meal templates/ }).click();
  await expect(page.getByLabel("Search recipes", { exact: true })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  expect(entities.FoodLogEntry).toEqual([]);
  noErrors();
});

test("the template food picker is constrained and closes when leaving its cached page", async ({ page }) => {
  const food = { ...ENTITY_FIXTURES.FoodItem[0], name: "F".repeat(200) };
  const { noErrors } = await setup(page, [RECIPE], [{ ...TEMPLATE, name: "T".repeat(200) }], [food]);
  await page.goto("/more");
  await page.getByRole("button", { name: /^Meal templates/ }).click();
  await page.getByRole("combobox", { name: "Pick from library", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const bounds = await page.getByRole("listbox").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  await page.goBack();
  await expect(page).toHaveURL(/\/more$/);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: /^Meal templates/ }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Pick from library", exact: true }).click();
  await page.getByRole("option", { name: food.name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove template item 1", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  noErrors();
});

test("saving a meal template guards duplicate taps and locks the submitted draft", async ({ page }) => {
  const { entities, noErrors } = await setup(page, [], []);
  await page.goto("/nutrition?segment=library");
  await draftTemplate(page);
  const write = await holdWrites(page, "**/entities/MealTemplate");
  try {
    await doubleTap(page.getByRole("button", { name: "Save template", exact: true }));
    await write.requestStarted;
    await expect(templateName(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Remove template item 1", exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Pick from library", exact: true })).toBeDisabled();
    expect(write.writes).toHaveLength(1);
  } finally { write.release(); }
  await expect.poll(() => entities.MealTemplate.length).toBe(1);
  await expect(templateName(page)).toHaveValue("");
  await expect(templateName(page)).toBeEnabled();
  expect(entities.MealTemplate[0]).toMatchObject({ name: "New sweep meal", total_calories: 250 });
  expect(entities.FoodLogEntry).toEqual([]);
  noErrors();
});

test("failed template saves retain items and allow retry without an uncaught rejection", async ({ page }) => {
  const { entities, noErrors } = await setup(page, [], []);
  await page.goto("/nutrition?segment=library");
  await draftTemplate(page);
  let fail = true;
  await page.route("**/entities/MealTemplate", (route) => {
    if (route.request().method() !== "POST" || !fail) return route.fallback();
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Unavailable" }) });
  });
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Meal template could not be saved" })).toBeVisible();
  await expect(templateName(page)).toHaveValue("New sweep meal");
  await expect(page.getByRole("button", { name: "Remove template item 1", exact: true })).toBeEnabled();
  expect(entities.MealTemplate).toEqual([]);
  fail = false;
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect.poll(() => entities.MealTemplate.length).toBe(1);
  noErrors();
});

test("saved meal logging stays on the selected historical meal when the background date changes", async ({ page }) => {
  const { entities, noErrors } = await setup(page);
  const todayBefore = entities.DailyLog.find((row) => row.date === TODAY)?.calories;
  await page.goto(`/nutrition?date=${PAST}`);
  await page.getByRole("radio", { name: "Dinner", exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  const write = await holdWrites(page, "**/entities/FoodLogEntry");
  try {
    await doubleTap(page.getByRole("button", { name: `Log ${TEMPLATE.name}`, exact: true }));
    await write.requestStarted;
    await expect(page.getByRole("button", { name: `Log ${TEMPLATE.name}`, exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Next day", exact: true }).click();
    expect(write.writes).toHaveLength(1);
    expect(write.writes[0]).toMatchObject({ date: PAST, meal: "dinner", source: "template" });
  } finally { write.release(); }
  await expect.poll(() => entities.FoodLogEntry.length).toBe(1);
  expect(entities.FoodLogEntry[0]).toMatchObject({ date: PAST, meal: "dinner", calories: 200 });
  expect(entities.DailyLog.find((row) => row.date === TODAY)?.calories).toBe(todayBefore);
  noErrors();
});
