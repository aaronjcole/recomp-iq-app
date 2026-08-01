import { expect } from "@playwright/test";

/**
 * Fulfil the single Base44 request made before public routes render. This keeps
 * local public-page smoke tests deterministic and credential-free; it does not
 * mock any authenticated entity or function calls.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function installUnauthenticatedBase44(page) {
  await page.route("**/api/apps/public/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "playwright-local",
        public_settings: {},
      }),
    });
  });

  // A few route transitions can defensively re-check the current user. Keep
  // those checks explicitly signed out instead of letting Vite proxy them to a
  // fake local Base44 origin.
  await page.route("**/api/apps/playwright-local/entities/User/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthenticated Playwright visitor" }),
    });
  });

  // Local smoke tests do not need analytics, and the placeholder API origin
  // intentionally points at Vite. Swallow batches so the dev proxy cannot
  // recursively send them back to itself.
  await page.route("**/api/apps/playwright-local/analytics/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
}

/**
 * Fail a smoke test if React or a browser script throws an uncaught error.
 * Call this before navigation and assert after the page has settled.
 *
 * @param {import('@playwright/test').Page} page
 */
export function watchPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  return () => expect(errors, "uncaught browser errors").toEqual([]);
}
