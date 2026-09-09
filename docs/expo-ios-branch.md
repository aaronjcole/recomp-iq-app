# RecompOne Expo iOS shell — build and handoff guide

The runnable iOS shell lives in `expo-ios/`. It loads the authenticated Base44
app at `https://recomp-iq.base44.app` in a native WebView and adds the StoreKit
capability that Base44's standard wrapper does not expose. The hosted app remains
the source of truth for UI, authentication, entities, functions, and fitness
logic, so a Base44/GitHub release updates the web experience without creating a
second application implementation.

## Why this shell exists

Apple requires StoreKit for digital subscriptions sold inside an iOS app. The
Base44 WebView bridge does not currently expose purchase or restore methods. The
Expo shell supplies those methods with `react-native-iap`, while the signed-in
web app performs authenticated server verification before native code finishes
the StoreKit transaction.

This division is intentional:

- native owns StoreKit presentation, restoration, and transaction finishing;
- the hosted Base44 session owns the user identity and calls
  `verifyApplePurchase`;
- Base44 owns the durable `PremiumEntitlement` and `getPremiumAccess` response;
- no Base44 bearer token or Apple private key is passed into the native bridge;
- web-only SEO/GEO routes and assets are not copied into the native bundle.

## StoreKit contract

The shell accepts only these Apple subscription products:

- `recompone_premium_monthly` — $4.99/month
- `recompone_premium_annual` — $39.99/year with a 14-day trial

Both map server-side to the internal `recompone_premium` entitlement. The shell
injects this complete contract into `window.wixMobileNativeBridge`:

```ts
interface NativeIapBridge {
  requestPurchase(productId: string): Promise<{
    transactionId: string;
    productId: string;
  }>;
  restorePurchases(): Promise<{
    purchases: Array<{ transactionId: string; productId: string }>;
  }>;
  finishTransaction(transactionId: string): Promise<{ finished: true }>;
}
```

`src/components/premium/PremiumPaywall.jsx` enables its controls only when all
three methods exist. After purchase or restore, it sends the transaction ID and
product ID to `verifyApplePurchase` through the authenticated Base44 client. It
calls `finishTransaction` only after verification succeeds, then refreshes
`getPremiumAccess`. An unavailable or rejected verification stays locked and the
transaction remains unfinished so StoreKit can redeliver it.

Bridge messages are versioned, request-correlated, constrained to the exact
hosted app origin, and validated against the two-product allowlist. Native keeps
at most 20 unfinished transaction objects in memory.

## Repository layout

```text
expo-ios/
├── App.tsx                         # native root and status/safe-area shell
├── app.json                       # bundle ID, build number, permissions
├── eas.json                       # development, preview, production profiles
├── src/RecompOneWebView.tsx       # StoreKit lifecycle + WebView boundary
├── src/bridgeProtocol.ts          # allowlists and message validation
└── src/injectedBridge.ts          # Promise bridge injected into Base44
```

The shell deliberately does not copy `src/lib/fitness`, pages, SEO routes, or
Base44 credentials. Those continue to run in the hosted application.

## Local checks

From the repository root:

```bash
npm ci --prefix expo-ios
npm run typecheck --prefix expo-ios
npm run doctor --prefix expo-ios
```

`react-native-iap` is a native module and does not work in Expo Go. Purchase
testing requires a development build, TestFlight build, or a StoreKit test
configuration on an iOS simulator.

## EAS setup and first build

Install/login to EAS without adding a global dependency:

```bash
cd expo-ios
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform ios
```

For TestFlight:

```bash
cd expo-ios
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform ios --latest
```

The configured bundle identifier is
`com.fitnesstrackerapps.recompone`. The production EAS profile uses remote
versioning with `autoIncrement`, so EAS advances the iOS build number for each
production build; the value in `app.json` is the local/development baseline.
EAS can manage the distribution certificate and provisioning profile
interactively. The App Store Connect API key used by the Base44 verification
function is a server secret and does not belong in this repository or native
app.

## App Store prerequisites

Before device testing, confirm:

1. Both subscriptions exist in the same App Store Connect subscription group.
2. Agreements, tax, and banking are active.
3. App Store Server Notifications V2 points both Production and Sandbox to
   `https://recomp-iq.base44.app/functions/appleStoreNotification`.
4. Base44 secrets listed in `docs/apple-premium-launch.md` are configured.
5. `PREMIUM_TESTER_EMAILS` is cleared before production launch.

## TestFlight acceptance matrix

Use a sandbox Apple account and a normal signed-in RecompOne account:

1. Buy monthly; verify Premium unlocks only after server confirmation.
2. Buy/restore annual; verify the same bundle unlocks and the trial copy matches
   App Store Connect.
3. Cancel the StoreKit sheet; verify no entitlement is created.
4. Restore after reinstall/sign-in; verify access returns.
5. Exercise renewal, expiration, billing retry/grace period, refund, and revoke;
   verify App Store Server Notifications update access correctly.
6. Simulate network/server failure after StoreKit success; verify the app remains
   locked and the unfinished transaction is redelivered later.
7. Confirm a transaction already linked to another RecompOne user is rejected.

Native compilation, signing, StoreKit sheet presentation, and webhook delivery
remain device/platform-gated. Repository tests prove the contract and fail-closed
logic, but they do not replace this TestFlight matrix.

## Later native capabilities

Barcode scanning and push notifications can remain in the hosted Base44 app for
version 1. If they later need native APIs, add them as separate, device-tested
PRs; do not duplicate the data model or port the application UI into Expo.
