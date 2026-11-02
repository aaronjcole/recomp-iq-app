import { test, expect } from "@playwright/test";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload-for-tests.signature";

// The iOS shell runs provider sign-in in ASWebAuthenticationSession; Base44
// returns to this static page, which hands the token to recompone://auth.
test("the native sign-in return page forwards the token to the app and drops it from the URL", async ({ page }) => {
  await page.goto(`/auth/native-return.html?next=${encodeURIComponent("/today")}&access_token=${TOKEN}`, { waitUntil: "commit" });

  const link = page.getByRole("link", { name: "Return to the app" });
  await expect(link).toHaveAttribute("href", /access_token=/);
  const href = new URL(await link.getAttribute("href"));
  expect(`${href.protocol}//${href.host}`).toBe("recompone://auth");
  expect(href.searchParams.get("access_token")).toBe(TOKEN);
  expect(href.searchParams.get("next")).toBe("/today");
  expect(page.url()).not.toContain("access_token");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("the native sign-in return page reports a missing token instead of forwarding nothing", async ({ page }) => {
  await page.goto("/auth/native-return.html?next=%2Ftoday", { waitUntil: "commit" });
  await expect(page.getByText("Sign-in did not finish.")).toBeVisible();
  const href = new URL(await page.getByRole("link", { name: "Return to the app" }).getAttribute("href"));
  expect(href.searchParams.get("error")).toBe("missing_token");
  expect(href.searchParams.get("access_token")).toBeNull();
});
