import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";
import { recalculateTargets } from "../../src/lib/fitness/recalculate.js";

test("a refresh started during a goal save cannot replace the saved plan with an older response", async ({ page }) => {
  const profile = {
    ...ENTITY_FIXTURES.UserProfile[0], goal: "body_recomposition", job_activity: "lightly_active",
    average_steps: 8000, training_days_per_week: 4, cardio_days_per_week: 2, experience_level: "intermediate"
  };
  const preferences = { ...ENTITY_FIXTURES.UserPreferences[0], tone: "direct" };
  const strategy = { id: "strategy-1", ...recalculateTargets(profile, preferences), manual_override: false };
  const { entities } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, UserProfile: [profile], UserPreferences: [preferences], CurrentStrategy: [strategy] }
  });
  const noErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/more/profile");
  let releaseSave, releaseRefresh;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  let savePending = false, refreshPending = false;
  await page.route("**/entities/CurrentStrategy/update-many", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    savePending = true;
    await saveGate;
    return route.fallback();
  });
  try {
    await page.getByRole("combobox", { name: "Goal", exact: true }).click();
    await page.getByRole("option", { name: "Build muscle", exact: true }).click();
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect.poll(() => savePending).toBe(true);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();

    await page.route("**/entities/CurrentStrategy?*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const snapshot = structuredClone(entities.CurrentStrategy);
      refreshPending = true;
      await refreshGate;
      return route.fulfill({ json: snapshot });
    });
    await page.getByRole("button", { name: "Refresh data", exact: true }).click();
    await expect.poll(() => refreshPending).toBe(true);
    releaseSave();
    await expect.poll(() => entities.DecisionLedger.some((row) => row.reason === "Goal changed to Build muscle.")).toBe(true);
    releaseRefresh();
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Profile & plan", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Goal", exact: true })).toContainText("Build muscle");
    const expected = recalculateTargets({ ...profile, goal: "lean_bulk" }, preferences);
    const calories = page.getByText("Calories", { exact: true }).locator("..").locator("span").last();
    await expect(calories).toHaveText(`${expected.calorie_target} kcal`);
    await expect(page.getByText("Your plan needs to be synced.", { exact: false })).toHaveCount(0);
    noErrors();
  } finally {
    releaseSave();
    releaseRefresh();
  }
});
