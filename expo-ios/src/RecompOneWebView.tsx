import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import {
  endConnection,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase
} from "react-native-iap";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  APP_ORIGIN,
  APPLE_PRODUCT_IDS,
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isAppleProductId,
  isTrustedAppUrl,
  parseBridgeRequest,
  type BridgeResponse,
  type PurchaseResult
} from "./bridgeProtocol";
import { buildInjectedBridgeScript, IAP_RESPONSE_EVENT } from "./injectedBridge";

type PendingPurchase = {
  requestId: string;
  productId: (typeof APPLE_PRODUCT_IDS)[number];
};

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

    void (async () => {
      try {
        await initConnection();
        await fetchProducts({ skus: [...APPLE_PRODUCT_IDS], type: "subs" });
        if (mounted) setStoreReady(true);
      } catch {
        if (mounted) setStoreReady(false);
      }
    })();

    return () => {
      mounted = false;
      purchaseUpdate.remove();
      purchaseError.remove();
      void endConnection();
    };
  }, [rememberPurchase, sendResponse]);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    if (!isTrustedAppUrl(event.nativeEvent.url || currentUrlRef.current)) return;
    const request = parseBridgeRequest(event.nativeEvent.data);
    if (!request) return;

    const fail = (error: string) => sendResponse({
      source: BRIDGE_SOURCE,
      version: BRIDGE_VERSION,
      requestId: request.requestId,
      ok: false,
      error
    });

    if (!storeReady) {
      fail("The App Store is still connecting. Try again in a moment.");
      return;
    }

    try {
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

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: APP_ORIGIN }}
        style={styles.webView}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly
        onMessage={handleMessage}
        onNavigationStateChange={(state) => {
          currentUrlRef.current = state.url;
        }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
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
