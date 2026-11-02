import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { PREMIUM_TESTER_ACCESS } from "./support/fixtures.js";

// Progress offers the AI body-composition range only when the backend Secret
// ENABLE_BODY_COMPOSITION_SCAN is on (getPremiumAccess
// releaseFlags.bodyCompositionScan) AND the account holds visual progress.
// Either alone must not show a scan analyzeBodyComposition would refuse.
const access = ({ released, entitled }) => ({
  ...PREMIUM_TESTER_ACCESS,
  releaseFlags: { ...PREMIUM_TESTER_ACCESS.releaseFlags, bodyCompositionScan: released },
  features: { ...PREMIUM_TESTER_ACCESS.features, visual_progress: entitled }
});

for (const { released, entitled, visible } of [
  { released: true, entitled: true, visible: true },
  { released: false, entitled: true, visible: false },
  { released: true, entitled: false, visible: false }
]) {
  test(`the body-composition range is ${visible ? "offered" : "hidden"} when the release flag is ${released ? "on" : "off"} and visual progress is ${entitled ? "held" : "missing"}`, async ({ page }) => {
    await installAuthenticatedBase44(page, { premiumAccess: access({ released, entitled }) });
    const assertNoPageErrors = watchPageErrors(page);
    const scanChunkRequests = [];
    page.on("request", (request) => {
      if (/BodyCompositionScan/.test(request.url())) scanChunkRequests.push(request.url());
    });
    // Hidden is also the state before access loads, so the hidden cases only
    // prove anything once getPremiumAccess has answered.
    const accessLoaded = page.waitForResponse((response) => response.url().includes("/functions/getPremiumAccess"));
    await page.goto("/progress");
    await accessLoaded;
    await page.getByRole("tab", { name: "Photos" }).click();
    await expect(page.getByRole("tabpanel", { name: "Photos" })).toBeVisible();

    const scan = page.getByRole("heading", { level: 2, name: "AI body-composition range" });
    if (visible) {
      await expect(scan).toBeVisible();
    } else {
      // BodyCompositionScan is lazy: its chunk is requested the moment the gate
      // renders it, before the heading mounts. No request at all is the
      // deterministic proof that the gate stayed closed.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      expect(scanChunkRequests, "BodyCompositionScan must not even be requested").toEqual([]);
      await expect(scan).toHaveCount(0);
    }

    // The Premium catalog promises the AI range only while it is released.
    await page.goto("/more/premium");
    const preview = page.getByRole("group", { name: "Visual progress tools preview" });
    await expect(preview.getByText("On-device", { exact: true })).toBeVisible();
    await expect(preview.getByText("AI-assisted range", { exact: true })).toHaveCount(released ? 1 : 0);
    assertNoPageErrors();
  });
}
