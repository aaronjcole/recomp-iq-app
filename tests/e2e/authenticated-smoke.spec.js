import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";

// Runtime oracle for the Wave 1 data-layer / mega-context refactor. Each test
// boots the real app signed in against fixtures and asserts the screen renders
// its heading with no uncaught error — the failure mode a dropped context
// consumer, mis-gated first paint, or white-screened tab produces, which lint,
// typecheck, and the unit tests do not catch.

const TABS = [
  { label: "Today", path: "/today", heading: "Today" },
  { label: "Fuel", path: "/nutrition", heading: "Nutrition" },
  { label: "Train", path: "/training", heading: "Training" },
  { label: "Progress", path: "/progress", heading: "Progress" },
  { label: "More", path: "/more", heading: "More" },
];

test.beforeEach(async ({ page }) => {
  await installAuthenticatedBase44(page);
});

test("the signed-in shell reaches Today with data, not login or onboarding", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  assertNoPageErrors();
});

test("every authenticated tab renders its screen without a runtime error", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  for (const tab of TABS) {
    await page.goto(tab.path);
    await expect(page.getByRole("heading", { level: 1, name: tab.heading })).toBeVisible();
  }

  assertNoPageErrors();
});

test("bottom-nav navigation preserves the tab shell and updates the route", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  const nav = page.getByRole("navigation", { name: "Primary" });

  await nav.getByRole("link", { name: "Fuel" }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByRole("heading", { level: 1, name: "Nutrition" })).toBeVisible();

  await nav.getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByRole("heading", { level: 1, name: "Progress" })).toBeVisible();

  await nav.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  assertNoPageErrors();
});

test("Today opens the single canonical logging sheet", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  await page.getByRole("button", { name: "Log today's basics", exact: true }).click();

  // QuickLogSheet is the one logging surface after the redesign.
  const sheet = page.getByRole("dialog", { name: "Log today" });
  await expect(sheet.getByText("Add the signals you have. Empty fields stay unlogged.")).toBeVisible();
  await expect(sheet.getByText("Weight (lb)")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Save today's log/i })).toBeVisible();
  assertNoPageErrors();
});

// Interaction coverage: exercises the write -> optimistic state -> render loop,
// which the pure render tests above do not. This is what makes the context
// split safe — a broken habits domain (e.g. habitEntries no longer flowing to
// HabitsCard) fails here, not silently in production.
test("incrementing a habit updates its counter without a reload", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  // Fixture seeds Water at 80/100 today; step size is target/10 = 10.
  await expect(page.getByText("80/100 oz")).toBeVisible();

  // Assert only after the write reconciles, so this verifies the persisted
  // value survives — not just the optimistic paint that appears before the
  // network resolves (which would hide a broken reconcile/rollback).
  const written = page.waitForResponse(
    (r) => r.url().includes("/functions/upsertTrackingRecord") && r.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Increase" }).click();
  await written;
  await expect(page.getByText("90/100 oz")).toBeVisible();

  assertNoPageErrors();
});

test("saving the daily log closes the sheet without error", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  await page.getByRole("button", { name: "Log today's basics", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Log today" });
  const sheetText = sheet.getByText("Add the signals you have. Empty fields stay unlogged.");
  await expect(sheetText).toBeVisible();

  await page.getByRole("button", { name: /Save today's log/i }).click();
  await expect(sheet).toBeHidden();

  assertNoPageErrors();
});

test("shared controls stay touch-safe without overflowing a narrow mobile layout", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 320, height: 640 });

  await page.goto("/nutrition");
  await expect(page.getByRole("heading", { level: 1, name: "Nutrition" })).toBeVisible();

  const barcodeBox = await page.getByRole("button", { name: /Barcode/i }).boundingBox();
  expect(barcodeBox?.height).toBeGreaterThanOrEqual(44);

  const inputBox = await page.locator("input").first().boundingBox();
  expect(inputBox?.height).toBeGreaterThanOrEqual(44);

  const layoutWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
    overflowing: [...document.body.querySelectorAll("*")]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.getAttribute("class") || "",
          text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || "",
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
        };
      })
      .filter(({ left, right, width }) => width > 0 && (left < 0 || right > window.innerWidth))
      .slice(0, 12),
  }));
  expect(
    layoutWidth.content,
    `Overflowing elements: ${JSON.stringify(layoutWidth.overflowing)}`
  ).toBeLessThanOrEqual(layoutWidth.viewport);

  await page.goto("/today");
  await page.getByRole("button", { name: "Log today's basics", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Log today" });
  const closeBox = await sheet.getByRole("button", { name: "Close" }).boundingBox();
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);

  assertNoPageErrors();
});

test("custom mobile actions expose at least 44px touch targets", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const expectTouchSafe = async (locator, name) => {
    const box = await locator.boundingBox();
    expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box?.width, `${name} width`).toBeGreaterThanOrEqual(44);
  };

  await page.goto("/today");
  await expectTouchSafe(page.getByRole("link", { name: "Manage" }), "Today Manage link");
  await expectTouchSafe(page.getByRole("link", { name: "Full progress" }), "Today Full progress link");

  await page.goto("/more");
  await expectTouchSafe(page.getByRole("button", { name: /Premium features/i }), "More navigation row");

  await page.goto("/nutrition");
  await expectTouchSafe(page.getByRole("button", { name: "Remove ingredient 1" }), "Recipe remove action");

  await page.goto("/training");
  await expectTouchSafe(page.getByRole("button", { name: /Edit Strength/i }).first(), "Training history edit action");
  await expectTouchSafe(page.getByRole("button", { name: /Delete Strength/i }).first(), "Training history delete action");

  assertNoPageErrors();
});

test("primary nutrition, training, and habit forms expose descriptive field names", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/nutrition");
  for (const name of [
    "Food name",
    "Serving",
    "Grams",
    "Food calories",
    "Food protein (g)",
    "Food carbs (g)",
    "Food fat (g)",
    "Food fiber (g)",
    "Recipe title",
    "Recipe servings",
    "Ingredient 1 name",
    "Ingredient 1 quantity",
    "Ingredient 1 unit",
  ]) {
    await expect(page.getByLabel(name, { exact: true }), `${name} should name its control`).toBeVisible();
  }
  await page.getByText("Targets & adaptive mode", { exact: true }).click();
  for (const name of ["Calories target", "Protein (g) target", "Carbs (g) target", "Fat (g) target", "Steps target"]) {
    await expect(page.getByLabel(name, { exact: true }), `${name} should name its control`).toBeVisible();
  }

  await page.goto("/training");
  for (const name of [
    "Date",
    "Type",
    "Title",
    "Duration (min)",
    "RPE (1-10)",
    "Muscle groups",
  ]) {
    await expect(page.getByLabel(name, { exact: true }), `${name} should name its control`).toBeVisible();
  }
  await page.getByRole("button", { name: "Add lift" }).click();
  for (const name of ["Lift 1 name", "Lift 1 weight (lb)", "Lift 1 reps", "Lift 1 sets"]) {
    await expect(page.getByLabel(name, { exact: true }), `${name} should identify its row`).toBeVisible();
  }

  await page.goto("/today");
  await page.getByRole("button", { name: "Edit habits" }).click();
  const editor = page.getByRole("dialog", { name: "Add habit" });
  await expect(editor.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("Kind", { exact: true })).toBeVisible();
  await expect(editor.getByRole("group", { name: "Icon" })).toBeVisible();
  await editor.getByLabel("Kind", { exact: true }).click();
  await page.getByRole("option", { name: "Count", exact: true }).click();
  await expect(editor.getByRole("spinbutton", { name: "Target", exact: true })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Unit", exact: true })).toBeVisible();

  assertNoPageErrors();
});

test("appearance follows the system by default and preserves explicit overrides", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("theme-test-initialized")) return;
    window.localStorage.removeItem("recomp-theme");
    window.sessionStorage.setItem("theme-test-initialized", "true");
  });
  await page.emulateMedia({ colorScheme: "dark" });

  await page.goto("/more");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  const appearance = page.getByRole("combobox", { name: "Appearance", exact: true });
  await expect(appearance).toContainText("System");
  await appearance.click();
  await page.getByRole("option", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("recomp-theme"))).toBe("light");

  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect(appearance).toContainText("Light");

  await appearance.click();
  await page.getByRole("option", { name: "System", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

  assertNoPageErrors();
});

test("More groups its actions into named sections and lists", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more");

  const coachingSection = page.getByRole("region", { name: "Coaching & plan" });
  await expect(coachingSection.getByRole("heading", { level: 2, name: "Coaching & plan" })).toBeVisible();
  await expect(coachingSection.getByRole("listitem")).toHaveCount(7);

  const accountSection = page.getByRole("region", { name: "App & account" });
  await expect(accountSection.getByRole("heading", { level: 2, name: "App & account" })).toBeVisible();
  await expect(accountSection.getByRole("listitem")).toHaveCount(4);

  const legalSection = page.getByRole("region", { name: "Legal" });
  await expect(legalSection.getByRole("listitem")).toHaveCount(4);

  assertNoPageErrors();
});

test("the Premium catalog shows server-authorized tester access inside the More tab", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const premiumResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/getPremiumAccess")
  );

  await page.goto("/more");
  await page.getByRole("button", { name: /Premium features/i }).click();

  const response = await premiumResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/more\/premium$/);
  await expect(page.getByRole("heading", { level: 1, name: "Premium features" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Testing access enabled" })).toBeVisible();
  await expect(page.getByText("Access granted · available now")).toHaveCount(4);
  for (const name of [
    "Open meal planner",
    "Open training planner",
    "Open Weekly Autopilot",
    "Open visual progress tools",
  ]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Request Lifestyle coach access", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  assertNoPageErrors();
});

test("a Premium tester can build the adaptive meal plan inside the Fuel tab", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/nutrition");
  await page.getByRole("link", { name: /Open meal planner/i }).click();
  await expect(page).toHaveURL(/\/nutrition\/meal-plan$/);
  await expect(page.getByRole("heading", { level: 1, name: "Adaptive meal plan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const planResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/generateAdaptiveMealPlan")
  );
  await page.getByRole("button", { name: "Build this week" }).click();
  const response = await planResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 2, name: "Why this week looks this way" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your seven-day plan" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Grocery list" })).toBeVisible();
  await expect(page.getByText("42 oz chicken breast")).toBeVisible();

  assertNoPageErrors();
});

test("a Premium tester can build a training block inside the Train tab", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/training");
  await page.getByRole("link", { name: /Open training planner/i }).click();
  await expect(page).toHaveURL(/\/training\/plan$/);
  await expect(page.getByRole("heading", { level: 1, name: "Adaptive training block" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const blockResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/generateAdaptiveTrainingBlock")
  );
  await page.getByRole("button", { name: "Build training block" }).click();
  const response = await blockResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 2, name: "Why this block starts here" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Weekly schedule" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Week-by-week progression" })).toBeVisible();
  await expect(page.getByText("Week 5 · Deload")).toBeVisible();

  assertNoPageErrors();
});

test("a Premium tester can run Weekly Autopilot inside the Today tab", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");
  await page.getByRole("link", { name: /Weekly Autopilot/i }).click();
  await expect(page).toHaveURL(/\/today\/autopilot$/);
  await expect(page.getByRole("heading", { level: 1, name: "Weekly Autopilot" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  const reviewResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/generateWeeklyAutopilot")
  );
  await page.getByRole("button", { name: "Run weekly review" }).click();
  const response = await reviewResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 2, name: "Hold the plan steady" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Weekly scorecard" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "How the adaptive tools respond" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Weight trend" })).toBeVisible();

  assertNoPageErrors();
});

test("a Premium tester can open the on-device Visual Progress Check inside the Progress tab", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/progress");
  await page.getByRole("link", { name: /Open visual check/i }).click();
  await expect(page).toHaveURL(/\/progress\/visual-check$/);
  await expect(page.getByRole("heading", { level: 1, name: "Visual Progress Check" })).toBeVisible();
  await expect(page.getByText("No uploads, no AI analysis, and no body-fat or medical estimate.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Add two progress photos" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  assertNoPageErrors();
});

test("Progress share uses an accessible modal and restores focus when closed", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/progress");

  const shareTrigger = page.getByRole("button", { name: "Share", exact: true });
  await shareTrigger.click();

  const shareDialog = page.getByRole("dialog", { name: "Share weekly progress" });
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog.getByText("RecompOne", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(shareDialog).toBeHidden();
  await expect(shareTrigger).toBeFocused();

  assertNoPageErrors();
});

test("a Premium tester sees the deploy-enabled AI body-composition range in Progress", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfN8AAAAASUVORK5CYII=",
    "base64"
  );
  const uploadResponses = [];
  page.on("response", (response) => {
    if (response.url().includes("/integration-endpoints/Core/UploadPrivateFile")) {
      uploadResponses.push(response);
    }
  });

  await page.goto("/progress");
  await expect(page.getByRole("heading", { level: 2, name: "AI body-composition range" })).toBeVisible();
  await expect(page.getByText(/cannot currently request immediate deletion/i)).toBeVisible();

  const photoInputs = page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]');
  await expect(photoInputs).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await photoInputs.nth(index).setInputFiles({
      name: `pose-${index}.png`,
      mimeType: "image/png",
      buffer: tinyPng
    });
  }

  const analyzeResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/analyzeBodyComposition")
  );
  await page.getByRole("button", { name: "Estimate a range" }).click();
  const response = await analyzeResponse;
  expect(response.request().method()).toBe("POST");
  expect(response.status()).toBe(200);
  // The mock echoes each uploaded filename, so this asserts the pose -> file
  // association rather than the order three concurrent uploads happened to land
  // in. pose-0 went into the front slot, pose-1 into side, pose-2 into back.
  expect(response.request().postDataJSON()).toEqual({
    photoRefs: {
      front: "private/user-test/pose-0.png",
      side: "private/user-test/pose-1.png",
      back: "private/user-test/pose-2.png"
    }
  });
  expect(uploadResponses).toHaveLength(3);
  await expect(page.getByText("18–22%")).toBeVisible();
  await expect(page.getByText("141.2–148.4 lb")).toBeVisible();
  await expect(page.getByText(/three views support a broad visual estimate/i)).toBeVisible();

  assertNoPageErrors();
});
