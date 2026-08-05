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

  await page.goto("/coming-soon");

  await expect(page).toHaveTitle("RecompOne: Adaptive Body Recomposition");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://fitnesstrackerapps.com/"
  );
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
      name: "Know when to hold, adjust, or push your body recomposition plan.",
    }),
  ).toBeVisible();
  // The marketing page deliberately exposes no beta sign-in: testers are given
  // the /hero link directly or added to the app. /hero stays reachable on its
  // own, which the "beta gateway remains accessible" test covers.
  await expect(page.getByRole("banner").getByRole("link", { name: /beta tester sign in/i })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("link", { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium plans that adapt with you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adaptive meal planning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adaptive training blocks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly Autopilot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visual progress tools" })).toBeVisible();
  await expect(page.getByText("Premium features are available to approved testers during beta.")).toBeVisible();
  assertNoPageErrors();
});

test("coming-soon page explains the decision system and exposes the Android beta CTA", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/coming-soon?utm_source=playwright");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Know when to hold, adjust, or push your body recomposition plan."
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the Android beta" })).toBeVisible();
  await expect(page.getByText("Hold targets steady")).toBeVisible();

  await page.getByRole("link", { name: "See how RecompOne decides" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "A feedback loop, not another dashboard." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Act on one best move" })).toBeVisible();
  await expect(page.getByText("No advertising cookies or cross-site tracking.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium plans that adapt with you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adaptive meal planning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adaptive training blocks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly Autopilot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visual progress tools" })).toBeVisible();
  await expect(page.getByText("Premium features are available to approved testers during beta.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Join the Android beta" })).toHaveAttribute(
    "href",
    "#waitlist-email"
  );
  assertNoPageErrors();
});

test("unauthenticated root visit lands on the marketing page", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/coming-soon/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://fitnesstrackerapps.com/"
  );
  assertNoPageErrors();
});

test("beta gateway remains accessible but stays out of search", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/hero");

  await expect(page).toHaveTitle("Beta Access | RecompOne");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://fitnesstrackerapps.com/hero"
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Train and eat for the body you're actually building."
    })
  ).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login"
  );
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
  await expect(page.getByRole("heading", { level: 1, name: "RecompOne Support" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Email recompappsupport@gmail.com/ })).toBeVisible();

  await page.goto("/delete-account");
  await expect(page.getByRole("heading", { level: 1, name: "Delete your RecompOne account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request deletion by email" })).toHaveAttribute(
    "href",
    /^mailto:recompappsupport@gmail\.com/
  );
  assertNoPageErrors();
});

test("authentication entry points render and link together", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto("/login");
  await expect(page).toHaveTitle("Sign In | RecompOne");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Sign in to your RecompOne account.",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.getByRole("link", { name: "Create one" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page).toHaveTitle("Create Account | RecompOne");
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
