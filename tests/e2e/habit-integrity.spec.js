import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

test("legacy starter-habit races are reconciled before Today renders", async ({ page }) => {
  const duplicateDefaults = ENTITY_FIXTURES.Habit.flatMap((habit, groupIndex) =>
    Array.from({ length: 4 }, (_, duplicateIndex) => ({
      ...habit,
      id: `${habit.id}-${duplicateIndex}`,
      created_date: `2026-08-0${duplicateIndex + 1}T0${groupIndex}:00:00.000Z`
    }))
  );
  await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, Habit: duplicateDefaults },
    ensuredHabits: ENTITY_FIXTURES.Habit
  });
  const assertNoPageErrors = watchPageErrors(page);
  const repaired = page.waitForResponse((response) =>
    response.url().includes("/functions/ensureDefaultHabits")
  );

  await page.goto("/today");
  await repaired;
  await page.getByRole("button", { name: "Show today's checklist" }).click();

  await expect(page.getByRole("button", { name: "Increase Water" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Mark Read / })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Mark Meditate / })).toHaveCount(1);
  assertNoPageErrors();
});

test("a starter repair outage does not block the already-loaded app", async ({ page }) => {
  await installAuthenticatedBase44(page, { ensureHabitsError: true });
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await page.getByRole("button", { name: "Show today's checklist" }).click();
  await expect(page.getByRole("button", { name: "Increase Water" })).toHaveCount(1);
  assertNoPageErrors();
});
