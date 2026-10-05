// What the paywall shows for each Premium plan. In the iOS app the price,
// billing period and free trial come from StoreKit (the bridge's getProducts),
// so the user sees their own storefront's currency and a trial only when their
// Apple ID is still eligible for it. Without StoreKit (the web app) the
// reference US prices are shown and a trial is described as conditional.

export const APPLE_PRODUCT_MONTHLY = "recompone_premium_monthly";
export const APPLE_PRODUCT_ANNUAL = "recompone_premium_annual";

const REFERENCE_PLANS = [
  { productId: APPLE_PRODUCT_MONTHLY, label: "Monthly", price: "$4.99", period: { unit: "month", count: 1 } },
  { productId: APPLE_PRODUCT_ANNUAL, label: "Annual", price: "$39.99", period: { unit: "year", count: 1 }, highlighted: true }
];

const UNIT_NAMES = { day: "day", week: "week", month: "month", year: "year" };

function durationLabel({ unit, count }) {
  const name = UNIT_NAMES[unit] ?? unit;
  if (unit === "week" && count === 2) return "2-week";
  return count === 1 ? `1-${name}` : `${count}-${name}`;
}

function periodLabel(period) {
  if (!period) return "";
  const name = UNIT_NAMES[period.unit] ?? period.unit;
  return period.count === 1 ? `/${name}` : `/${period.count} ${name}s`;
}

function trialLabel({ unit, count }) {
  if (unit === "day") return `${count}-day`;
  if (unit === "week") return `${count * 7}-day`;
  return durationLabel({ unit, count });
}

/**
 * @param {{ storeKit: boolean, products?: Array<{ productId: string, displayPrice: string, period: object|null, freeTrial: object|null }> | null, legacyBridge?: boolean }} input
 *   storeKit: the native bridge is present. products: getProducts' result, or
 *   null while it is loading. legacyBridge: an older iOS build whose bridge
 *   has no getProducts; its plans stay purchasable at the reference prices.
 */
export function premiumPlans({ storeKit, products = null, legacyBridge = false }) {
  return REFERENCE_PLANS.map((reference) => {
    if (storeKit && legacyBridge) {
      return {
        ...reference,
        priceLabel: reference.price,
        periodLabel: periodLabel(reference.period),
        description: "Renews automatically; cancel anytime. The App Store confirms your local price before you pay.",
        badge: null,
        purchasable: true
      };
    }
    if (!storeKit) {
      return {
        ...reference,
        priceLabel: reference.price,
        periodLabel: periodLabel(reference.period),
        description: reference.productId === APPLE_PRODUCT_ANNUAL
          ? "Free trial for eligible new subscribers. Prices in USD; the App Store shows your local price."
          : "Prices in USD; the App Store shows your local price.",
        badge: null,
        purchasable: false
      };
    }
    if (products === null) {
      return { ...reference, priceLabel: "…", periodLabel: "", description: "Loading the App Store price…", badge: null, purchasable: false };
    }
    const product = products.find((item) => item?.productId === reference.productId);
    if (!product) {
      return { ...reference, priceLabel: "—", periodLabel: "", description: "This plan is unavailable in your App Store right now.", badge: null, purchasable: false };
    }
    const period = product.period ?? reference.period;
    const renews = `${product.displayPrice}${periodLabel(period)}`;
    const trial = product.freeTrial ? `${trialLabel(product.freeTrial)} free trial` : null;
    return {
      ...reference,
      priceLabel: product.displayPrice,
      periodLabel: periodLabel(period),
      description: trial
        ? `${trial}, then ${renews}. Renews automatically; cancel anytime.`
        : `${renews}, renews automatically. Cancel anytime.`,
      badge: trial,
      purchasable: true
    };
  });
}
