import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";

const NO_ACCESS = {
  hasAnyAccess: false,
  hasBundleAccess: false,
  testerAccess: false,
  releaseFlags: {},
  features: {},
  products: [],
  sources: []
};

// A stand-in for the iOS shell's injected bridge (expo-ios/src/injectedBridge.ts).
async function installNativeBridge(page, { products } = {}) {
  await page.addInitScript((storeProducts) => {
    const bridge = {
      requestPurchase: () => Promise.reject(new Error("not in this test")),
      restorePurchases: () => Promise.resolve({ purchases: [] }),
      finishTransaction: () => Promise.resolve({ finished: true })
    };
    if (storeProducts) bridge.getProducts = () => Promise.resolve({ products: storeProducts });
    window.wixMobileNativeBridge = bridge;
  }, products ?? null);
}

test("the paywall carries the App Store subscription terms and links on every platform", async ({ page }) => {
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more/premium");

  const terms = page.getByLabel("Subscription terms");
  await expect(terms).toContainText("renews automatically");
  await expect(terms).toContainText("24 hours before the end of the current period");
  await expect(terms.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
  await expect(terms.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  assertNoPageErrors();
});

test("in the iOS app the paywall shows StoreKit's local price and the user's real trial", async ({ page }) => {
  await installNativeBridge(page, {
    products: [
      { productId: "recompone_premium_annual", displayPrice: "44,99 €", period: { unit: "year", count: 1 }, freeTrial: { unit: "week", count: 1 } },
      { productId: "recompone_premium_monthly", displayPrice: "5,49 €", period: { unit: "month", count: 1 }, freeTrial: null }
    ]
  });
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more/premium");

  const plans = page.getByLabel("Premium plans");
  await expect(plans.getByText("44,99 €", { exact: true })).toBeVisible();
  await expect(plans.getByText("5,49 €", { exact: true })).toBeVisible();
  await expect(plans.getByText("7-day free trial", { exact: true })).toBeVisible();
  await expect(plans).not.toContainText("$39.99");
  await expect(plans).not.toContainText("14-day");
  await expect(page.getByRole("button", { name: "Subscribe Annual" })).toBeEnabled();
  assertNoPageErrors();
});

test("an older iOS build without getProducts can still subscribe", async ({ page }) => {
  await installNativeBridge(page);
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  await page.goto("/more/premium");
  await expect(page.getByRole("button", { name: "Subscribe Monthly" })).toBeEnabled();
  await expect(page.getByLabel("Premium plans")).not.toContainText("free trial");
});
