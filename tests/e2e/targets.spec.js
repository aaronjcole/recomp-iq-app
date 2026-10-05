import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

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
