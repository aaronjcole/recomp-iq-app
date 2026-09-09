// Detects whether the current Base44 native wrapper exposes a StoreKit
// in-app-purchase bridge. The standard Base44 wrapper (wixMobileNativeBridge)
// provides navigation and device APIs but does NOT expose StoreKit purchase
// or transaction methods. This check enables the paywall to enable purchase
// and restore controls only when a real native IAP bridge is present.
//
// When the app is wrapped with Expo + react-native-iap (see
// docs/apple-premium-launch.md), the native shell injects a bridge that
// exposes requestPurchase and restorePurchases.

/**
 * @param {(Window & { wixMobileNativeBridge?: any }) | null} [browserWindow]
 */
export function hasNativeIapBridge(
  browserWindow = typeof window === "undefined" ? null : window
) {
  if (!browserWindow) return false;
  const bridge = browserWindow.wixMobileNativeBridge;
  if (!bridge || typeof bridge !== "object") return false;
  return (
    typeof bridge.requestPurchase === "function" ||
    typeof bridge.restorePurchases === "function"
  );
}