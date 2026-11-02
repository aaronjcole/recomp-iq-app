import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES } from "./support/fixtures.js";
import { recalculateTargets } from "../../src/lib/fitness/recalculate.js";
import { onboardingDraftKey } from "../../src/lib/onboardingDraft.js";

const PROFILE = {
  ...ENTITY_FIXTURES.UserProfile[0],
  goal: "body_recomposition",
  goal_weight_lbs: 170,
  job_activity: "lightly_active",
  average_steps: 8000,
  training_days_per_week: 4,
  cardio_days_per_week: 2,
  experience_level: "intermediate"
};
const PREFERENCES = { ...ENTITY_FIXTURES.UserPreferences[0], tone: "direct", diet_style: "balanced" };
const STRATEGY = { id: "strategy-1", ...recalculateTargets(PROFILE, PREFERENCES), manual_override: false };

async function openProfile(page, viewport, { profile = PROFILE, strategy = STRATEGY } = {}) {
  await page.setViewportSize(viewport);
  const mock = await installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      UserProfile: [profile],
      UserPreferences: [PREFERENCES],
      CurrentStrategy: [strategy]
    }
  });
  const writes = [];
  page.on("request", (request) => {
    if (/\/entities\//.test(request.url()) && ["PUT", "PATCH", "POST", "DELETE"].includes(request.method())) {
      writes.push({ entity: request.url().match(/\/entities\/([^/?]+)/)?.[1], body: request.postDataJSON() });
    }
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more/profile");
  try {
    await expect(page.getByRole("heading", { name: "Profile & plan", exact: true })).toBeVisible({ timeout: 15000 });
  } catch (error) {
    assertNoPageErrors();
    throw error;
  }
  return { ...mock, writes, assertNoPageErrors };
}

async function selectSetting(page, mobile, name, value) {
  if (mobile) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: value, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else {
    await page.getByRole("combobox", { name, exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
}

const settingControl = (page, mobile, name) => page.getByRole(mobile ? "button" : "combobox", { name, exact: true });
const rowValue = (page, label) => page.getByText(label, { exact: true }).locator("..").locator("span").last();

for (const [device, viewport] of Object.entries({ desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const mobile = device === "mobile";
  test.describe(`Profile settings: ${device}`, () => {
    test("goal is a draft until Save goal, then persists with recalculated targets", async ({ page }) => {
      const { writes, assertNoPageErrors, entities } = await openProfile(page, viewport);
      await expect(page.getByRole("button", { name: "Save goal", exact: true })).toBeDisabled();
      await selectSetting(page, mobile, "Goal", "Build muscle");
      expect(writes).toEqual([]);
      await expect(rowValue(page, "Calories")).toHaveText(`${STRATEGY.calorie_target} kcal`);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("button", { name: "Save goal", exact: true }).click();
      await expect(page.getByText("Goal set to Build muscle", { exact: true })).toBeVisible();
      expect(entities.UserProfile.find((row) => row.id === PROFILE.id).goal).toBe("lean_bulk");
      const expected = recalculateTargets({ ...PROFILE, goal: "lean_bulk" }, PREFERENCES);
      await expect(rowValue(page, "Calories")).toHaveText(`${expected.calorie_target} kcal`);
      await expect(page.getByRole("button", { name: "Save goal", exact: true })).toBeDisabled();
      await page.reload();
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Build muscle/);
      await expect(rowValue(page, "Calories")).toHaveText(`${expected.calorie_target} kcal`);
      assertNoPageErrors();
    });

    test("failed goal save keeps its draft and old targets, blocks conflicting saves, and retries", async ({ page }) => {
      const { writes, assertNoPageErrors, entities } = await openProfile(page, viewport);
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let intercepted = false;
      await page.route("**/entities/CurrentStrategy/update-many", async (route) => {
        if (route.request().method() !== "PATCH" || intercepted) return route.fallback();
        intercepted = true;
        await gate;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary strategy outage" }) });
      });
      await selectSetting(page, mobile, "Goal", "Build muscle");
      await page.getByRole("button", { name: "Save goal", exact: true }).click();
      try {
        await expect.poll(() => intercepted).toBe(true);
        await expect(settingControl(page, mobile, "Goal")).toBeDisabled();
        await expect(settingControl(page, mobile, "Coach tone")).toBeDisabled();
        await expect(page.getByRole("button", { name: "Edit biometrics" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Redo onboarding" })).toBeDisabled();
      } finally { release(); }
      await expect(page.getByRole("alert").filter({ hasText: "Could not save your goal" })).toBeVisible();
      expect(entities.UserProfile.find((row) => row.id === PROFILE.id).goal).toBe(PROFILE.goal);
      expect(entities.CurrentStrategy.find((row) => row.id === STRATEGY.id).goal_type).toBe(PROFILE.goal);
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Build muscle/);
      await expect(rowValue(page, "Calories")).toHaveText(`${STRATEGY.calorie_target} kcal`);
      const save = page.getByRole("button", { name: "Save goal", exact: true });
      await expect(save).toBeEnabled();
      await save.click();
      await expect(page.getByText("Goal set to Build muscle", { exact: true })).toBeVisible();
      expect(writes.filter(({ entity, body }) => entity === "UserProfile" && body.data?.$set?.goal === "lean_bulk").length).toBeGreaterThan(0);
      await page.reload();
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Build muscle/);
      assertNoPageErrors();
    });

    test("same-goal retry repairs a profile left ahead of its strategy after failed rollback", async ({ page }) => {
      const { entities, assertNoPageErrors } = await openProfile(page, viewport);
      let failStrategy = true;
      let failRollback = true;
      await page.route("**/entities/CurrentStrategy/update-many", async (route) => {
        if (route.request().method() !== "PATCH" || !failStrategy) return route.fallback();
        failStrategy = false;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Strategy write unavailable" }) });
      });
      await page.route("**/entities/UserProfile/update-many", async (route) => {
        const body = route.request().postDataJSON();
        if (route.request().method() !== "PATCH" || body.data?.$set?.goal !== PROFILE.goal || !failRollback) return route.fallback();
        failRollback = false;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Profile rollback unavailable" }) });
      });
      await selectSetting(page, mobile, "Goal", "Build muscle");
      const save = page.getByRole("button", { name: "Save goal", exact: true });
      await save.click();
      await expect(page.getByRole("alert").filter({ hasText: "Could not save your goal" })).toContainText("some settings may have changed");
      expect(entities.UserProfile.find((row) => row.id === PROFILE.id).goal).toBe("lean_bulk");
      expect(entities.CurrentStrategy.find((row) => row.id === STRATEGY.id).goal_type).toBe(PROFILE.goal);
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Build muscle/);
      // Context has fresh-read the already-updated profile: the draft equals
      // its stored goal, but Save must stay available to repair the strategy.
      await expect(save).toBeEnabled();
      await save.click();
      await expect(page.getByText("Goal set to Build muscle", { exact: true })).toBeVisible();
      expect(entities.CurrentStrategy.find((row) => row.id === STRATEGY.id).goal_type).toBe("lean_bulk");
      await expect(rowValue(page, "Calories")).toHaveText(`${recalculateTargets({ ...PROFILE, goal: "lean_bulk" }, PREFERENCES).calorie_target} kcal`);
      await expect(save).toBeDisabled();
      assertNoPageErrors();
    });

    test("an existing goal mismatch can be repaired without selecting a different goal", async ({ page }) => {
      const { entities, assertNoPageErrors } = await openProfile(page, viewport, {
        profile: { ...PROFILE, goal: "lean_bulk" }
      });
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Build muscle/);
      const save = page.getByRole("button", { name: "Save goal", exact: true });
      await expect(save).toBeEnabled();
      await save.click();
      await expect(page.getByText("Goal set to Build muscle", { exact: true })).toBeVisible();
      expect(entities.CurrentStrategy.find((row) => row.id === STRATEGY.id).goal_type).toBe("lean_bulk");
      await expect(save).toBeDisabled();
      assertNoPageErrors();
    });

    test("legacy profile validation displays the actionable Redo onboarding error", async ({ page }) => {
      const { writes, assertNoPageErrors } = await openProfile(page, viewport, {
        profile: { ...PROFILE, experience_level: undefined }
      });
      await selectSetting(page, mobile, "Goal", "Build muscle");
      await page.getByRole("button", { name: "Save goal", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Could not save your goal" })).toContainText("Redo onboarding");
      expect(writes).toEqual([]);
      await expect(page.getByRole("button", { name: "Redo onboarding", exact: true })).toBeEnabled();
      assertNoPageErrors();
    });

    test("legacy missing fields and invalid goal render safely with Redo onboarding reachable", async ({ page }) => {
      const { writes, assertNoPageErrors } = await openProfile(page, viewport, {
        profile: { id: PROFILE.id, goal: "legacy_recomp" }
      });
      for (const label of ["Age", "Sex", "Height", "Current weight", "Activity", "Avg steps", "Experience"]) {
        await expect(rowValue(page, label)).toHaveText("—");
      }
      await expect(rowValue(page, "Training")).toHaveText("— lift / — cardio");
      await expect(settingControl(page, mobile, "Goal")).toHaveText(/Choose a goal/);
      await expect(page.getByRole("button", { name: "Save goal", exact: true })).toBeDisabled();
      const redo = page.getByRole("button", { name: "Redo onboarding", exact: true });
      await expect(redo).toBeEnabled();
      await redo.click();
      await expect(page).toHaveURL(/\/onboarding\?redo=1&step=0$/);
      expect(writes).toEqual([]);
      assertNoPageErrors();
    });

    test("biometrics accept zero lifting days and explicitly clear optional goal weight", async ({ page }) => {
      const { writes, assertNoPageErrors } = await openProfile(page, viewport);
      await page.getByRole("button", { name: "Edit biometrics" }).click();
      await expect(settingControl(page, mobile, "Goal")).toBeDisabled();
      await expect(settingControl(page, mobile, "Coach tone")).toBeDisabled();
      await page.getByLabel("Current weight (lb)", { exact: true }).fill("");
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
      expect(writes).toEqual([]);
      await page.getByLabel("Current weight (lb)", { exact: true }).fill(String(PROFILE.current_weight_lbs));
      await page.getByLabel("Lifting days / wk", { exact: true }).fill("0");
      await page.getByLabel("Goal weight (lb)", { exact: true }).fill("");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByText("Biometrics saved", { exact: true })).toBeVisible();
      const profileWrite = writes.find(({ entity, body }) => entity === "UserProfile" && body.data?.$set?.training_days_per_week === 0);
      expect(profileWrite).toBeTruthy();
      // UI sends null; the coordinated action removes the optional field with
      // $unset rather than relying on a nullable numeric entity schema.
      expect(profileWrite.body.data.$unset).toHaveProperty("goal_weight_lbs");
      await expect(rowValue(page, "Training")).toHaveText("0 lift / 2 cardio");
      await expect(rowValue(page, "Lifting days")).toHaveText("0");
      await expect(page.getByText("Goal weight", { exact: true })).toHaveCount(0);
      await page.reload();
      await page.getByRole("button", { name: "Edit biometrics" }).click();
      await expect(page.getByLabel("Goal weight (lb)", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Lifting days / wk", { exact: true })).toHaveValue("0");
      assertNoPageErrors();
    });

    test("coach tone failures are visible and retry confirms a persisted change", async ({ page }) => {
      const { assertNoPageErrors } = await openProfile(page, viewport);
      let failOnce = true;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let retryPending = false;
      await page.route("**/entities/UserPreferences/*", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        if (failOnce) {
          failOnce = false;
          return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary preferences outage" }) });
        }
        retryPending = true;
        await gate;
        return route.fallback();
      });
      await selectSetting(page, mobile, "Coach tone", "analytical");
      await expect(page.getByRole("alert").filter({ hasText: "Could not save coach tone" })).toBeVisible();
      await expect(settingControl(page, mobile, "Coach tone")).toHaveText(/direct/);
      await selectSetting(page, mobile, "Coach tone", "analytical");
      try {
        await expect.poll(() => retryPending).toBe(true);
        await expect(settingControl(page, mobile, "Coach tone")).toBeDisabled();
        await expect(settingControl(page, mobile, "Goal")).toBeDisabled();
        await expect(page.getByRole("button", { name: "Edit biometrics" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Redo onboarding" })).toBeDisabled();
      } finally { release(); }
      await expect(page.getByText("Coach tone saved", { exact: true })).toBeVisible();
      await expect(settingControl(page, mobile, "Coach tone")).toHaveText(/analytical/);
      await expect(page.getByRole("alert").filter({ hasText: "Could not save coach tone. Please select" })).toHaveCount(0);
      await page.reload();
      await expect(settingControl(page, mobile, "Coach tone")).toHaveText(/analytical/);
      assertNoPageErrors();
    });
  });
}

test("redo onboarding starts from saved answers without mutating the account or clearing other drafts", async ({ page }) => {
  const { writes, assertNoPageErrors } = await openProfile(page, { width: 390, height: 844 });
  const regularKey = onboardingDraftKey(AUTH_USER.id);
  const otherKey = onboardingDraftKey("another-account", "redo");
  const redoKey = onboardingDraftKey(AUTH_USER.id, "redo");
  await page.evaluate(({ regularKey, otherKey, redoKey }) => {
    localStorage.setItem(regularKey, "regular-draft-sentinel");
    localStorage.setItem(otherKey, "other-account-sentinel");
    localStorage.setItem(redoKey, JSON.stringify({ p: { goal: "aggressive_gain", age: "99" }, pref: {}, units: "imperial", step: 2 }));
  }, { regularKey, otherKey, redoKey });
  await page.getByRole("button", { name: "Redo onboarding", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\?redo=1&step=0$/);
  await expect(page.getByRole("radio", { name: /^Recomp / })).toBeChecked();
  await page.getByRole("radio", { name: /Build muscle/ }).first().check({ force: true });
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  await expect(page.getByLabel("Age", { exact: true })).toHaveValue(String(PROFILE.age));
  expect(writes).toEqual([]);
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(stored[regularKey]).toBe("regular-draft-sentinel");
  expect(stored[otherKey]).toBe("other-account-sentinel");
  assertNoPageErrors();
});
