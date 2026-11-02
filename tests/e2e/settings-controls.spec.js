import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

test.use({ viewport: { width: 390, height: 844 } });

async function installSettings(page, manual = true) {
  await installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      UserProfile: [{
        ...ENTITY_FIXTURES.UserProfile[0],
        goal: "body_recomposition",
        job_activity: "sedentary",
        average_steps: 8000,
        training_days_per_week: 4,
        cardio_days_per_week: 2,
        experience_level: "intermediate"
      }],
      UserPreferences: [{ ...ENTITY_FIXTURES.UserPreferences[0], tone: "direct" }],
      CurrentStrategy: [{
        ...ENTITY_FIXTURES.CurrentStrategy[0],
        goal_type: "body_recomposition",
        manual_override: manual
      }]
    }
  });
  return watchPageErrors(page);
}

const targetSwitch = (page) => page.getByRole("switch", { name: "Toggle custom targets" });
const calories = (page) => page.getByRole("spinbutton", { name: "Calories target" });
const saveButton = (page) => page.getByRole("button", { name: "Save targets", exact: true });

async function holdStrategyWrite(page) {
  let release;
  let started;
  const pending = new Promise((resolve) => { release = resolve; });
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const writes = [];
  await page.route("**/entities/CurrentStrategy/*", async (route) => {
    if (!["PUT", "PATCH"].includes(route.request().method())) return route.fallback();
    writes.push(route.request().postDataJSON());
    started();
    await pending;
    await route.fallback();
  });
  return { release, requestStarted, writes };
}

test("adaptive targets are disabled inputs, including for keyboard users", async ({ page }) => {
  const assertNoErrors = await installSettings(page, false);
  await page.goto("/nutrition?panel=targets");
  await expect(calories(page)).toHaveValue("2200");
  const fields = page.getByRole("spinbutton", { name: /target$/ });
  await expect(fields).toHaveCount(5);
  for (const input of await fields.all()) await expect(input).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  await expect(targetSwitch(page)).toBeEnabled();
  assertNoErrors();
});

for (const width of [390, 1280]) {
  test(`saving targets excludes overlapping mode changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const assertNoErrors = await installSettings(page);
    await page.goto("/nutrition?panel=targets");
    await calories(page).fill("1800");
    const write = await holdStrategyWrite(page);
    try {
      await saveButton(page).click();
      await write.requestStarted;
      await expect(targetSwitch(page)).toBeDisabled();
      for (const input of await page.getByRole("spinbutton", { name: /target$/ }).all()) {
        await expect(input).toBeDisabled();
      }
      await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    } finally {
      write.release();
    }
    await expect(page.getByText("Targets saved", { exact: true })).toBeVisible();
    await expect(calories(page)).toBeEnabled();
    await expect(calories(page)).toHaveValue("1800");
    await expect(targetSwitch(page)).toBeChecked();
    expect(write.writes).toHaveLength(1);
    expect(write.writes[0]).toMatchObject({ calorie_target: 1800, manual_override: true });
    assertNoErrors();
  });
}

test("a pending mode change disables saves and prevents repeated toggles", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.goto("/nutrition?panel=targets");
  await expect(calories(page)).toBeEnabled();
  const write = await holdStrategyWrite(page);
  try {
    await targetSwitch(page).click();
    await write.requestStarted;
    await expect(targetSwitch(page)).toBeDisabled();
    await expect(calories(page)).toBeDisabled();
    await expect(saveButton(page)).toBeDisabled();
    // A disabled native button also rejects activation outside pointer input.
    await targetSwitch(page).evaluate((button) => button.click());
  } finally {
    write.release();
  }
  await expect(targetSwitch(page)).not.toBeChecked();
  await expect(targetSwitch(page)).toBeEnabled();
  await expect(calories(page)).toBeDisabled();
  expect(write.writes).toEqual([{ manual_override: false }]);
  assertNoErrors();
});

test("failed target saves show an error, retain edits, and allow retry", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.goto("/nutrition?panel=targets");
  await calories(page).fill("1800");
  await page.route("**/entities/CurrentStrategy/*", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "Temporarily unavailable" })
  }));
  await saveButton(page).click();
  await expect(page.getByText("Could not save targets", { exact: true })).toBeVisible();
  await expect(calories(page)).toHaveValue("1800");
  await expect(calories(page)).toBeEnabled();
  await expect(targetSwitch(page)).toBeEnabled();
  await expect(saveButton(page)).toBeEnabled();
  await expect(page.getByText("Targets saved", { exact: true })).toHaveCount(0);
  await page.unroute("**/entities/CurrentStrategy/*");
  await saveButton(page).click();
  await expect(page.getByText("Targets saved", { exact: true })).toBeVisible();
  await expect(calories(page)).toHaveValue("1800");
  assertNoErrors();
});

for (const manual of [false, true]) {
  test(`failed mode change preserves ${manual ? "manual" : "adaptive"} mode and allows retry`, async ({ page }) => {
    const assertNoErrors = await installSettings(page, manual);
    await page.goto("/nutrition?panel=targets");
    await expect(calories(page)).toHaveValue("2200");
    await page.route("**/entities/CurrentStrategy/*", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Temporarily unavailable" })
    }));
    await targetSwitch(page).click();
    await expect(page.getByText("Could not change target mode", { exact: true })).toBeVisible();
    await expect(targetSwitch(page)).toBeChecked({ checked: manual });
    await expect(targetSwitch(page)).toBeEnabled();
    if (manual) await expect(calories(page)).toBeEnabled();
    else await expect(calories(page)).toBeDisabled();
    await page.unroute("**/entities/CurrentStrategy/*");
    await targetSwitch(page).click();
    await expect(targetSwitch(page)).toBeChecked({ checked: !manual });
    await expect(targetSwitch(page)).toBeEnabled();
    assertNoErrors();
  });
}

for (const shortcut of [
  { label: "Grocery list", segment: "tools", section: "grocery-list-section" },
  { label: "Meal templates", segment: "library", section: "meal-templates-section" }
]) {
  for (const cached of [false, true]) {
    test(`More opens and scrolls to ${shortcut.label} with Fuel ${cached ? "cached" : "unvisited"}`, async ({ page }) => {
      const assertNoErrors = await installSettings(page);
      if (cached) {
        await page.goto("/nutrition");
        await expect(page.getByRole("tab", { name: "Diary", exact: true, selected: true })).toBeVisible();
        await page.getByRole("link", { name: "More", exact: true }).click();
      } else await page.goto("/more");
      // The chevron used to sit outside the interactive label button.
      await page.getByRole("button", { name: new RegExp(`^${shortcut.label}`) }).locator("svg").last().click();
      await expect(page).toHaveURL(new RegExp(`/nutrition\\?segment=${shortcut.segment}$`));
      await expect(page.getByRole("tab", { name: new RegExp(shortcut.segment, "i"), selected: true })).toBeVisible();
      await expect(page.locator(`#${shortcut.section}`)).toBeInViewport();
      assertNoErrors();
    });
  }
}

test("tapping a More row badge activates the whole row", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.goto("/more");
  await page.getByRole("button", { name: /^Premium features/ }).getByText("Premium", { exact: true }).click();
  await expect(page).toHaveURL(/\/more\/premium$/);
  await expect(page.getByRole("heading", { name: "Premium features", exact: true })).toBeVisible();
  assertNoErrors();
});

test("Refresh data prevents duplicate requests and reports success", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.goto("/more");
  const refresh = page.getByRole("button", { name: "Refresh data", exact: true });
  await expect(refresh).toBeVisible();
  let release;
  let started;
  const pending = new Promise((resolve) => { release = resolve; });
  const requestStarted = new Promise((resolve) => { started = resolve; });
  let refreshRequests = 0;
  await page.route(/\/entities\/UserProfile(?:\?|$)/, async (route) => {
    refreshRequests += 1;
    started();
    await pending;
    await route.fallback();
  });
  try {
    await refresh.evaluate((button) => { button.click(); button.click(); });
    await requestStarted;
    await expect(page.getByText("Data refreshed", { exact: true })).toHaveCount(0);
    // reload temporarily replaces the app with its existing loading screen.
    await expect(page.getByRole("heading", { name: "More", exact: true })).toHaveCount(0);
    expect(refreshRequests).toBe(1);
  } finally {
    release();
  }
  await expect(page.getByText("Data refreshed", { exact: true })).toBeVisible();
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect.poll(() => refreshRequests).toBe(2);
  await expect(refresh).toBeEnabled();
  await expect(page.getByText("Could not refresh data", { exact: true })).toHaveCount(0);
  assertNoErrors();
});

test("Refresh data reports a load failure without claiming success and can recover", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.goto("/more");
  await expect(page.getByRole("button", { name: "Refresh data", exact: true })).toBeVisible();
  await page.route(/\/entities\/UserProfile(?:\?|$)/, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "Temporarily unavailable" })
  }));
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.getByText("Could not refresh data", { exact: true })).toBeVisible();
  await expect(page.getByText("Data refreshed", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "We couldn't load your data", exact: true })).toBeVisible();
  await page.unroute(/\/entities\/UserProfile(?:\?|$)/);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh data", exact: true })).toBeEnabled();
  assertNoErrors();
});

test("mobile setting drawers can scroll to the last option and dismiss", async ({ page }) => {
  const assertNoErrors = await installSettings(page);
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("/more/profile");
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const lastOption = dialog.getByRole("button", { name: "Gain quickly", exact: true });
  await lastOption.scrollIntoViewIfNeeded();
  await expect(lastOption).toBeInViewport();
  // Keep the goal persistence path outside this review: Escape closes without saving.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  assertNoErrors();
});
