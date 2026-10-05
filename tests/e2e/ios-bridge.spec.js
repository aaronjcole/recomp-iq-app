import { test, expect } from "@playwright/test";
import { buildInjectedBridgeScript } from "../../expo-ios/src/injectedBridge.ts";

// Runs the iOS shell's injected bridge in a real browser with a native side
// that never answers: every request must reject after its timeout instead of
// leaving the paywall waiting forever.
test("the injected iOS bridge rejects requests the shell never answers", async ({ page }) => {
  await page.setContent("<!doctype html><title>bridge</title>");
  await page.evaluate(() => {
    window.__posted = [];
    window.ReactNativeWebView = { postMessage: (message) => window.__posted.push(JSON.parse(message)) };
  });
  await page.evaluate(buildInjectedBridgeScript({ requestPurchase: 400, default: 150 }));

  const outcome = await page.evaluate(async () => {
    const bridge = window.wixMobileNativeBridge;
    const settle = (promise) => promise.then(() => "resolved", (error) => `rejected: ${error.message}`);
    const started = Date.now();
    const [products, purchase] = await Promise.all([
      settle(bridge.getProducts()),
      settle(bridge.requestPurchase("recompone_premium_annual", "00000000-0000-4000-8000-000000000000"))
    ]);
    return { products, purchase, elapsed: Date.now() - started, posted: window.__posted.map((m) => m.action) };
  });

  expect(outcome.products).toMatch(/^rejected: The App Store did not respond/);
  expect(outcome.purchase).toMatch(/^rejected: The App Store did not respond/);
  expect(outcome.elapsed).toBeGreaterThanOrEqual(390);
  expect(outcome.posted).toEqual(["getProducts", "requestPurchase"]);
});

test("a request the shell answers in time resolves with its result", async ({ page }) => {
  await page.setContent("<!doctype html><title>bridge</title>");
  await page.evaluate(() => {
    window.ReactNativeWebView = {
      postMessage: (raw) => {
        const message = JSON.parse(raw);
        if (message.action !== "restorePurchases") return;
        setTimeout(() => window.dispatchEvent(new CustomEvent("recompone:iap-response", {
          detail: { source: message.source, version: message.version, requestId: message.requestId, ok: true, result: { purchases: [] } }
        })), 20);
      }
    };
  });
  await page.evaluate(buildInjectedBridgeScript({ requestPurchase: 400, default: 150 }));
  const restored = await page.evaluate(() => window.wixMobileNativeBridge.restorePurchases());
  expect(restored).toEqual({ purchases: [] });
});
