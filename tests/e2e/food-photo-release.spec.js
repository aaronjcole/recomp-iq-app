import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { PREMIUM_TESTER_ACCESS } from "./support/fixtures.js";

// The Fuel tab offers food-photo estimates only when the backend Secret
// ENABLE_FOOD_PHOTO_SCAN is on (getPremiumAccess releaseFlags.foodPhotoScan)
// AND the account holds the food-photo feature. Either alone must not show a
// button that analyzeFoodPhoto / uploadAnalysisPhoto would refuse.
const access = ({ released, entitled }) => ({
  ...PREMIUM_TESTER_ACCESS,
  releaseFlags: { ...PREMIUM_TESTER_ACCESS.releaseFlags, foodPhotoScan: released },
  features: { ...PREMIUM_TESTER_ACCESS.features, food_photo: entitled }
});

for (const { released, entitled, visible } of [
  { released: true, entitled: true, visible: true },
  { released: false, entitled: true, visible: false },
  { released: true, entitled: false, visible: false }
]) {
  test(`Snap food is ${visible ? "offered" : "hidden"} when the release flag is ${released ? "on" : "off"} and the entitlement is ${entitled ? "held" : "missing"}`, async ({ page }) => {
    await installAuthenticatedBase44(page, { premiumAccess: access({ released, entitled }) });
    const assertNoPageErrors = watchPageErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // Hidden is also the state before access loads, so the hidden cases only
    // prove anything once getPremiumAccess has answered.
    const accessLoaded = page.waitForResponse((response) => response.url().includes("/functions/getPremiumAccess"));
    await page.goto("/nutrition");
    await accessLoaded;

    // The barcode button shares the Scan food card, so it proves the card rendered.
    await expect(page.getByRole("button", { name: "Barcode", exact: true }).first()).toBeVisible();
    const snap = page.getByRole("button", { name: "Snap food", exact: true });
    if (visible) {
      await expect(snap).toHaveCount(1);
    } else {
      // Give the resolved access a chance to render before asserting absence.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await expect(snap).toHaveCount(0);
    }
    if (visible) {
      // The overlay is gated on the same release flag, so the scanner opens.
      await snap.click();
      const scanner = page.getByRole("dialog", { name: "Snap food" });
      await expect(scanner).toBeVisible();
      await expect(scanner.locator('input[type="file"]')).toHaveCount(1);
    }
    assertNoPageErrors();
  });
}
