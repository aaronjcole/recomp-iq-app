import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// A food log must add to the total the backend holds, not overwrite it with
// a total computed from this device's copy of the day. Another device (or a
// web session) logging lunch after this page loaded is the common case.
test("a food log adds to the backend's daily total instead of this device's stale copy", async ({ page }) => {
  const backend = await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/nutrition");

  const diary = page.getByRole("region", { name: "Food diary" });
  await expect(diary.getByText("Greek Yogurt", { exact: true })).toBeVisible();
  await expect(page.getByText("1980 / 2200", { exact: true })).toBeVisible();

  // Another device logs 600 kcal of lunch after this page loaded.
  const today = todayIso();
  const stored = backend.entities.DailyLog.find(
    (row) => row.date === today && row.created_by_id === backend.user.id
  );
  expect(stored, "fixture should hold today's DailyLog").toBeTruthy();
  stored.calories += 600;

  // This device repeats a 150 kcal entry. The old client sent 1980 + 150 =
  // 2130 as an absolute total and silently dropped the other device's lunch.
  await diary.getByRole("button", { name: "Repeat Greek Yogurt" }).click();
  await expect(page.getByText(/2730 \/ 2200/)).toBeVisible();
  const saved = backend.entities.DailyLog.find(
    (row) => row.date === today && row.created_by_id === backend.user.id
  );
  expect(saved.calories).toBe(2730);
  assertNoPageErrors();
});

// Check-ins arrive with the background history load. Until it succeeds, an
// empty check-in list means "not loaded", not "never checked in", and a
// check-in run now would analyze the current week alone.
test("the weekly check-in waits for history instead of running on a partial week", async ({ page }) => {
  await installAuthenticatedBase44(page, { failingEntities: ["WeeklyCheckIn"] });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more");

  const row = page.getByRole("button", { name: /Weekly check-in/ });
  await expect(row).toContainText("Loading your history…");
  await expect(row).not.toContainText("Due");
  await row.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assertNoPageErrors();
});
