import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from "react-native";
import {
  endConnection,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  isEligibleForIntroOfferIOS,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase
} from "react-native-iap";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";

import {
  APP_ORIGIN,
  APPLE_PRODUCT_IDS,
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isAppleProductId,
  isTrustedAppUrl,
  parseBridgeRequest,
  requestIdOf,
  toProductInfo,
  type BridgeResponse,
  type ProductInfo,
  type PurchaseResult
} from "./bridgeProtocol";
import { buildInjectedBridgeScript, IAP_RESPONSE_EVENT } from "./injectedBridge";
import {
  isProviderLoginUrl,
  NATIVE_AUTH_CALLBACK,
  nativeLoginUrl,
  webViewUrlForCallback
} from "./nativeAuth";

type PendingPurchase = {
  requestId: string;
  productId: (typeof APPLE_PRODUCT_IDS)[number];
};

// After requestPurchase returns, how long to wait for StoreKit's transaction
// or error event before treating the purchase as deferred (Ask to Buy, a
// pending payment) and releasing it, so later purchases are not blocked.
const PURCHASE_EVENT_GRACE_MS = 30_000;
// Minimum gap between App Store connection retries.
const STORE_RETRY_INTERVAL_MS = 10_000;

const MAX_PENDING_TRANSACTIONS = 20;

function purchaseResult(purchase: Purchase): PurchaseResult | null {
  if (!isAppleProductId(purchase.productId)) return null;
  const transactionId = typeof purchase.id === "string" ? purchase.id.trim() : "";
  if (!transactionId || transactionId.length > 128) return null;
  return { productId: purchase.productId, transactionId };
}

function safeBridgeError(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === ErrorCode.UserCancelled) return "Purchase cancelled";
    if (error.code === ErrorCode.NetworkError) return "The App Store is temporarily unavailable";
    if (error.code === ErrorCode.ItemUnavailable) return "This subscription is unavailable";
  }
  return "The purchase could not be completed";
}

export function RecompOneWebView() {
  const webViewRef = useRef<WebView>(null);
  const currentUrlRef = useRef(APP_ORIGIN);
  const pendingPurchaseRef = useRef<PendingPurchase | null>(null);
  const transactionsRef = useRef(new Map<string, Purchase>());
  const [storeReady, setStoreReady] = useState(false);
  const productsRef = useRef<ProductInfo[]>([]);
  const connectStoreRef = useRef<(() => Promise<void>) | null>(null);
  const connectingRef = useRef(false);
  const lastConnectAttemptRef = useRef(0);
  const purchaseGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const injectedJavaScriptBeforeContentLoaded = useMemo(buildInjectedBridgeScript, []);

  const sendResponse = useCallback((response: BridgeResponse) => {
    const json = JSON.stringify(response).replace(/</g, "\\u003c");
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new CustomEvent(${JSON.stringify(IAP_RESPONSE_EVENT)}, {
        detail: ${json}
      }));
      true;
    `);
  }, []);

  const rememberPurchase = useCallback((purchase: Purchase) => {
    const result = purchaseResult(purchase);
    if (!result) return null;
    transactionsRef.current.set(result.transactionId, purchase);
    while (transactionsRef.current.size > MAX_PENDING_TRANSACTIONS) {
      const oldest = transactionsRef.current.keys().next().value;
      if (typeof oldest !== "string") break;
      transactionsRef.current.delete(oldest);
    }
    return result;
  }, []);

  useEffect(() => {
    let mounted = true;
    const purchaseUpdate = purchaseUpdatedListener((purchase) => {
      const result = rememberPurchase(purchase);
      const pending = pendingPurchaseRef.current;
      if (!pending) return;
      if (!result || result.productId !== pending.productId) {
        pendingPurchaseRef.current = null;
        sendResponse({
          source: BRIDGE_SOURCE,
          version: BRIDGE_VERSION,
          requestId: pending.requestId,
          ok: false,
          error: result
            ? "Another StoreKit transaction was recovered. Use Restore Purchases, then try again."
            : "StoreKit returned an unsupported transaction"
        });
        return;
      }
      pendingPurchaseRef.current = null;
      sendResponse({
        source: BRIDGE_SOURCE,
        version: BRIDGE_VERSION,
        requestId: pending.requestId,
        ok: true,
        result
      });
    });
    const purchaseError = purchaseErrorListener((error) => {
      const pending = pendingPurchaseRef.current;
      if (!pending) return;
      pendingPurchaseRef.current = null;
      sendResponse({
        source: BRIDGE_SOURCE,
        version: BRIDGE_VERSION,
        requestId: pending.requestId,
        ok: false,
        error: safeBridgeError(error)
      });
    });

    connectStoreRef.current = async () => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      lastConnectAttemptRef.current = Date.now();
      try {
        await initConnection();
        const products = (await fetchProducts({ skus: [...APPLE_PRODUCT_IDS], type: "subs" })) ?? [];
        // Trial eligibility is per Apple ID and subscription group; a failed
        // check reports no trial rather than promising one.
        const eligibility = new Map<string, boolean | null>();
        for (const product of products) {
          const groupId = (product as { subscriptionGroupIdIOS?: string | null }).subscriptionGroupIdIOS;
          if (!groupId || eligibility.has(groupId)) continue;
          eligibility.set(groupId, await isEligibleForIntroOfferIOS(groupId).catch(() => null));
        }
        productsRef.current = products
          .map((product) => toProductInfo(
            product,
            eligibility.get((product as { subscriptionGroupIdIOS?: string | null }).subscriptionGroupIdIOS ?? "") ?? null
          ))
          .filter((product): product is ProductInfo => product !== null);
        if (mounted) setStoreReady(true);
      } catch {
        if (mounted) setStoreReady(false);
      } finally {
        connectingRef.current = false;
      }
    };
    void connectStoreRef.current();

    return () => {
      mounted = false;
      clearTimeout(purchaseGraceTimerRef.current ?? undefined);
      purchaseUpdate.remove();
      purchaseError.remove();
      void endConnection();
    };
  }, [rememberPurchase, sendResponse]);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    // Never answer an off-origin page: the reply would be injected into it.
    // The web side's request timeout covers that case.
    if (!isTrustedAppUrl(event.nativeEvent.url || currentUrlRef.current)) return;
    const request = parseBridgeRequest(event.nativeEvent.data);
    if (!request) {
      const requestId = requestIdOf(event.nativeEvent.data);
      if (requestId) {
        sendResponse({
          source: BRIDGE_SOURCE,
          version: BRIDGE_VERSION,
          requestId,
          ok: false,
          error: "This request is not supported by this version of the app"
        });
      }
      return;
    }

    const fail = (error: string) => sendResponse({
      source: BRIDGE_SOURCE,
      version: BRIDGE_VERSION,
      requestId: request.requestId,
      ok: false,
      error
    });

    if (!storeReady) {
      // A failed first connection is never retried otherwise.
      if (Date.now() - lastConnectAttemptRef.current > STORE_RETRY_INTERVAL_MS) {
        void connectStoreRef.current?.();
      }
      fail("The App Store is still connecting. Try again in a moment.");
      return;
    }

    try {
      if (request.action === "getProducts") {
        sendResponse({
          source: BRIDGE_SOURCE,
          version: BRIDGE_VERSION,
          requestId: request.requestId,
          ok: true,
          result: { products: productsRef.current }
        });
        return;
      }
      if (request.action === "requestPurchase") {
        if (pendingPurchaseRef.current) {
          fail("Another purchase is already in progress");
          return;
        }
        pendingPurchaseRef.current = {
          requestId: request.requestId,
          productId: request.productId
        };
        await requestPurchase({
          request: {
            apple: {
              sku: request.productId,
              appAccountToken: request.appAccountToken
            }
          },
          type: "subs"
        });
        // The transaction normally arrives through purchaseUpdatedListener.
        // A deferred purchase (Ask to Buy, pending payment) sends no event;
        // release it so the web is answered and later purchases can start.
        const requestId = request.requestId;
        clearTimeout(purchaseGraceTimerRef.current ?? undefined);
        purchaseGraceTimerRef.current = setTimeout(() => {
          if (pendingPurchaseRef.current?.requestId !== requestId) return;
          pendingPurchaseRef.current = null;
          fail("Your purchase is waiting for approval. Once it is approved, use Restore Purchases.");
        }, PURCHASE_EVENT_GRACE_MS);
        return;
      }

      if (request.action === "restorePurchases") {
        const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
        const results = purchases
          .map(rememberPurchase)
          .filter((result): result is PurchaseResult => result !== null);
        sendResponse({
          source: BRIDGE_SOURCE,
          version: BRIDGE_VERSION,
          requestId: request.requestId,
          ok: true,
          result: { purchases: results }
        });
        return;
      }

      const purchase = transactionsRef.current.get(request.transactionId);
      if (!purchase) {
        fail("The StoreKit transaction is no longer available");
        return;
      }
      await finishTransaction({ purchase, isConsumable: false });
      transactionsRef.current.delete(request.transactionId);
      sendResponse({
        source: BRIDGE_SOURCE,
        version: BRIDGE_VERSION,
        requestId: request.requestId,
        ok: true,
        result: { finished: true }
      });
    } catch (error) {
      if (request.action === "requestPurchase") pendingPurchaseRef.current = null;
      fail(safeBridgeError(error));
    }
  }, [rememberPurchase, sendResponse, storeReady]);

  // This does not yet restrict navigation to APP_ORIGIN. handleMessage above
  // already re-validates isTrustedAppUrl on every bridge message, so an
  // off-origin page was never able to reach the IAP bridge — that part is not
  // at risk. A navigation-origin allowlist would be additional defense-in-depth
  // (an off-origin page currently can render in this authenticated,
  // cookie-sharing session, and Apple review dislikes uncontrolled in-app
  // browsing). Base44 social sign-in (Google/Microsoft/Facebook/Apple, enabled
  // in base44/auth/config.jsonc) and SSO now run in an ASWebAuthenticationSession
  // (startNativeSignIn above), so their redirects no longer pass through this
  // WebView. Enforcing a strict allowlist still needs a device trace of every
  // other off-origin navigation first; a wrong allowlist would silently lock
  // users out — worse than the gap it would close. So for now this only ever hands a well-understood,
  // user-facing scheme to the OS (never an arbitrary/custom one): every
  // `https:` URL keeps loading in the WebView exactly as before, `mailto:`/
  // `tel:` open in the system handler via Linking.openURL, and anything else is
  // refused outright. Add the APP_ORIGIN/auth-host allowlist once that device
  // trace exists (see docs/release-checklist.md).
  // Google and Facebook block OAuth inside an embedded WKWebView, so provider
  // sign-in runs in ASWebAuthenticationSession and the resulting token is
  // handed back to this WebView (see nativeAuth.ts for the full flow).
  const authSessionOpenRef = useRef(false);
  const startNativeSignIn = useCallback(async (loginUrl: string) => {
    if (authSessionOpenRef.current) return;
    const sessionUrl = nativeLoginUrl(loginUrl, APP_ORIGIN);
    if (!sessionUrl) return;
    authSessionOpenRef.current = true;
    try {
      const result = await WebBrowser.openAuthSessionAsync(sessionUrl, NATIVE_AUTH_CALLBACK);
      if (result.type !== "success") return;
      const target = webViewUrlForCallback(result.url, APP_ORIGIN);
      if (!target) {
        Alert.alert("Sign-in did not finish", "Please try again.");
        return;
      }
      webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(target)}); true;`);
    } catch {
      Alert.alert("Sign-in is unavailable", "Check your connection and try again.");
    } finally {
      authSessionOpenRef.current = false;
    }
  }, []);

  // react-native-webview passes isTopFrame on iOS but does not export the type.
  const handleShouldStartLoadWithRequest = useCallback((request: WebViewNavigation & { isTopFrame?: boolean }): boolean => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return false;
    }
    if (request.isTopFrame !== false && isProviderLoginUrl(request.url, APP_ORIGIN)) {
      void startNativeSignIn(request.url);
      return false;
    }
    if (url.protocol === "https:") return true;
    if (url.protocol === "mailto:" || url.protocol === "tel:") {
      void Linking.openURL(request.url);
    }
    return false;
  }, [startNativeSignIn]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: APP_ORIGIN }}
        style={styles.webView}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={(state) => {
          currentUrlRef.current = state.url;
        }}
        onLoadStart={() => {
          // A reload or navigation drops the page that was waiting on a
          // purchase; keep it from blocking the next one.
          pendingPurchaseRef.current = null;
          clearTimeout(purchaseGraceTimerRef.current ?? undefined);
        }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        contentInsetAdjustmentBehavior="never"
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled={false}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#46d8bc" />
          </View>
        )}
        onError={() => {
          Alert.alert("RecompOne is unavailable", "Check your connection and try again.");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: {
    alignItems: "center",
    backgroundColor: "#07121d",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  webView: { backgroundColor: "#07121d", flex: 1 }
});
