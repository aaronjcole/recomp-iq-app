import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

// Progress → Overview explains the data: observed facts, each measure's
// direction for the goal, whether they agree, an inferred explanation with
// its confidence, and what's missing.

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const profile = {
  ...ENTITY_FIXTURES.UserProfile[0],
  goal: "fat_loss",
  job_activity: "lightly_active",
  training_days_per_week: 3,
  cardio_days_per_week: 2,
  average_steps: 8000,
  experience_level: "intermediate"
};

function logs(days, { sleep = 7.5, waist = true } = {}) {
  return Array.from({ length: days }, (_, day) => ({
    id: `pi-log-${day}`,
    date: isoDaysAgo(day),
    // Down ~1 lb a week, toward a fat-loss goal.
    weight_lbs: 180 + day * 0.15,
    ...(waist ? { waist_in: 34 + day * 0.05 } : {}),
    calories: 2200,
    protein_g: 170,
    steps: 9000,
    workout_completed: day % 2 === 0,
    sleep_hours: sleep,
    energy_rating: sleep < 6 ? 2 : 4,
    soreness_rating: 2
  }));
}

const lift = (id, daysAgo, e1rm) => ({ id, date: isoDaysAgo(daysAgo), lift_name: "Bench Press", weight: 185, reps: 5, sets: 3, estimated_1rm: e1rm });

function dataset({ dailyLogs, strengthLogs }) {
  return { ...ENTITY_FIXTURES, UserProfile: [profile], DailyLog: dailyLogs, StrengthLog: strengthLogs, ExerciseSession: [] };
}

const card = (page) => page.getByRole("region", { name: "What your data says" });

test("agreeing signals are read as fat loss, with facts and the inference kept apart", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset({ dailyLogs: logs(21), strengthLogs: [lift("s1", 20, 210), lift("s2", 2, 216)] })
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/progress");

  const insights = card(page);
  await expect(insights).toContainText(/high confidence/i);
  await expect(insights.getByRole("heading", { name: "Observed" })).toBeVisible();
  await expect(insights).toContainText("Weight: 7-day average");
  await expect(insights).toContainText("Weight, waist and strength point the same way.");
  await expect(insights.getByRole("heading", { name: /Likely explanation \(inferred, high confidence\)/ })).toBeVisible();
  await expect(insights).toContainText("consistent with fat loss");
  await expect(insights.getByRole("heading", { name: "Not enough data" })).toHaveCount(0);
  assertNoPageErrors();
});

test("weight down with strength falling is shown as a conflict, with recovery in the advice", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset({ dailyLogs: logs(21, { sleep: 5 }), strengthLogs: [lift("s1", 20, 216), lift("s2", 2, 200)] })
  });
  await page.goto("/progress");

  const insights = card(page);
  await expect(insights).toContainText("Mixed signals: weight and waist are moving toward your goal, strength against it.");
  await expect(insights).toContainText("muscle loss or accumulated fatigue");
  await expect(insights).toContainText("Recovery is also poor this week");
  await expect(insights.getByText("Against your goal").first()).toBeVisible();
});

test("missing measures are listed with why, and a short history stays low confidence", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset({ dailyLogs: logs(9, { waist: false }), strengthLogs: [] })
  });
  await page.goto("/progress");

  const insights = card(page);
  await expect(insights).toContainText(/low confidence/i);
  const missing = insights.getByRole("heading", { name: "Not enough data" });
  await expect(missing).toBeVisible();
  await expect(insights).toContainText("Waist: No waist measurement in both of the last two weeks.");
  await expect(insights).toContainText("Strength: No lift logged at least twice");
  await expect(insights).toContainText("too early to read the trend");
});
