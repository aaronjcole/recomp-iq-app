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

test("in the iOS app the paywall carries the App Store subscription terms and links (guideline 3.1.2)", async ({ page }) => {
  await installNativeBridge(page);
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/more/premium");
  await expect(page.getByText("Lifestyle Coach", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lifestyle coach", exact: true })).toHaveCount(0);

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

test("an older iOS build without getProducts cannot buy reference prices", async ({ page }) => {
  await installNativeBridge(page);
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  await page.goto("/more/premium");
  await expect(page.getByRole("button", { name: "Subscribe Monthly" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry prices" })).toBeVisible();
  await expect(page.getByLabel("Premium plans")).not.toContainText("free trial");
});

test("compact plan cards keep pricing separate from shared renewal copy on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installNativeBridge(page, { products: [
    { productId: "recompone_premium_monthly", displayPrice: "$4.99", period: { unit: "month", count: 1 }, freeTrial: null },
    { productId: "recompone_premium_annual", displayPrice: "$39.99", period: { unit: "year", count: 1 }, freeTrial: null }
  ] });
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  await page.goto("/more/premium");
  const plans = page.getByLabel("Premium plans");
  await expect(plans).not.toContainText("Renews automatically");
  await expect(plans).not.toContainText("before you pay");
  for (const [name, price, period] of [["Monthly", "$4.99", "/month"], ["Annual", "$39.99", "/year"]]) {
    const card = page.getByLabel(`${name} plan`, { exact: true });
    await expect(card.getByText(price, { exact: true })).toBeVisible();
    await expect(card.getByText(period, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: `Subscribe ${name}` })).toBeEnabled();
    const titleBox = await card.getByText(name, { exact: true }).boundingBox();
    const priceBox = await card.getByText(price, { exact: true }).boundingBox();
    expect(titleBox.x + titleBox.width <= priceBox.x || titleBox.y + titleBox.height <= priceBox.y).toBe(true);
  }
  await expect(page.getByLabel("Subscription terms")).not.toContainText("reference prices in USD");
  await expect(page.getByRole("button", { name: "Restore Purchases", exact: true })).toBeVisible();
  await page.getByLabel("Monthly plan", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/recompone-compact-pricing.png" });
});

test("a dropped price request times out once, ignores late results and recovers with Retry", async ({ page }) => {
  await installNativeBridge(page);
  await page.addInitScript(() => {
    window.wixMobileNativeBridge.getProducts = () => new Promise((resolve) => { window.resolveOldPrices = resolve; });
  });
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  await page.clock.install();
  await page.goto("/more/premium");
  await expect(page.getByText("Loading the App Store price…")).toHaveCount(2);
  await page.clock.fastForward(12001);
  await expect(page.getByRole("button", { name: "Retry prices" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe Monthly" })).toBeDisabled();
  await page.evaluate(() => {
    window.resolveOldPrices({ products: [{ productId: "recompone_premium_monthly", displayPrice: "STALE" }] });
    window.wixMobileNativeBridge.getProducts = () => Promise.resolve({ products: [
      { productId: "recompone_premium_monthly", displayPrice: "$4.99", period: { unit: "month", count: 1 }, freeTrial: null }
    ] });
  });
  await expect(page.getByText("STALE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry prices" }).click();
  await expect(page.getByRole("button", { name: "Subscribe Monthly" })).toBeEnabled();
  await expect(page.getByText("$4.99", { exact: true })).toBeVisible();
});

test("a bridge injected after mounting still loads prices", async ({ page }) => {
  await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
  await page.goto("/more/premium");
  await expect(page.getByRole("heading", { name: "RecompOne Premium" })).toBeVisible();
  await page.evaluate(() => {
    window.wixMobileNativeBridge = {
      requestPurchase: async () => {}, restorePurchases: async () => {}, finishTransaction: async () => {},
      getProducts: async () => ({ products: [{ productId: "recompone_premium_annual", displayPrice: "$39.99", period: { unit: "year", count: 1 }, freeTrial: null }] })
    };
    window.dispatchEvent(new Event("recompone:iap-ready"));
  });
  await expect(page.getByRole("button", { name: "Subscribe Annual" })).toBeEnabled();
});

// The local e2e build sets no VITE_APP_STORE_URL, i.e. no published iOS app.
for (const { name, setup } of [
  { name: "a web browser", setup: async () => {} },
  {
    // The Base44 Android wrapper injects its bridge object without StoreKit.
    name: "the Android store wrapper",
    setup: (page) => page.addInitScript(() => { window.wixMobileNativeBridge = {}; })
  }
]) {
  test(`in ${name} without a published iOS app the paywall does not point to one`, async ({ page }) => {
    await setup(page);
    await installAuthenticatedBase44(page, { premiumAccess: NO_ACCESS });
    const assertNoPageErrors = watchPageErrors(page);
    await page.goto("/more/premium");

    const plans = page.getByLabel("Premium plans");
    await expect(plans.getByRole("button", { name: "Coming soon", exact: true })).toHaveCount(2);
    for (const button of await plans.getByRole("button").all()) await expect(button).toBeDisabled();
    // No store is named and no trial promised anywhere on the paywall.
    await expect(page.getByText(/iOS app|App Store|Apple|free trial/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Restore Purchases/ })).toHaveCount(0);
    await expect(page.getByText("Premium subscriptions aren't available here yet.", { exact: true })).toBeVisible();
    // No Apple billing terms for a purchase that cannot happen here, but the
    // legal links stay reachable.
    await expect(page.getByLabel("Subscription terms")).toHaveCount(0);
    await expect(page.getByText(/Apple ID|renews automatically/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Terms of Use", exact: true })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute("href", "/privacy");
    assertNoPageErrors();
  });
}
