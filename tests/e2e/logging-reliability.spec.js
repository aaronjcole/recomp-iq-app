import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function trackingRequests(page) {
  const bodies = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/functions/upsertTrackingRecord")) {
      const body = request.postDataJSON();
      if (body?.kind === "daily_log") bodies.push(body);
    }
  });
  return bodies;
}

async function openQuickLog(page) {
  await page.goto("/today");
  await page.getByRole("button", { name: "Log today's basics" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Steps")).toBeVisible();
  return sheet;
}

test("a rejected quick log shows an error and keeps the sheet open with the user's input", async ({ page }) => {
  await installAuthenticatedBase44(page, { functionErrors: { upsertTrackingRecord: 400 } });
  const assertNoPageErrors = watchPageErrors(page);
  const sheet = await openQuickLog(page);

  await sheet.getByRole("tab", { name: "Full" }).click();
  await sheet.getByLabel("Steps").fill("150000");
  await sheet.getByLabel("Waist (in)").fill("31");
  const failed = page.waitForResponse((response) =>
    response.url().includes("/functions/upsertTrackingRecord") && response.status() === 400
  );
  await sheet.getByRole("button", { name: "Save today's log" }).click();
  await failed;

  await expect(page.getByText("Could not save log")).toBeVisible();
  await expect(sheet).toBeVisible();
  // The rollback must not reset the form or flip it back to Simple view.
  await expect(sheet.getByRole("tab", { name: "Full" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByLabel("Steps")).toHaveValue("150000");
  await expect(sheet.getByLabel("Waist (in)")).toHaveValue("31");
  await expect(sheet.getByRole("button", { name: "Save today's log" })).toBeEnabled();
  assertNoPageErrors();
});

test("out-of-range quick log values are flagged inline and never sent", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  const requests = trackingRequests(page);
  const sheet = await openQuickLog(page);

  await sheet.getByLabel("Steps").fill("250000");
  await sheet.getByLabel("Weight (lb)").fill("35");
  await sheet.getByRole("button", { name: "Save today's log" }).click();

  await expect(sheet.getByText("Enter a value from 0 to 200,000")).toBeVisible();
  await expect(sheet.getByText("Enter a value from 40 to 1,200")).toBeVisible();
  await expect(sheet.getByLabel("Steps")).toHaveAttribute("aria-invalid", "true");
  await expect(sheet).toBeVisible();
  expect(requests).toEqual([]);

  // Editing the field clears its error.
  await sheet.getByLabel("Steps").fill("12000");
  await expect(sheet.getByText("Enter a value from 0 to 200,000")).toHaveCount(0);
  assertNoPageErrors();
});

test("clearing a logged weight sends null and removes it from the stored log", async ({ page }) => {
  const backend = await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  const requests = trackingRequests(page);
  const today = todayIso();
  const ownToday = () =>
    backend.entities.DailyLog.find((row) => row.date === today && row.created_by_id === backend.user.id);
  expect(ownToday().weight_lbs).toBeGreaterThan(0);

  const sheet = await openQuickLog(page);
  await expect(sheet.getByLabel("Weight (lb)")).not.toHaveValue("");
  await sheet.getByLabel("Weight (lb)").fill("");
  await sheet.getByRole("button", { name: "Save today's log" }).click();
  await expect(sheet).toBeHidden();

  expect(requests).toHaveLength(1);
  expect(requests[0].fields.weight_lbs).toBeNull();
  // Filled fields still save; only the cleared one is nulled.
  expect(Object.entries(requests[0].fields).filter(([, value]) => value === null).map(([key]) => key)).toEqual([
    "weight_lbs"
  ]);
  const stored = ownToday();
  expect(stored).toBeTruthy();
  expect(stored).not.toHaveProperty("weight_lbs");
  expect(stored.steps).toBeGreaterThan(0);
  assertNoPageErrors();
});

test("double-tapping Add in the habit editor creates one habit", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  let creates = 0;
  // Registered after the mock, so it takes precedence: slow habit creation
  // down so a second tap lands while the first is still in flight.
  await page.route("**/entities/Habit", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    creates += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.fallback();
  });

  await page.goto("/today");
  await page.getByRole("button", { name: "Show today's checklist" }).click();
  await page.getByRole("button", { name: "Edit habits" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Stretch");
  const add = dialog.getByRole("button", { name: "Add", exact: true });
  await add.dblclick();
  await expect(add).toBeDisabled();
  await expect(dialog.getByLabel("Name")).toHaveValue("");

  expect(creates).toBe(1);
  await expect(dialog.getByText("Stretch", { exact: true })).toHaveCount(1);
  assertNoPageErrors();
});

test("workout elapsed time follows the wall clock while timers are suspended", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  await page.clock.install();
  await page.goto("/training");

  await page.getByRole("button", { name: "Start workout" }).click();
  const timer = page.getByLabel(/^Elapsed time /);
  await expect(timer).toHaveText("00:00");
  await page.clock.runFor(2000);
  await expect(timer).toHaveText("00:02");

  // Backgrounded/locked: the wall clock moves an hour, but no timer fires.
  const now = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(now + 60 * 60 * 1000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(timer).toHaveText("1:00:02");

  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByText("1:00:02 total")).toBeVisible();
  await expect(page.getByText("Duration (min)", { exact: true }).first().locator("xpath=following-sibling::input")).toHaveValue("60");
  assertNoPageErrors();
});
