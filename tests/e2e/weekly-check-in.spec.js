import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

// Weekly Check-In v2 (featureFlags.weeklyCheckInV2, on for the Playwright
// server). The mock runs decideWeeklyCheckIn's real state machine against
// these rows. The scenario is a fat-loss plateau with good adherence, which
// the engine answers with a 150 kcal reduction: 2,200 -> 2,050.

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function plateauLogs(days) {
  return Array.from({ length: days }, (_, day) => ({
    id: `plateau-${day}`,
    date: isoDaysAgo(day),
    weight_lbs: 200,
    calories: 2200,
    protein_g: 180,
    steps: 9000,
    sleep_hours: 7.5,
    energy_rating: 4,
    soreness_rating: 2,
    workout_completed: day % 2 === 0
  }));
}

function dataset({ days = 28, manual = false } = {}) {
  return {
    ...ENTITY_FIXTURES,
    UserProfile: [{ ...ENTITY_FIXTURES.UserProfile[0], goal: "fat_loss", job_activity: "active" }],
    UserPreferences: [{ ...ENTITY_FIXTURES.UserPreferences[0], safety_flags: [] }],
    CurrentStrategy: [{
      id: "strategy-1",
      goal_type: "fat_loss",
      calorie_target: 2200,
      protein_target_g: 180,
      carb_target_g: 220,
      fat_target_g: 70,
      step_target: 9000,
      lifting_days_target: 3,
      cardio_days_target: 2,
      behavior_focus: "Hit protein daily.",
      manual_override: manual
    }],
    DailyLog: plateauLogs(days),
    WeeklyCheckIn: [],
    DecisionLedger: []
  };
}

/** Records every write the app makes: entity POST/PUT/PATCH/DELETE and function calls. */
function watchWrites(page) {
  const writes = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/api/apps/")) return;
    const entityWrite = /\/entities\//.test(url) && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method());
    if (entityWrite || /\/functions\/decideWeeklyCheckIn/.test(url)) writes.push(`${request.method()} ${url}`);
  });
  return writes;
}

async function openCheckIn(page) {
  const row = page.getByRole("button", { name: /Weekly check-in/ });
  await expect(row).not.toContainText("Loading your history…");
  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Weekly check-in" })).toBeVisible();
  return dialog;
}

test("reviewing, closing and reopening a check-in changes nothing", async ({ page }) => {
  await installAuthenticatedBase44(page, { entities: dataset() });
  const assertNoPageErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/more");
  const writes = watchWrites(page);

  let dialog = await openCheckIn(page);
  // Focus starts on the review heading.
  await expect(dialog.getByRole("heading", { name: "Weekly check-in" })).toBeFocused();
  await expect(dialog).toContainText("Reduce calories");
  await expect(dialog).toContainText("Calories: 2,200 → 2,050 kcal (−150 kcal)");
  await expect(dialog).toContainText("Confidence: High");
  await expect(dialog.getByRole("button", { name: "Apply 2,050 calorie target" })).toBeVisible();
  // Mobile: a bottom sheet that fits the viewport width.
  const box = await dialog.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);

  await dialog.getByRole("button", { name: "Decide later" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Weekly check-in/ })).toBeFocused();

  dialog = await openCheckIn(page);
  await expect(dialog.getByRole("button", { name: "Apply 2,050 calorie target" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  expect(writes).toEqual([]);
  assertNoPageErrors();
});

test("applying a proposal changes the targets once and records the decision", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, { entities: dataset() });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more");

  const dialog = await openCheckIn(page);
  const apply = dialog.getByRole("button", { name: "Apply 2,050 calorie target" });
  await apply.dblclick();
  await expect(dialog.getByRole("status")).toHaveText("Applied. Your new targets start today.");
  await expect(dialog).toContainText("Calories: 2,200 → 2,050 kcal");

  expect(entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target).toBe(2050);
  const checkIns = entities.WeeklyCheckIn;
  expect(checkIns).toHaveLength(1);
  expect(checkIns[0]).toMatchObject({ status: "applied", user_decision: "apply" });
  const ledger = entities.DecisionLedger.filter((row) => row.weekly_check_in_id === checkIns[0].id);
  expect(ledger).toHaveLength(1);

  // Reopening this week's check-in shows the recorded decision, not a new proposal.
  await page.keyboard.press("Escape");
  const reopened = await openCheckIn(page);
  await expect(reopened).toContainText("Applied. Your new targets start today.");
  await expect(reopened.getByRole("button", { name: /^Apply/ })).toHaveCount(0);

  await reopened.getByRole("button", { name: "View decision history" }).click();
  await expect(page).toHaveURL(/\/more\/decisions$/);
  await expect(page.getByText("2,050").first()).toBeVisible();
  assertNoPageErrors();
});

test("keeping the current plan records the decision without changing targets", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, { entities: dataset() });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more");

  const dialog = await openCheckIn(page);
  await dialog.getByRole("button", { name: "Keep current plan" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Recorded. Your current targets stay as they are.");
  expect(entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target).toBe(2200);
  expect(entities.WeeklyCheckIn).toMatchObject([{ status: "declined", user_decision: "keep_current" }]);
  expect(entities.DecisionLedger).toHaveLength(0);
  assertNoPageErrors();
});

test("customize records the decision and opens custom targets", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, { entities: dataset() });
  await page.goto("/more");
  const dialog = await openCheckIn(page);
  await dialog.getByRole("button", { name: "Review custom targets" }).click();
  await expect(page).toHaveURL(/\/nutrition\?panel=targets$/);
  expect(entities.WeeklyCheckIn).toMatchObject([{ status: "declined", user_decision: "customize" }]);
  expect(entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target).toBe(2200);
});

test("manual targets keep the proposal advisory", async ({ page }) => {
  await installAuthenticatedBase44(page, { entities: dataset({ manual: true }) });
  await page.goto("/more");
  const dialog = await openCheckIn(page);
  await expect(dialog).toContainText("Manual targets are on, so this is advice only.");
  await expect(dialog.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Keep current plan" })).toBeVisible();
});

test("insufficient data explains what is missing and offers no apply", async ({ page }) => {
  await installAuthenticatedBase44(page, { entities: dataset({ days: 10 }) });
  await page.goto("/more");
  const dialog = await openCheckIn(page);
  await expect(dialog).toContainText("Keep collecting data");
  await expect(dialog).toContainText("Log at least 14 days");
  await expect(dialog).toContainText("Confidence: Low");
  await expect(dialog.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
});

test("a proposal made stale by another device is refreshed before anything changes", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, { entities: dataset() });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more");
  const dialog = await openCheckIn(page);

  // Another device raises the calorie target after this page loaded.
  entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target = 2300;
  await dialog.getByRole("button", { name: "Apply 2,050 calorie target" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Your latest data changed this check-in. Review it again before deciding."
  );
  await expect(dialog.getByRole("button", { name: "Apply 2,150 calorie target" })).toBeVisible();
  expect(entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target).toBe(2300);
  expect(entities.WeeklyCheckIn ?? []).toHaveLength(0);

  await dialog.getByRole("button", { name: "Apply 2,150 calorie target" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Applied. Your new targets start today.");
  expect(entities.CurrentStrategy.find((row) => row.id === "strategy-1").calorie_target).toBe(2150);
  assertNoPageErrors();
});

test("a failed save is announced and can be retried", async ({ page }) => {
  await installAuthenticatedBase44(page, { entities: dataset(), functionErrors: { decideWeeklyCheckIn: 503 } });
  await page.goto("/more");
  const dialog = await openCheckIn(page);
  await dialog.getByRole("button", { name: "Keep current plan" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep current plan" })).toBeEnabled();
});
