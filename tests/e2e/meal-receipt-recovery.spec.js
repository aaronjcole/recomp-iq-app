import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import { todayStr } from "../../src/lib/loggingDateUtils.js";

const date = todayStr();
const food = { id: "receipt-oats", name: "Receipt oats", serving_description: "1 bowl", calories: 200, protein_g: 10, carbs_g: 30, fat_g: 4 };
const review = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
async function openReview(page) {
  await page.goto(`/nutrition?date=${date}`);
  await page.getByRole("button", { name: "Add food to Lunch", exact: true }).click();
  await review(page).getByText(/Choose a saved food/).click();
  await review(page).getByRole("button", { name: food.name, exact: true }).click();
}

test("a committed meal with a lost response is confirmed by a receipt without replay or duplicate rows", async ({ page }) => {
  let writes = 0;
  let reads = 0;
  const { entities } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodItem: [food], FoodLogEntry: [] },
    trackingResponseAfterCommit(body) {
      if (body.kind === "nutrition_operation_status") { reads += 1; return; }
      if (body.increments) {
        writes += 1;
        if (writes === 1) return { status: 503, body: { error: "Response lost after commit" } };
      }
    }
  });
  const assertNoErrors = watchPageErrors(page);
  const before = entities.DailyLog.find((row) => row.date === date).calories;
  await openReview(page);
  await review(page).getByRole("button", { name: /^Add to / }).click();
  await expect(review(page)).toHaveCount(0);
  expect(entities.FoodLogEntry).toHaveLength(1);
  expect(entities.DailyLog.find((row) => row.date === date).calories).toBe(before + 200);
  expect(writes).toBe(1);
  expect(reads).toBe(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => entities.FoodLogEntry.length).toBe(0);
  await expect.poll(() => entities.DailyLog.find((row) => row.date === date).calories).toBe(before);
  assertNoErrors();
});

test("an unavailable receipt leaves an uncertain commit visible and blocks blind retry", async ({ page }) => {
  let writes = 0;
  const { entities } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodItem: [food], FoodLogEntry: [] },
    trackingResponseAfterCommit(body) {
      if (body.kind === "nutrition_operation_status") return { status: 503, body: { error: "Receipt unavailable" } };
      if (body.increments) { writes += 1; return { status: 503, body: { error: "Response lost after commit" } }; }
    }
  });
  const assertNoErrors = watchPageErrors(page);
  const before = entities.DailyLog.find((row) => row.date === date).calories;
  await openReview(page);
  const save = review(page).getByRole("button", { name: /^Add to / });
  await save.click();
  await expect(review(page).getByRole("alert")).toContainText(/confirm|incomplete|review/i);
  await expect(save).toBeDisabled();
  await save.evaluate((button) => button.click());
  expect(writes).toBe(1);
  expect(entities.FoodLogEntry).toHaveLength(1);
  expect(entities.DailyLog.find((row) => row.date === date).calories).toBe(before + 200);
  await review(page).getByRole("link", { name: "Review diary", exact: true }).click();
  const diary = page.getByRole("region", { name: "Food diary", exact: true });
  await expect(diary).toContainText("Save confirmation unavailable");
  await expect(diary.getByRole("button", { name: /Discard incomplete item/ })).toHaveCount(0);
  assertNoErrors();
});
