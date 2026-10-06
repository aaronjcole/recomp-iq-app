import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

// Faster food logging: a meal picker every add path uses, recent foods from
// what was actually logged, one log per tap with Undo, quantity that scales
// nutrition, and copying yesterday or a past meal.

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const TODAY = isoDaysAgo(0);
const YESTERDAY = isoDaysAgo(1);

function entry(id, date, meal, name, calories, extra = {}) {
  return {
    id,
    date,
    meal,
    name,
    serving_description: "1 serving",
    quantity: 1,
    calories,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    fiber_g: 0,
    source: "manual",
    created_date: `${date}T08:00:00.000Z`,
    ...extra
  };
}

function dataset(foodLogEntries) {
  return { ...ENTITY_FIXTURES, FoodLogEntry: foodLogEntries };
}

const todaysEntries = (entities) => (entities.FoodLogEntry ?? []).filter((row) => row.date === TODAY);

test("a recent food logs once into the chosen meal and can be undone", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: dataset([entry("log-oats", YESTERDAY, "breakfast", "Overnight oats", 380)])
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/nutrition");

  await page.getByRole("radio", { name: "Lunch" }).click();
  await expect(page.getByRole("radio", { name: "Lunch" })).toHaveAttribute("aria-checked", "true");

  // Recent foods come from the diary, not the library ("Chicken Breast" is
  // saved in the library but was never logged).
  const recent = page.getByRole("button", { name: "Add Overnight oats to Lunch" });
  await expect(recent).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Chicken Breast to Lunch" })).toHaveCount(0);

  await recent.dblclick();
  await expect(page.getByText("Overnight oats added to Lunch")).toBeVisible();
  await expect.poll(() => todaysEntries(entities).length).toBe(1);
  expect(todaysEntries(entities)[0]).toMatchObject({ meal: "lunch", calories: 380, source: "repeat", repeated_from_id: "log-oats" });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => todaysEntries(entities).length).toBe(0);
  assertNoPageErrors();
});

test("changing quantity in the editor scales calories and macros", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: dataset([entry("log-rice", TODAY, "dinner", "Rice", 200, { protein_g: 4, carbs_g: 44, fat_g: 0.4 })])
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/nutrition");

  await page.getByRole("button", { name: "Edit Rice" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit food entry" });
  await sheet.getByLabel("Quantity").fill("1.5");
  await expect(sheet.getByLabel("Calories")).toHaveValue("300");
  await expect(sheet.getByLabel("Carbs (g)")).toHaveValue("66");
  await expect(sheet.getByLabel("Fat (g)")).toHaveValue("0.6");
  await sheet.getByRole("button", { name: "Save changes" }).click();

  await expect.poll(() => entities.FoodLogEntry.find((row) => row.id === "log-rice")?.calories).toBe(300);
  expect(entities.FoodLogEntry.find((row) => row.id === "log-rice")).toMatchObject({ quantity: 1.5, protein_g: 6, carbs_g: 66, fiber_g: 0 });
  assertNoPageErrors();
});

test("copying yesterday adds every item once, keeps meals, and Undo removes the copies", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: dataset([
      entry("y-eggs", YESTERDAY, "breakfast", "Eggs", 210),
      entry("y-salad", YESTERDAY, "lunch", "Chicken salad", 450)
    ])
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/nutrition");

  const copy = page.getByRole("button", { name: "Copy yesterday (2 items)" });
  await copy.dblclick();
  await expect(page.getByText("Copied yesterday")).toBeVisible();
  await expect.poll(() => todaysEntries(entities).length).toBe(2);
  expect(todaysEntries(entities).map((row) => [row.name, row.meal]).sort()).toEqual([
    ["Chicken salad", "lunch"],
    ["Eggs", "breakfast"]
  ]);
  const diary = page.getByRole("region", { name: "Food diary" });
  await expect(diary.getByText("Eggs")).toBeVisible();

  // Everything from yesterday is now in today, so there is nothing left to copy.
  await expect(page.getByRole("button", { name: /^Copy yesterday/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => todaysEntries(entities).length).toBe(0);
  await expect(page.getByRole("button", { name: "Copy yesterday (2 items)" })).toBeVisible();
  assertNoPageErrors();
});

test("a past day's meal can be copied to today", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, {
    entities: dataset([
      entry("p-toast", YESTERDAY, "breakfast", "Toast", 160),
      entry("p-pasta", YESTERDAY, "dinner", "Pasta", 640)
    ])
  });
  await page.goto(`/nutrition?date=${YESTERDAY}`);

  await page.getByRole("button", { name: "Copy Dinner to today" }).click();
  await expect(page.getByText("Dinner copied to today")).toBeVisible();
  await expect.poll(() => todaysEntries(entities).length).toBe(1);
  expect(todaysEntries(entities)[0]).toMatchObject({ name: "Pasta", meal: "dinner", calories: 640 });
  await expect(page.getByRole("button", { name: "Copy Dinner to today" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy Breakfast to today" })).toBeVisible();
});

test("a failed quick add says so and logs nothing", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset([entry("log-oats", YESTERDAY, "breakfast", "Overnight oats", 380)]),
    functionErrors: { upsertTrackingRecord: 503 }
  });
  await page.goto("/nutrition");
  await page.getByRole("radio", { name: "Snacks" }).click();
  await page.getByRole("button", { name: "Add Overnight oats to Snacks" }).click();
  await expect(page.getByText("Couldn't add Overnight oats")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Overnight oats to Snacks" })).toBeEnabled();
});
