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
  await page.getByRole("button", { name: /Log today/i }).first().click();

  // QuickLogSheet is the one logging surface after the redesign.
  await expect(page.getByText("Add the signals you have. Empty fields stay unlogged.")).toBeVisible();
  await expect(page.getByText("Weight (lb)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save today's log/i })).toBeVisible();
  assertNoPageErrors();
});
