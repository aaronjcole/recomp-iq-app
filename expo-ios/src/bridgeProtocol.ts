export const BRIDGE_SOURCE = "recompone-native-iap" as const;
export const BRIDGE_VERSION = 1 as const;

export const APP_ORIGIN = "https://recomp-iq.base44.app";

export const APPLE_PRODUCT_IDS = [
  "recompone_premium_monthly",
  "recompone_premium_annual"
] as const;

export type AppleProductId = (typeof APPLE_PRODUCT_IDS)[number];

export type BridgeRequest =
  | {
      source: typeof BRIDGE_SOURCE;
      version: typeof BRIDGE_VERSION;
      requestId: string;
      action: "requestPurchase";
      productId: AppleProductId;
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
  result?: PurchaseResult | { purchases: PurchaseResult[] } | { finished: true };
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

    if (value.action === "restorePurchases") return value as BridgeRequest;
    if (
      value.action === "requestPurchase" &&
      isAppleProductId((value as { productId?: unknown }).productId)
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
