import { test, expect } from "@playwright/test";
import {
  installAuthenticatedBase44,
  watchPageErrors,
} from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import {
  todayStr,
  addDaysStr,
  formatLongDate,
} from "../../src/lib/loggingDateUtils.js";

const TODAY = todayStr();
const PAST = addDaysStr(TODAY, -1);
const food = {
  name: "Review oats",
  serving_description: "1 bowl",
  calories: 200,
  protein_g: 10,
  carbs_g: 30,
  fat_g: 4,
  source: "branded",
  source_id: "review-oats",
};
const reviewSheet = (page) =>
  page.getByRole("dialog", { name: "Review food", exact: true });
const saveButton = (page) =>
  reviewSheet(page).getByRole("button", { name: /^Add to / });
const duplicateClick = (locator) =>
  locator.evaluate((button) => {
    button.click();
    button.click();
  });

const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page)).toEqual([]));

test("Today quick meals review and save to the selected historical day and explicit meal", async ({
  page,
}) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      MealTemplate: [
        {
          id: "template-review",
          name: "Morning oats",
          items: [food],
          total_calories: 200,
          total_protein_g: 10,
        },
      ],
    },
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto(`/today?date=${PAST}`);
  const oldTotal = entities.DailyLog.find((row) => row.date === PAST).calories;
  const todayTotal = entities.DailyLog.find(
    (row) => row.date === TODAY,
  ).calories;
  const count = entities.FoodLogEntry.length;
  await page.getByRole("button", { name: /Morning oats/ }).click();
  await expect(reviewSheet(page).getByLabel("Logging date")).toHaveValue(PAST);
  expect(entities.FoodLogEntry).toHaveLength(count);
  await reviewSheet(page)
    .getByRole("button", { name: "Lunch", exact: true })
    .click();
  await reviewSheet(page).getByLabel("Quantity", { exact: true }).fill("1.5");
  await duplicateClick(saveButton(page));
  await expect(reviewSheet(page)).toHaveCount(0);
  expect(entities.FoodLogEntry.filter((row) => row.name === food.name)).toEqual(
    [
      expect.objectContaining({
        date: PAST,
        meal: "lunch",
        quantity: 1.5,
        calories: 300,
        source: "template",
      }),
    ],
  );
  expect(entities.DailyLog.find((row) => row.date === PAST).calories).toBe(
    oldTotal + 300,
  );
  expect(entities.DailyLog.find((row) => row.date === TODAY).calories).toBe(
    todayTotal,
  );
  assertNoPageErrors();
});

test("empty diary keeps all meal Add actions and a saved food can be portioned before logging", async ({
  page,
}) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodLogEntry: [] },
  });
  await page.goto(`/nutrition?date=${PAST}`);
  for (const name of ["Breakfast", "Lunch", "Dinner", "Snacks"])
    await expect(
      page.getByRole("button", { name: `Add food to ${name}`, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "Add food to Dinner", exact: true })
    .click();
  await expect(
    reviewSheet(page).getByRole("button", { name: "Dinner", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await reviewSheet(page)
    .getByText(/Choose a saved food/)
    .click();
  await reviewSheet(page)
    .getByRole("button", { name: "Greek Yogurt", exact: true })
    .click();
  await reviewSheet(page).getByLabel("Quantity", { exact: true }).fill("2");
  await expect(
    reviewSheet(page).getByLabel("Calories", { exact: true }),
  ).toHaveValue("300");
  await saveButton(page).click();
  await expect.poll(() => entities.FoodLogEntry.length).toBe(1);
  expect(entities.FoodLogEntry[0]).toMatchObject({
    meal: "dinner",
    date: PAST,
    calories: 300,
    protein_g: 40,
    source_food_id: "food-1",
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => entities.FoodLogEntry.length).toBe(0);
});

test("scanner manual controls sit above navigation and duplicate confirmation creates one reviewed log", async ({
  page,
}) => {
  const { entities } = await installAuthenticatedBase44(page);
  const count = entities.FoodLogEntry.length;
  await page.route("**/functions/barcodeLookup", (route) =>
    route.fulfill({ json: { found: true, food } }),
  );
  await page.goto(`/nutrition?date=${PAST}`);
  const barcodeLaunchButton = page.getByRole("button", { name: "Barcode", exact: true });
  await barcodeLaunchButton.click();
  const scanner = page.getByRole("dialog", { name: "Scan food barcode" });
  const lookup = scanner.getByRole("button", { name: "Lookup", exact: true });
  await expect(lookup).toBeVisible();
  expect(
    await lookup.evaluate((button) => {
      const box = button.getBoundingClientRect();
      return button.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  await scanner
    .getByRole("textbox", { name: "Barcode number" })
    .fill("0123456789012");
  await lookup.click();
  await expect(scanner.getByText(food.name, { exact: true })).toBeVisible();
  await duplicateClick(scanner.getByRole("button", { name: /^Review for / }));
  await expect(reviewSheet(page)).toBeVisible();
  expect(entities.FoodLogEntry).toHaveLength(count);
  await reviewSheet(page)
    .getByRole("button", { name: "Breakfast", exact: true })
    .click();
  await duplicateClick(saveButton(page));
  await expect(reviewSheet(page)).toHaveCount(0);
  const addedToast = page.locator("[data-toast-id]").filter({ hasText: "Added to Breakfast" });
  await expect(addedToast).toBeVisible();
  await addedToast.getByRole("button", { name: "Dismiss notification", exact: true }).click();
  await expect(barcodeLaunchButton).toBeFocused();
  expect(entities.FoodLogEntry.filter((row) => row.name === food.name)).toEqual(
    [
      expect.objectContaining({
        date: PAST,
        meal: "breakfast",
        source: "barcode",
      }),
    ],
  );
  expect(
    entities.FoodItem.filter((row) => row.name === food.name),
  ).toHaveLength(0);
});

test("saving a scanned food to the library restores focus to its launch control", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page);
  await page.route("**/functions/barcodeLookup", (route) =>
    route.fulfill({ json: { found: true, food } }),
  );
  await page.goto(`/nutrition?date=${PAST}`);
  const barcodeLaunchButton = page.getByRole("button", { name: "Barcode", exact: true });
  await barcodeLaunchButton.click();
  const scanner = page.getByRole("dialog", { name: "Scan food barcode" });
  await scanner.getByRole("textbox", { name: "Barcode number" }).fill("0123456789012");
  await scanner.getByRole("button", { name: "Lookup", exact: true }).click();
  await expect(scanner.getByText(food.name, { exact: true })).toBeVisible();
  await scanner.getByRole("button", { name: "Save to library", exact: true }).click();

  const savedToast = page.locator("[data-toast-id]").filter({ hasText: "Food saved to library" });
  await expect(savedToast).toBeVisible();
  await expect.poll(() => entities.FoodItem.some((row) => row.name === food.name)).toBe(true);
  await savedToast.getByRole("button", { name: "Dismiss notification", exact: true }).click();
  await expect(barcodeLaunchButton).toBeFocused();
});

test("a failed save retains the draft, rollback prevents duplicates, and retry uses the reviewed date", async ({
  page,
}) => {
  const functionErrors = { upsertTrackingRecord: 503 };
  const { entities } = await installAuthenticatedBase44(page, {
    functionErrors,
  });
  const count = entities.FoodLogEntry.length;
  await page.goto(`/nutrition?date=${PAST}`);
  await page
    .getByRole("button", { name: "Add food to Lunch", exact: true })
    .click();
  await reviewSheet(page)
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  for (const [name, value] of [
    ["Food name", "Manual oats"],
    ["Calories", "200"],
    ["Protein (g)", "10"],
    ["Carbs (g)", "30"],
    ["Fat (g)", "4"],
  ])
    await reviewSheet(page).getByLabel(name, { exact: true }).fill(value);
  await saveButton(page).click();
  await expect(reviewSheet(page).getByRole("alert")).toContainText(
    "Your food draft is still here",
  );
  expect(entities.FoodLogEntry).toHaveLength(count);
  await expect(
    reviewSheet(page).getByLabel("Food name", { exact: true }),
  ).toHaveValue("Manual oats");
  delete functionErrors.upsertTrackingRecord;
  await saveButton(page).click();
  await expect(reviewSheet(page)).toHaveCount(0);
  expect(
    entities.FoodLogEntry.filter((row) => row.name === "Manual oats"),
  ).toEqual([expect.objectContaining({ date: PAST, meal: "lunch" })]);
});

test("search review is non-mutating until confirmed, keeps unknowns blank, and cancel permits retry", async ({
  page,
}) => {
  const { entities } = await installAuthenticatedBase44(page);
  const count = entities.FoodLogEntry.length;
  const libraryCount = entities.FoodItem.length;
  await page.route("**/functions/searchFoods", (route) =>
    route.fulfill({ json: { foods: [{ ...food, protein_g: null }] } }),
  );
  await page.goto(`/nutrition?date=${PAST}`);
  await page.getByRole("textbox", { name: "Search foods online" }).fill("oats");
  const open = page.getByRole("button", { name: /^Review for / });
  await open.click();
  await expect(
    reviewSheet(page).getByLabel("Protein (g)", { exact: true }),
  ).toHaveValue("");
  await expect(saveButton(page)).toBeDisabled();
  await reviewSheet(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(entities.FoodLogEntry).toHaveLength(count);
  expect(entities.FoodItem).toHaveLength(libraryCount);
  await open.click();
  await reviewSheet(page).getByLabel("Protein (g)", { exact: true }).fill("0");
  await expect(saveButton(page)).toBeEnabled();
});

test("week selector changes the logging date, disallows future days, and keeps targets deep links", async ({
  page,
}) => {
  await installAuthenticatedBase44(page);
  await page.goto(`/nutrition?panel=targets&date=${TODAY}`);
  await expect(
    page.getByRole("tab", { name: "Tools", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const week = page.getByRole("group", { name: "Logging week", exact: true });
  await expect(week.getByRole("button")).toHaveCount(7);
  const today = week.getByRole("button", {
    name: new RegExp(`^${formatLongDate(TODAY)}`),
  });
  await today.click();
  await expect(page).toHaveURL(/panel=targets/);
  await expect(today).toHaveAttribute("aria-pressed", "true");
  for (const button of await week
    .getByRole("button", { name: /Future date/ })
    .all())
    await expect(button).toBeDisabled();
});

test("phone layouts keep review controls accessible without horizontal overflow", async ({
  page,
}, testInfo) => {
  await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodLogEntry: [] },
  });
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("today.png"),
    fullPage: true,
  });
  await page.goto("/nutrition");
  await page
    .getByRole("button", { name: "Add food to Dinner", exact: true })
    .click();
  await reviewSheet(page)
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  for (const [name, value] of [
    ["Food name", "Oats and yogurt"],
    ["Calories", "300"],
    ["Protein (g)", "20"],
    ["Carbs (g)", "40"],
    ["Fat (g)", "6"],
  ])
    await reviewSheet(page).getByLabel(name, { exact: true }).fill(value);
  await reviewSheet(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: testInfo.outputPath("food-review.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await saveButton(page).boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(
      await saveButton(page).evaluate((button) => {
        const b = button.getBoundingClientRect();
        return button.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    ).toBe(true);
  }
});

test("voice Stop and natural end emit once; permission failure and unmount do not submit", async ({
  page,
}) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/tests/e2e/fixtures/voice-input.html");
  const speak = () =>
    page.evaluate(() => {
      const result = [{ transcript: "Two eggs and toast" }];
      result.isFinal = true;
      window.recognition.onresult({ resultIndex: 0, results: [result] });
    });
  await page.getByRole("button", { name: "Start voice input" }).click();
  await speak();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect
    .poll(() => page.evaluate(() => window.transcripts))
    .toEqual(["Two eggs and toast"]);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await speak();
  await page.evaluate(() => window.recognition.onend());
  await expect
    .poll(() => page.evaluate(() => window.transcripts.length))
    .toBe(2);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await speak();
  await page.evaluate(() =>
    window.recognition.onerror({ error: "not-allowed" }),
  );
  await expect(page.getByRole("alert")).toContainText("permission denied");
  expect(await page.evaluate(() => window.transcripts.length)).toBe(2);
  await page.getByRole("button", { name: "Start voice input" }).click();
  await speak();
  await page.evaluate(() => window.unmountVoice());
  expect(await page.evaluate(() => window.transcripts.length)).toBe(2);
  assertNoPageErrors();
});
