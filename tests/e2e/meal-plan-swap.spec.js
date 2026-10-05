import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import {
  buildAdaptiveMealPlan,
  buildMealSwap,
  groceryListFor,
  normalizeSwapRequest,
  proteinBoostScoopsOf
} from "../../base44/shared/adaptiveMealPlanDomain.js";

const PLAN = buildAdaptiveMealPlan({
  weekStart: "2026-08-03",
  strategy: { calorie_target: 2200, protein_target_g: 170, carb_target_g: 210, fat_target_g: 70 },
  preferences: { diet_style: "Omnivore" },
  checkIn: null
});

const label = (item) => `${item.quantity} ${item.unit} ${item.name}`;

// The week the page should hold after swapping one of day 1's meals, computed
// with the same shared swap and grocery functions the app and backend use.
function weekAfterSwap(slot) {
  const meal = PLAN.days[0].meals.find((item) => item.slot === slot);
  const replacement = buildMealSwap(normalizeSwapRequest({
    mealId: meal.id,
    slot,
    dietStyle: PLAN.dietStyle,
    targetCalories: meal.calories,
    proteinBoostScoops: proteinBoostScoopsOf(meal),
    avoidIds: PLAN.days[0].meals.map((item) => item.id).filter((id) => id !== meal.id)
  }));
  const days = PLAN.days.map((day, index) => index !== 0 ? day : {
    ...day,
    meals: day.meals.map((item) => (item.slot === slot ? replacement : item))
  });
  return { meal, replacement, groceryList: groceryListFor(days) };
}

test("swapping a meal rebuilds the grocery list from the updated week", async ({ page }) => {
  // Pick a slot whose swap removes a grocery line, so the stale-list bug shows.
  const slot = ["dinner", "lunch", "breakfast", "snack"].find((candidate) => {
    const { groceryList } = weekAfterSwap(candidate);
    const after = new Set(groceryList.map((item) => item.name));
    return PLAN.groceryList.some((item) => !after.has(item.name));
  });
  expect(slot, "a swap in the fixture week should drop an ingredient").toBeTruthy();
  const { meal, replacement, groceryList } = weekAfterSwap(slot);
  const removed = PLAN.groceryList.filter((item) => !groceryList.some((next) => next.name === item.name));

  await installAuthenticatedBase44(page, { mealPlan: PLAN });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/nutrition/meal-plan");
  await page.getByRole("button", { name: "Build this week" }).click();

  const groceryLabels = page.locator('label[for^="meal-plan-"]');
  await expect(groceryLabels).toHaveText(PLAN.groceryList.map(label));
  await expect(page.getByRole("heading", { level: 3, name: meal.title }).first()).toBeVisible();

  const swapResponse = page.waitForResponse((response) => response.url().includes("/functions/swapAdaptiveMeal"));
  await page.getByRole("button", { name: `Swap ${slot}` }).first().click();
  expect((await swapResponse).status()).toBe(200);

  await expect(page.getByRole("heading", { level: 3, name: replacement.title }).first()).toBeVisible();
  // Exactly the new week's list: swapped-out ingredients are gone, new ones added.
  await expect(groceryLabels).toHaveText(groceryList.map(label));
  expect(removed.length).toBeGreaterThan(0);
  assertNoPageErrors();
});
