import { test, expect } from "@playwright/test";
import {
  installUnauthenticatedBase44,
  watchPageErrors,
} from "./support/base44.js";

test.beforeEach(async ({ page }) => {
  await installUnauthenticatedBase44(page);
});

test("landing page exposes the core public navigation", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/");

  await expect(page).toHaveTitle("RecompIQ — Adaptive Recomposition");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toHaveAttribute(
    "href",
    "#app-content",
  );
  const appContent = page.locator("#app-content");
  await expect(appContent).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await skipLink.click();
  await expect(appContent).toBeFocused();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Train and eat for the body you're actually building.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  assertNoPageErrors();
});

test("privacy, terms, support, and deletion pages are reachable without an account", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What we collect" })).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health disclaimer" })).toBeVisible();

  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: "RecompIQ Support" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Email recompappsupport@gmail.com/ })).toBeVisible();

  await page.goto("/delete-account");
  await expect(page.getByRole("heading", { level: 1, name: "Delete your RecompIQ account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request deletion by email" })).toHaveAttribute(
    "href",
    /^mailto:recompappsupport@gmail\.com/
  );
  assertNoPageErrors();
});

test("authentication entry points render and link together", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/login");
  await expect(page).toHaveTitle("Sign In | RecompIQ");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Sign in to your RecompIQ account.",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page).toHaveTitle("Create Account | RecompIQ");
  await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();

  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("valid-looking-password");
  await page.getByLabel("Confirm Password").fill("different-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  assertNoPageErrors();
});

test("unauthenticated protected deep links return to login", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/today");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  assertNoPageErrors();
});
