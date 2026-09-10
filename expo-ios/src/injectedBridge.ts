import { BRIDGE_SOURCE, BRIDGE_VERSION } from "./bridgeProtocol";

export const IAP_RESPONSE_EVENT = "recompone:iap-response";

export function buildInjectedBridgeScript(): string {
  return `
    (function () {
      if (window.__recompOneIapBridgeInstalled) return true;
      window.__recompOneIapBridgeInstalled = true;

      var pending = Object.create(null);
      var sequence = 0;
      var SOURCE = ${JSON.stringify(BRIDGE_SOURCE)};
      var VERSION = ${BRIDGE_VERSION};
      var RESPONSE_EVENT = ${JSON.stringify(IAP_RESPONSE_EVENT)};

      function send(action, payload) {
        return new Promise(function (resolve, reject) {
          var requestId = Date.now().toString(36) + "-" + (++sequence).toString(36);
          pending[requestId] = { resolve: resolve, reject: reject };
          window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({
            source: SOURCE,
            version: VERSION,
            requestId: requestId,
            action: action
          }, payload || {})));
        });
      }

      window.addEventListener(RESPONSE_EVENT, function (event) {
        var detail = event && event.detail;
        if (!detail || detail.source !== SOURCE || detail.version !== VERSION) return;
        var callback = pending[detail.requestId];
        if (!callback) return;
        delete pending[detail.requestId];
        if (detail.ok) callback.resolve(detail.result);
        else callback.reject(new Error(detail.error || "Native purchase request failed"));
      });

      var bridge = window.wixMobileNativeBridge && typeof window.wixMobileNativeBridge === "object"
        ? window.wixMobileNativeBridge
        : {};
      bridge.requestPurchase = function (productId, appAccountToken) {
        return send("requestPurchase", {
          productId: productId,
          appAccountToken: appAccountToken
        });
      };
      bridge.restorePurchases = function () {
        return send("restorePurchases");
      };
      bridge.finishTransaction = function (transactionId) {
        return send("finishTransaction", { transactionId: transactionId });
      };
      window.wixMobileNativeBridge = bridge;
      window.dispatchEvent(new Event("recompone:iap-ready"));
      return true;
    })();
    true;
  `;
}
