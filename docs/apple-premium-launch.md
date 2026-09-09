# Apple Premium Launch — RecompOne

## What was implemented

### Backend

- **`verifyApplePurchase`** — server-side Apple App Store Server API verification:
  - Accepts `{ transactionId, productId }` after a native StoreKit purchase **or restore**.
  - Validates the transaction via Apple's Get Transaction Info endpoint.
  - Verifies the bundle ID matches `com.fitnesstrackerapps.recompone`.
  - Only accepts `recompone_premium_monthly` or `recompone_premium_annual`.
  - Maps both Apple products to the internal `recompone_premium` entitlement.
  - Upserts the entitlement idempotently (owner-scoped via `base44.auth.me()`, never trusts client user ID).
  - Fails closed on any validation error — no unlock on unavailable or failed verification.
  - Never stores raw receipts, health data, or email.

- **`appleStoreNotification`** — App Store Server Notifications V2 webhook:
  - Verifies the JWS signature and x5c certificate chain (Apple Root CA G3).
  - Handles `REFUND`/`REVOKE` → status `revoked`.
  - Handles `EXPIRED`/`GRACE_PERIOD_EXPIRED` → status `expired`.
  - Handles `DID_RENEW` → status `active` + updated `expires_at`.
  - Matches entitlements by `external_transaction_id` (stable across notifications).
  - Idempotent: acknowledges all valid notifications, even when no matching entitlement exists.

- **`PremiumEntitlement` entity** — `apple_store` is an allowed source (already present, admin-only RLS preserved).

- **`getPremiumAccess`** — reads `apple_store` entitlements alongside `google_play`, `tester`, and `admin`.

- **`premiumDomain.js`** — `APPLE_STORE_PRODUCTS`, `isAppleStoreProduct()`, `mapAppleProductId()` added. Both Apple product IDs map to `recompone_premium`.

### Frontend

- **`PremiumPaywall`** component (`src/components/premium/PremiumPaywall.jsx`):
  - Feature list: adaptive meal plans & grocery lists, 4–6-week training blocks, Weekly Autopilot, cross-signal insights, Lifestyle Coach, Visual Progress tools.
  - Pricing: Monthly $4.99/month, Annual $39.99/year with 14-day free trial.
  - Purchase buttons — disabled in the WebView; functional only when a native StoreKit bridge is present.
  - Restore Purchases control — visible, disabled in the WebView.
  - Note that core food, workout, sleep, habit, and progress tracking remain free.

- **`nativeIapBridge.js`** (`src/lib/nativeIapBridge.js`) — detects whether the Base44 wrapper exposes `requestPurchase`/`restorePurchases` on `wixMobileNativeBridge`.

- **`Premium.jsx`** — paywall shown above the feature catalog when the user has no access. Locked cards remain discoverable.

### Tests

- `tests/security/apple-premium.test.js` — product mapping, fail-closed, source inspection, paywall gating, entity RLS.

## Required App Store Connect / Apple Server API secrets

Set these in the Base44 dashboard → Settings → Secrets:

| Secret name | Value | Status |
|---|---|---|
| `APPLE_ISSUER_ID` | App Store Connect API issuer ID | ✅ already set |
| `APPLE_KEY_ID` | App Store Connect API key ID (tied to the .p8 key) | ✅ already set |
| `APPLE_BUNDLE_ID` | `com.fitnesstrackerapps.recompone` | ❌ **set this** |
| `APPLE_PRIVATE_KEY` | Contents of the Apple .p8 private key (PEM body, no `-----` header/footer lines) | ❌ **set this** |
| `APPLE_APP_ID` | Apple App ID prefix (optional, for notification validation) | optional |
| `PREMIUM_TESTER_EMAILS` | Comma-separated tester emails (testing only — clear before launch) | ✅ already set |

## How to configure App Store Server Notifications V2

1. In App Store Connect → your app → App Information → App Store Server Notifications.
2. Set the Production Server URL to:
   ```
   https://recomp-iq.base44.app/functions/appleStoreNotification
   ```
3. Set the Sandbox Server URL to the same endpoint.
4. Select **Version 2 Notifications**.
5. Enable at minimum: `DID_RENEW`, `EXPIRED`, `GRACE_PERIOD_EXPIRED`, `REFUND`, `REVOKE`.

The endpoint verifies Apple's signed JWS payload (x5c certificate chain terminating at Apple Root CA G3) before applying any entitlement update. It is idempotent and does not expose transaction details to unauthenticated clients.

## Sandbox / TestFlight testing steps

1. Create a sandbox tester account in App Store Connect → Users and Access → Sandbox → Test Accounts.
2. Install the app via TestFlight (or the sandbox environment on a device).
3. Subscribe using the monthly or annual product.
4. Verify that `verifyApplePurchase` creates an `apple_store` entitlement with `product_id: recompone_premium` and `status: active`.
5. Verify that `getPremiumAccess` returns `hasBundleAccess: true` for the subscriber.
6. In the sandbox, use the StoreKit testing menu to:
   - Expire the subscription → verify the entitlement becomes `expired` (via `appleStoreNotification` or a manual `verifyApplePurchase` call that returns 402).
   - Refund the purchase → verify the entitlement becomes `revoked` (via `appleStoreNotification`).
7. Verify that a restored purchase reactivates the entitlement through the same `verifyApplePurchase` flow.
8. Send a duplicate notification → verify no duplicate entitlement is created (the upsert updates the same record).

## Reviewer screenshot needed

Apple reviewers need a screenshot of the paywall showing:
- The RecompOne Premium branding
- Both pricing tiers (Monthly $4.99, Annual $39.99 with 14-day free trial)
- The Restore Purchases control

Take this screenshot from the native iOS app on the `/more/premium` screen.

## Native StoreKit work that Base44 cannot perform

**The current Base44 WebView wrapper does NOT provide a native StoreKit in-app-purchase bridge.** The `wixMobileNativeBridge` object provides navigation and device APIs but does not expose `requestPurchase` or `restorePurchases` methods. The paywall correctly detects this and disables purchase/restore controls in the WebView — no simulated success.

To complete the purchase flow, the app must be wrapped with Expo + react-native-iap (or the supported Expo equivalent). The native shell must:

### 1. Install react-native-iap

```bash
npm install react-native-iap
```

Or with Expo:
```bash
npx expo install react-native-iap
```

### 2. Configure the two product IDs

```js
const productSkus = Platform.select({
  ios: ["recompone_premium_monthly", "recompone_premium_annual"]
});
```

- `recompone_premium_monthly` — $4.99/month
- `recompone_premium_annual` — $39.99/year, 14-day free trial

Both products grant the same `recompone_premium` entitlement.

### 3. Implement the purchase flow

```
requestPurchase(productId)
  → StoreKit purchase sheet
  → transaction finish
  → POST /functions/verifyApplePurchase { transactionId, productId }
  → refresh getPremiumAccess (base44.functions.invoke("getPremiumAccess"))
  → unlock only after server confirms active entitlement
```

### 4. Implement the restore flow

```
restorePurchases()
  → for each restored Apple transaction:
      POST /functions/verifyApplePurchase { transactionId, productId }
  → refresh getPremiumAccess
```

### 5. Inject a bridge into the WebView

The native shell must inject `window.wixMobileNativeBridge` with:

```ts
interface NativeIapBridge {
  requestPurchase(productId: string): Promise<{ transactionId: string; productId: string }>;
  restorePurchases(): Promise<{ restored: boolean }>;
}
```

The `hasNativeIapBridge()` check in `src/lib/nativeIapBridge.js` detects these methods and enables the paywall buttons. Without them, the buttons remain disabled and show "Available in the iOS app."

### 6. Handle App Store Server Notifications V2

Already implemented in `appleStoreNotification`. Configure the webhook URL in App Store Connect (see above).

### Callback contract for `verifyApplePurchase`

```
POST https://recomp-iq.base44.app/functions/verifyApplePurchase
Authorization: Bearer <Base44 user token>
Content-Type: application/json

{
  "transactionId": "<Apple transactionId from StoreKit>",
  "productId": "recompone_premium_monthly" | "recompone_premium_annual"
}
```

| Response | Body | Meaning |
|---|---|---|
| 200 | `{ "ok": true, "entitlementProductId": "recompone_premium" }` | Verified, entitlement upserted |
| 402 | `{ "error": "Purchase is not active" }` | Expired, revoked, or not found at Apple |
| 400 | `{ "error": "productId is not recognized" }` | Unknown product ID |
| 401 | `{ "error": "Unauthorized" }` | Not authenticated |

The same endpoint handles both initial purchases and restores — the verify-and-upsert flow is identical and idempotent.