import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ADAPTIVE_TRAINING_BLOCK, ENTITY_FIXTURES } from "./support/fixtures.js";

// Manual mode means the user owns their calorie, macro and step numbers. A goal
// change re-derives the formula targets, but must not write them over the
// user's own (the rule biometrics edits and the weekly check-in already follow).
test("changing goal in manual mode keeps the user's custom targets", async ({ page }) => {
  const manualStrategy = {
    ...ENTITY_FIXTURES.CurrentStrategy[0],
    goal_type: "body_recomposition",
    manual_override: true
  };
  // The shared fixture profile lacks fields onboarding always sets.
  const profile = {
    ...ENTITY_FIXTURES.UserProfile[0],
    goal: "body_recomposition",
    job_activity: "lightly_active",
    training_days_per_week: 4,
    cardio_days_per_week: 2,
    average_steps: 8000,
    experience_level: "intermediate"
  };
  await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, UserProfile: [profile], CurrentStrategy: [manualStrategy] }
  });
  const assertNoPageErrors = watchPageErrors(page);
  const strategyWrites = [];
  page.on("request", (request) => {
    if (/\/entities\/CurrentStrategy\//.test(request.url()) && ["PUT", "PATCH"].includes(request.method())) {
      strategyWrites.push(JSON.parse(request.postData() || "{}"));
    }
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/more/profile");
  await page.getByRole("combobox", { name: "Goal" }).click();
  await page.getByRole("option", { name: "Build muscle", exact: true }).click();

  await expect.poll(() => strategyWrites.length).toBeGreaterThan(0);
  const write = strategyWrites.at(-1);
  expect(write.goal_type).toBe("lean_bulk");
  for (const key of ["calorie_target", "protein_target_g", "carb_target_g", "fat_target_g", "step_target"]) {
    expect(write, `manual ${key} must not be overwritten`).not.toHaveProperty(key);
  }
  await expect(page.getByText("Your custom targets were kept.").first()).toBeVisible();
  assertNoPageErrors();
});

function isoDate(daysFromToday) {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000 + daysFromToday * 86400000);
  return local.toISOString().slice(0, 10);
}

// A training block repeats one weekly schedule. Finishing week one's sessions
// must open them again in week two, not leave the block stuck at "4 of 20".
test("a training block reopens its schedule each week instead of stalling after week one", async ({ page }) => {
  const weekStart = isoDate(-8);
  const legacyWeekOne = [0, 1, 2, 3].map((dayIndex) => ({
    day_index: dayIndex,
    session_id: `week1-${dayIndex}`,
    completed_date: isoDate(-8 + dayIndex)
  }));
  await installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      TrainingBlock: [{
        id: "block-1",
        status: "active",
        week_start: weekStart,
        block_length_weeks: 5,
        equipment: "full_gym",
        plan_json: JSON.stringify({ ...ADAPTIVE_TRAINING_BLOCK, weekStart }),
        completed_sessions: JSON.stringify(legacyWeekOne),
        created_date: new Date().toISOString()
      }]
    }
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/training");

  const card = page.getByRole("heading", { name: "Active training block" }).locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]");
  await expect(card.getByText("Week 2 of 5", { exact: false })).toBeVisible();
  await expect(card.getByText("4 of 20 sessions done")).toBeVisible();
  await expect(card.getByRole("button", { name: "Start Upper A" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Start Lower B" })).toBeVisible();
  assertNoPageErrors();
});
