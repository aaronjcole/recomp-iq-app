export const BRIDGE_SOURCE = "recompone-native-iap" as const;
export const BRIDGE_VERSION = 1 as const;

export const APP_ORIGIN = "https://recomp-iq.base44.app";

export const APPLE_PRODUCT_IDS = [
  "recompone_premium_monthly",
  "recompone_premium_annual"
] as const;

export type AppleProductId = (typeof APPLE_PRODUCT_IDS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BridgeRequest =
  | {
      source: typeof BRIDGE_SOURCE;
      version: typeof BRIDGE_VERSION;
      requestId: string;
      action: "requestPurchase";
      productId: AppleProductId;
      appAccountToken: string;
    }
  | {
      source: typeof BRIDGE_SOURCE;
      version: typeof BRIDGE_VERSION;
      requestId: string;
      action: "restorePurchases";
    }
  | {
      source: typeof BRIDGE_SOURCE;
      version: typeof BRIDGE_VERSION;
      requestId: string;
      action: "finishTransaction";
      transactionId: string;
    }
  | {
      source: typeof BRIDGE_SOURCE;
      version: typeof BRIDGE_VERSION;
      requestId: string;
      action: "getProducts";
    };

export type SubscriptionPeriod = "day" | "week" | "month" | "year";

/**
 * What the paywall shows for a plan, straight from StoreKit: the localized
 * price string for the user's storefront, the billing period, and a free
 * trial only when the product has one and this Apple ID is still eligible.
 */
export type ProductInfo = {
  productId: AppleProductId;
  displayPrice: string;
  period: { unit: SubscriptionPeriod; count: number } | null;
  freeTrial: { unit: SubscriptionPeriod; count: number } | null;
};

export type PurchaseResult = {
  productId: AppleProductId;
  transactionId: string;
};

export type BridgeResponse = {
  source: typeof BRIDGE_SOURCE;
  version: typeof BRIDGE_VERSION;
  requestId: string;
  ok: boolean;
  result?: PurchaseResult | { purchases: PurchaseResult[] } | { finished: true } | { products: ProductInfo[] };
  error?: string;
};

export function isAppleProductId(value: unknown): value is AppleProductId {
  return typeof value === "string" && APPLE_PRODUCT_IDS.some((id) => id === value);
}

export function parseBridgeRequest(raw: string): BridgeRequest | null {
  try {
    const value = JSON.parse(raw) as Partial<BridgeRequest>;
    if (
      value.source !== BRIDGE_SOURCE ||
      value.version !== BRIDGE_VERSION ||
      typeof value.requestId !== "string" ||
      value.requestId.length < 1 ||
      value.requestId.length > 128
    ) {
      return null;
    }

    if (value.action === "restorePurchases" || value.action === "getProducts") return value as BridgeRequest;
    if (
      value.action === "requestPurchase" &&
      isAppleProductId((value as { productId?: unknown }).productId) &&
      typeof (value as { appAccountToken?: unknown }).appAccountToken === "string" &&
      UUID_PATTERN.test((value as { appAccountToken: string }).appAccountToken)
    ) {
      return value as BridgeRequest;
    }
    if (
      value.action === "finishTransaction" &&
      typeof (value as { transactionId?: unknown }).transactionId === "string" &&
      (value as { transactionId: string }).transactionId.length <= 128
    ) {
      return value as BridgeRequest;
    }
  } catch {
    return null;
  }

  return null;
}

export function isTrustedAppUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

const PERIOD_UNITS: readonly SubscriptionPeriod[] = ["day", "week", "month", "year"];

function period(unit: unknown, count: unknown): { unit: SubscriptionPeriod; count: number } | null {
  if (typeof unit !== "string" || !PERIOD_UNITS.includes(unit as SubscriptionPeriod)) return null;
  const number = Number(count ?? 1);
  if (!Number.isInteger(number) || number < 1 || number > 365) return null;
  return { unit: unit as SubscriptionPeriod, count: number };
}

/**
 * Maps a react-native-iap iOS subscription product to the paywall's view of
 * it. `trialEligible` is StoreKit's isEligibleForIntroOffer for the product's
 * subscription group; a trial is only reported when it is true.
 */
export function toProductInfo(product: unknown, trialEligible: boolean | null): ProductInfo | null {
  if (!product || typeof product !== "object") return null;
  const value = product as Record<string, unknown>;
  if (!isAppleProductId(value.id)) return null;
  const displayPrice = typeof value.displayPrice === "string" ? value.displayPrice.trim() : "";
  if (!displayPrice || displayPrice.length > 40) return null;
  const hasFreeTrial = value.introductoryPricePaymentModeIOS === "free-trial";
  return {
    productId: value.id,
    displayPrice,
    period: period(value.subscriptionPeriodUnitIOS, value.subscriptionPeriodNumberIOS),
    freeTrial: hasFreeTrial && trialEligible === true
      ? period(value.introductoryPriceSubscriptionPeriodIOS, value.introductoryPriceNumberOfPeriodsIOS)
      : null
  };
}
