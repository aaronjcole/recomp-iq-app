import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44 } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import { addDaysStr, todayStr } from "../../src/lib/loggingDateUtils.js";

const PAST = addDaysStr(todayStr(), -1);
const saved = { id: "describe-shake", name: "My shake", serving_description: "250 ml", calories: 180, protein_g: 25, carbs_g: 10, fat_g: 4, source: "manual" };
const sheet = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const food = (page, index) => sheet(page).getByRole("region", { name: `Food ${index}`, exact: true });
const confirm = (page) => sheet(page).getByRole("button", { name: /^Add to / });
const describe = (page) => sheet(page).getByRole("textbox", { name: "Meal description", exact: true });

async function openDescribe(page) {
  await page.goto(`/nutrition?date=${PAST}`);
  await page.getByRole("button", { name: "Add food to Lunch", exact: true }).click();
  await sheet(page).locator("summary").filter({ hasText: /^Describe a meal$/ }).click();
  await expect(describe(page)).toBeVisible();
}

async function setup(page, voice = false) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((enableVoice) => {
    window.webkitSpeechRecognition = undefined;
    window.SpeechRecognition = enableVoice ? class {
      start() { window.__describeRecognition = this; }
      stop() { queueMicrotask(() => this.onend?.()); }
      abort() { queueMicrotask(() => this.onend?.()); }
    } : undefined;
  }, voice);
  const result = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodItem: [saved], FoodLogEntry: [] },
  });
  return { ...result, errors };
}

test("describe: Fuel per-meal Add uses local typed drafts, audited portions, explicit confirmation and historical date", async ({ page }) => {
  const { entities, errors } = await setup(page);
  const paidOrLookup = [];
  page.on("request", (request) => {
    if (/InvokeLLM|UploadFile|searchFoods|api\.nal\.usda\.gov|analyzeFoodPhoto/.test(request.url())) paidOrLookup.push(request.url());
  });
  const library = structuredClone(entities.FoodItem);
  const before = entities.DailyLog.find((row) => row.date === PAST).calories;
  await openDescribe(page);
  await expect(sheet(page).getByRole("button", { name: "Describe by voice", exact: true })).toHaveCount(0);
  await expect(sheet(page).getByText(/Local parsing, no paid AI call/)).toBeVisible();
  await describe(page).fill("half cup cooked white rice; 2 servings My shake");
  expect(entities.FoodLogEntry).toHaveLength(0);
  await sheet(page).getByRole("button", { name: "Review described foods", exact: true }).click();
  expect(entities.FoodLogEntry).toHaveLength(0);
  expect(entities.DailyLog.find((row) => row.date === PAST).calories).toBe(before);
  await expect(food(page, 1).getByLabel("Quantity", { exact: true })).toHaveValue("0.5");
  await expect(food(page, 1).getByLabel("Serving", { exact: true })).toHaveValue("1 cup (158 g)");
  await expect(food(page, 1).getByLabel("Calories", { exact: true })).toHaveValue("103");
  await food(page, 1).getByLabel("Quantity", { exact: true }).fill("1");
  await expect(food(page, 1).getByLabel("Calories", { exact: true })).toHaveValue("205");
  await expect(food(page, 2).getByLabel("Calories", { exact: true })).toHaveValue("360");
  await expect(sheet(page).getByLabel("Logging date")).toHaveValue(PAST);
  expect(paidOrLookup).toEqual([]);
  await confirm(page).click();
  await expect.poll(() => entities.FoodLogEntry.length).toBe(2);
  expect(entities.FoodLogEntry).toEqual(expect.arrayContaining([
    expect.objectContaining({ date: PAST, meal: "lunch", source: "describe", quantity: 1, calories: 205 }),
    expect.objectContaining({ date: PAST, meal: "lunch", source: "describe", source_food_id: saved.id, quantity: 2, calories: 360 }),
  ]));
  expect(entities.FoodItem).toEqual(library);
  expect(errors).toEqual([]);
});

test("describe: unknown food stays blank; Find nutrition replaces one serving and asks to review the original portion", async ({ page }) => {
  const { entities, errors } = await setup(page);
  await openDescribe(page);
  await describe(page).fill("2 bowls Mystery curry");
  await sheet(page).getByRole("button", { name: "Review described foods", exact: true }).click();
  await expect(food(page, 1).getByLabel("Calories", { exact: true })).toHaveValue("");
  await expect(food(page, 1).getByLabel("Protein (g)", { exact: true })).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
  expect(entities.FoodLogEntry).toHaveLength(0);
  await food(page, 1).getByRole("button", { name: "Find nutrition", exact: true }).click();
  await food(page, 1).locator("summary").filter({ hasText: /^Use a saved food instead$/ }).click();
  await food(page, 1).getByRole("button", { name: saved.name, exact: true }).click();
  await expect(food(page, 1).getByLabel("Quantity", { exact: true })).toHaveValue("1");
  await expect(food(page, 1).getByLabel("Calories", { exact: true })).toHaveValue("180");
  await expect(food(page, 1).getByText(/Review quantity against your original description: 2 bowls Mystery curry/)).toBeVisible();
  expect(entities.FoodLogEntry).toHaveLength(0);
  await confirm(page).click();
  await expect.poll(() => entities.FoodLogEntry.length).toBe(1);
  expect(entities.FoodLogEntry[0]).toMatchObject({ source: "describe", source_food_id: saved.id, quantity: 1, calories: 180 });
  expect(errors).toEqual([]);
});

test("describe: invalid input and batch limits explain corrections, missing sizes cannot be saved, cancel writes nothing", async ({ page }) => {
  const { entities, errors } = await setup(page);
  await openDescribe(page);
  const review = sheet(page).getByRole("button", { name: "Review described foods", exact: true });
  await describe(page).fill("100 g");
  await review.click();
  await expect(sheet(page).getByRole("alert")).toContainText("Name the food");
  await expect(describe(page)).toHaveAttribute("aria-invalid", "true");
  await describe(page).fill(Array(13).fill("1 medium banana").join("; "));
  await review.click();
  await expect(sheet(page).getByRole("alert")).toContainText("at most 12");
  await describe(page).fill("2 bananas");
  await review.click();
  await expect(food(page, 1).getByLabel("Quantity", { exact: true })).toHaveValue("");
  await expect(food(page, 1).getByLabel("Calories", { exact: true })).toHaveValue("");
  await expect(food(page, 1).getByText(/How much did you have/)).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await sheet(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(entities.FoodLogEntry).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("describe: optional dictation appends to the latest editable text and never automatically drafts or logs", async ({ page }) => {
  const { entities, errors } = await setup(page, true);
  await openDescribe(page);
  await describe(page).fill("1 medium banana");
  await sheet(page).getByRole("button", { name: "Describe by voice", exact: true }).click();
  await expect(sheet(page).getByText(/may process audio online/)).toBeVisible();
  await sheet(page).getByRole("button", { name: "Record meal", exact: true }).click();
  await describe(page).fill("1 small apple");
  await page.evaluate(() => {
    const result = [{ transcript: "half cup dry oats" }];
    result.isFinal = true;
    window.__describeRecognition.onresult({ resultIndex: 0, results: [result] });
  });
  await sheet(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(describe(page)).toHaveValue("1 small apple; half cup dry oats");
  expect(entities.FoodLogEntry).toHaveLength(0);
  await expect(food(page, 1)).toHaveCount(0);
  await describe(page).fill("1 small apple; 1/4 cup dry oats");
  await sheet(page).getByRole("button", { name: "Review described foods", exact: true }).click();
  await expect(food(page, 2).getByLabel("Quantity", { exact: true })).toHaveValue("0.25");
  await expect(food(page, 2).getByLabel("Calories", { exact: true })).toHaveValue("77");
  expect(entities.FoodLogEntry).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("describe: typed input and review targets fit a narrow phone without horizontal overflow", async ({ page }) => {
  const { errors } = await setup(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await openDescribe(page);
  const review = sheet(page).getByRole("button", { name: "Review described foods", exact: true });
  await describe(page).fill("1 medium banana");
  await review.scrollIntoViewIfNeeded();
  const bounds = await review.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(describe(page)).toHaveAttribute("maxlength", "2000");
  await expect(describe(page)).toHaveAccessibleName("Meal description");
  await review.click();
  await expect(food(page, 1).getByText(/USDA FoodData Central, SR Legacy/)).toBeVisible();
  expect(await sheet(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
