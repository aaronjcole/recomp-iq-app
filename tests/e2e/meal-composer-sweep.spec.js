import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import { addDaysStr, todayStr } from "../../src/lib/loggingDateUtils.js";

const PAST = addDaysStr(todayStr(), -2);
const FOOD = { name: "Composer sweep oats", source_id: "composer-sweep-oats", serving_description: "1 bowl", calories: 200, protein_g: 10, carbs_g: 30, fat_g: 4 };
const sheet = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const save = (page) => sheet(page).getByRole("button", { name: /^Add to / });
const search = (page) => sheet(page).getByRole("textbox", { name: "Search foods online", exact: true });
const duplicateClick = (locator) => locator.evaluate((button) => { button.click(); button.click(); });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  errors.set(page, watchPageErrors(page));
  await page.setViewportSize({ width: 320, height: 480 });
});
test.afterEach(async ({ page }) => errors.get(page)());

async function setup(page, extra = {}) {
  return installAuthenticatedBase44(page, { entities: { ...ENTITY_FIXTURES, FoodLogEntry: [], ...extra } });
}
async function open(page) {
  await page.goto(`/nutrition?date=${PAST}`);
  const launcher = page.getByRole("button", { name: "Add food to Lunch", exact: true });
  await launcher.click();
  await expect(sheet(page)).toBeVisible();
  return launcher;
}
async function hitTest(locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
      && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });
}

test("composer: long search names fit, duplicate selection/save adds one editable food to its chosen date and meal", async ({ page }) => {
  const { entities } = await setup(page);
  const name = `Sweep oats ${"verylongingredient".repeat(9)}`;
  await page.route("**/functions/searchFoods", (route) => route.fulfill({ json: { foods: [{ ...FOOD, name }] } }));
  const launcher = await open(page);
  await search(page).fill("sweep oats");
  const review = sheet(page).getByRole("button", { name: `Review ${name}`, exact: true });
  await expect(review).toBeVisible();
  await review.scrollIntoViewIfNeeded();
  expect(await sheet(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await hitTest(review)).toBe(true);
  await duplicateClick(review);
  await expect(sheet(page).getByRole("region", { name: /^Food \d+$/ })).toHaveCount(1);
  await sheet(page).getByLabel("Quantity", { exact: true }).fill("1.5");
  await expect(sheet(page).getByLabel("Calories", { exact: true })).toHaveValue("300");
  await sheet(page).getByLabel("Logging date").fill(addDaysStr(todayStr(), 1));
  await expect(save(page)).toBeDisabled();
  await expect(sheet(page).getByRole("alert")).toContainText("on or before today");
  await sheet(page).getByLabel("Logging date").fill(PAST);
  await sheet(page).getByRole("button", { name: "Dinner", exact: true }).click();
  const fiber = sheet(page).getByLabel("Fiber (g) · optional", { exact: true });
  await fiber.focus();
  await fiber.scrollIntoViewIfNeeded();
  await expect.poll(() => hitTest(fiber)).toBe(true);
  await expect.poll(() => hitTest(save(page))).toBe(true);
  const gate = deferred();
  let creates = 0;
  await page.route("**/entities/FoodLogEntry", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    creates += 1;
    await gate.promise;
    return route.fallback();
  });
  await duplicateClick(save(page));
  try {
    await expect.poll(() => creates).toBe(1);
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  } finally { gate.resolve(); }
  await expect(sheet(page)).toHaveCount(0);
  expect(entities.FoodLogEntry).toEqual([expect.objectContaining({ name, quantity: 1.5, calories: 300, date: PAST, meal: "dinner" })]);
  await expect(launcher).toBeFocused();
});

test("composer: short viewport keeps footer and Close usable, and cancel returns focus without writes", async ({ page }) => {
  const { entities } = await setup(page);
  const launcher = await open(page);
  await sheet(page).getByRole("button", { name: "Enter manually", exact: true }).click();
  await sheet(page).getByLabel("Food name", { exact: true }).fill("Unsaved draft");
  await page.setViewportSize({ width: 320, height: 360 });
  const fiber = sheet(page).getByLabel("Fiber (g) · optional", { exact: true });
  await fiber.scrollIntoViewIfNeeded();
  await expect.poll(() => hitTest(fiber)).toBe(true);
  await expect.poll(() => hitTest(sheet(page).getByRole("button", { name: "Close", exact: true }))).toBe(true);
  await expect.poll(() => hitTest(sheet(page).getByRole("button", { name: "Cancel", exact: true }))).toBe(true);
  await sheet(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(entities.FoodLogEntry).toHaveLength(0);
});

test("composer search: retry keeps query, clear returns input focus and ignores a late response", async ({ page }) => {
  await setup(page);
  let attempts = 0;
  const gate = deferred();
  let delayed = false;
  const finished = deferred();
  await page.route("**/functions/searchFoods", async (route) => {
    const query = route.request().postDataJSON().query;
    if (query === "rice") {
      delayed = true;
      await gate.promise;
      await route.fulfill({ json: { foods: [{ ...FOOD, name: "Late rice result" }] } });
      finished.resolve();
      return;
    }
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { error: "Search unavailable" } })
      : route.fulfill({ json: { foods: [FOOD] } });
  });
  await open(page);
  await search(page).fill("oats");
  await expect(sheet(page).getByRole("alert")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Search again", exact: true }).click();
  await expect(sheet(page).getByRole("button", { name: `Review ${FOOD.name}`, exact: true })).toBeVisible();
  await expect(search(page)).toHaveValue("oats");
  await search(page).fill("rice");
  await expect.poll(() => delayed).toBe(true);
  await sheet(page).getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search(page)).toBeFocused();
  gate.resolve();
  await finished.promise;
  await expect(sheet(page).getByRole("button", { name: "Review Late rice result", exact: true })).toHaveCount(0);
  await expect(search(page)).toHaveValue("");
});

test("composer speech: cannot review active capture, collapsing cancels it but keeps typed text, duplicate review emits one batch", async ({ page }) => {
  await page.addInitScript(() => {
    window.webkitSpeechRecognition = undefined;
    window.SpeechRecognition = class {
      start() { window.__mealComposerRecognition = this; }
      stop() { queueMicrotask(() => this.onend?.()); }
      abort() { window.__mealComposerAborts = (window.__mealComposerAborts || 0) + 1; queueMicrotask(() => this.onend?.()); }
    };
  });
  const { entities } = await setup(page);
  await open(page);
  const disclosure = sheet(page).locator("summary").filter({ hasText: /^Describe a meal$/ });
  await disclosure.click();
  const description = sheet(page).getByRole("textbox", { name: "Meal description", exact: true });
  await description.fill("1 medium banana");
  await sheet(page).getByRole("button", { name: "Describe by voice", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Record meal", exact: true }).click();
  const review = sheet(page).getByRole("button", { name: "Review described foods", exact: true });
  await expect(review).toBeDisabled();
  await disclosure.click();
  await expect.poll(() => page.evaluate(() => window.__mealComposerAborts)).toBe(1);
  await disclosure.click();
  await expect(description).toHaveValue("1 medium banana");
  await expect(review).toBeEnabled();
  await duplicateClick(review);
  await expect(sheet(page).getByRole("region", { name: /^Food \d+$/ })).toHaveCount(1);
  expect(entities.FoodLogEntry).toHaveLength(0);
});

test("composer: leaving a cached Today owner closes the review and invalidates its pending search", async ({ page }) => {
  await setup(page, { MealTemplate: [{ id: "sweep-template", name: "Sweep quick meal", items: [FOOD], total_calories: 200, total_protein_g: 10 }] });
  const gate = deferred();
  const finished = deferred();
  let requested = false;
  await page.route("**/functions/searchFoods", async (route) => {
    requested = true;
    await gate.promise;
    await route.fulfill({ json: { foods: [{ ...FOOD, name: "Stale search" }] } });
    finished.resolve();
  });
  await page.goto(`/today?date=${PAST}`);
  await page.getByRole("button", { name: /Sweep quick meal/ }).click();
  await sheet(page).getByRole("button", { name: "Add another food", exact: true }).click();
  await expect(save(page)).toBeDisabled();
  await search(page).fill("pending search");
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => { history.pushState(null, "", "/progress"); dispatchEvent(new PopStateEvent("popstate")); });
  await expect(sheet(page)).toHaveCount(0);
  gate.resolve();
  await finished.promise;
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("button", { name: /Sweep quick meal/ })).toBeVisible();
  await expect(sheet(page)).toHaveCount(0);
});
