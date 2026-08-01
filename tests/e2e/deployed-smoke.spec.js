import { test, expect } from "@playwright/test";
import { watchPageErrors } from "./support/base44.js";

const deployedBaseURL = process.env.E2E_BASE_URL;
const testEmail = process.env.E2E_USER_EMAIL;
const testPassword = process.env.E2E_USER_PASSWORD;

test.describe("deployed Base44 smoke @deployed", () => {
  test.skip(!deployedBaseURL, "Set E2E_BASE_URL to a deployed Base44 app URL");

  test("public legal routes load through the real backend", async ({ page }) => {
    const assertNoPageErrors = watchPageErrors(page);

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
    assertNoPageErrors();
  });

  test("a signed-out user cannot open the app shell", async ({ page }) => {
    const assertNoPageErrors = watchPageErrors(page);

    await page.goto("/today");

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    assertNoPageErrors();
  });

  test("disposable test user can sign in @authenticated", async ({ page }) => {
    test.skip(
      !testEmail || !testPassword,
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for a disposable test user",
    );

    const assertNoPageErrors = watchPageErrors(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/(?:today|onboarding)\/?(?:\?.*)?$/, { timeout: 30_000 });
    assertNoPageErrors();
  });
});
