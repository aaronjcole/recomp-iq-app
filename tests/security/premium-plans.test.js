import test from "node:test";
import assert from "node:assert/strict";
import { premiumPlans, APPLE_PRODUCT_ANNUAL, APPLE_PRODUCT_MONTHLY } from "../../src/lib/premiumPlans.js";
import { toProductInfo, parseBridgeRequest } from "../../expo-ios/src/bridgeProtocol.ts";

const storeAnnual = {
  id: APPLE_PRODUCT_ANNUAL,
  displayPrice: "44,99 €",
  subscriptionPeriodUnitIOS: "year",
  subscriptionPeriodNumberIOS: "1",
  introductoryPricePaymentModeIOS: "free-trial",
  introductoryPriceSubscriptionPeriodIOS: "week",
  introductoryPriceNumberOfPeriodsIOS: "2"
};
const storeMonthly = {
  id: APPLE_PRODUCT_MONTHLY,
  displayPrice: "5,49 €",
  subscriptionPeriodUnitIOS: "month",
  subscriptionPeriodNumberIOS: "1",
  introductoryPricePaymentModeIOS: "empty"
};

test("StoreKit products map to the storefront price and an eligible trial only", () => {
  const eligible = toProductInfo(storeAnnual, true);
  assert.deepEqual(eligible, {
    productId: APPLE_PRODUCT_ANNUAL,
    displayPrice: "44,99 €",
    period: { unit: "year", count: 1 },
    freeTrial: { unit: "week", count: 2 }
  });
  assert.equal(toProductInfo(storeAnnual, false).freeTrial, null, "an Apple ID that already used the trial sees none");
  assert.equal(toProductInfo(storeAnnual, null).freeTrial, null, "an unknown eligibility promises no trial");
  assert.equal(toProductInfo(storeMonthly, true).freeTrial, null);
  assert.equal(toProductInfo({ ...storeMonthly, id: "something_else" }, true), null);
  assert.equal(toProductInfo({ ...storeMonthly, displayPrice: "" }, true), null);
});

test("the bridge accepts getProducts requests", () => {
  const request = parseBridgeRequest(JSON.stringify({
    source: "recompone-native-iap", version: 1, requestId: "r1", action: "getProducts"
  }));
  assert.equal(request?.action, "getProducts");
});

test("in the iOS app the paywall shows StoreKit's price and trial, not hardcoded ones", () => {
  const plans = premiumPlans({
    storeKit: true,
    products: [toProductInfo(storeAnnual, true), toProductInfo(storeMonthly, true)]
  });
  const annual = plans.find((plan) => plan.productId === APPLE_PRODUCT_ANNUAL);
  const monthly = plans.find((plan) => plan.productId === APPLE_PRODUCT_MONTHLY);
  assert.equal(annual.priceLabel, "44,99 €");
  assert.equal(annual.periodLabel, "/year");
  assert.equal(annual.badge, "14-day free trial");
  assert.match(annual.description, /^14-day free trial, then 44,99 €\/year\. Renews automatically/);
  assert.equal(monthly.badge, null);
  assert.ok(plans.every((plan) => plan.purchasable));
  assert.ok(!JSON.stringify(plans.map(({ priceLabel, description }) => [priceLabel, description])).includes("$"), "no hardcoded USD price is shown");
});

test("an ineligible Apple ID is not offered a trial", () => {
  const plans = premiumPlans({ storeKit: true, products: [toProductInfo(storeAnnual, false), toProductInfo(storeMonthly, false)] });
  const annual = plans.find((plan) => plan.productId === APPLE_PRODUCT_ANNUAL);
  assert.equal(annual.badge, null);
  assert.doesNotMatch(annual.description, /trial/i);
});

test("loading, missing products, web and older iOS builds", () => {
  assert.ok(premiumPlans({ storeKit: true, products: null }).every((plan) => !plan.purchasable && plan.priceLabel === "…"));
  const missing = premiumPlans({ storeKit: true, products: [toProductInfo(storeMonthly, true)] });
  assert.equal(missing.find((plan) => plan.productId === APPLE_PRODUCT_ANNUAL).purchasable, false);
  const web = premiumPlans({ storeKit: false });
  assert.ok(web.every((plan) => !plan.purchasable));
  assert.match(web.find((plan) => plan.productId === APPLE_PRODUCT_ANNUAL).description, /eligible new subscribers/);
  const legacy = premiumPlans({ storeKit: true, legacyBridge: true });
  assert.ok(legacy.every((plan) => plan.purchasable), "an older iOS build can still subscribe");
  assert.ok(legacy.every((plan) => plan.badge === null), "but no trial is promised without StoreKit's answer");
});
