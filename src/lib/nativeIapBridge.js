// Detects whether the current Base44 native wrapper exposes a StoreKit
// in-app-purchase bridge. The standard Base44 wrapper (wixMobileNativeBridge)
// provides navigation and device APIs but does NOT expose StoreKit purchase
// or transaction methods. This check enables the paywall to enable purchase
// and restore controls only when a real native IAP bridge is present.
//
// When the app is wrapped with Expo + react-native-iap (see
// docs/apple-premium-launch.md), the native shell injects a bridge that
// exposes requestPurchase, restorePurchases, and finishTransaction.

/**
 * @typedef {{ transactionId: string, productId: string }} NativePurchase
 */

/**
 * @typedef {{
 *   requestPurchase: (productId: string, appAccountToken: string) => Promise<NativePurchase>,
 *   restorePurchases: () => Promise<{ purchases: NativePurchase[] }>,
 *   finishTransaction: (transactionId: string) => Promise<{ finished: true }>
 * }} NativeIapBridge
 */

/**
 * @param {(Window & { wixMobileNativeBridge?: any }) | null} [browserWindow]
 * @returns {NativeIapBridge | null}
 */
export function getNativeIapBridge(
  browserWindow = typeof window === "undefined" ? null : window
) {
  if (!browserWindow) return null;
  const bridge = browserWindow.wixMobileNativeBridge;
  if (!bridge || typeof bridge !== "object") return null;
  const complete = (
    typeof bridge.requestPurchase === "function" &&
    typeof bridge.restorePurchases === "function" &&
    typeof bridge.finishTransaction === "function"
  );
  return complete ? bridge : null;
}

/**
 * @param {(Window & { wixMobileNativeBridge?: any }) | null} [browserWindow]
 */
export function hasNativeIapBridge(
  browserWindow = typeof window === "undefined" ? null : window
) {
  return getNativeIapBridge(browserWindow) !== null;
}
