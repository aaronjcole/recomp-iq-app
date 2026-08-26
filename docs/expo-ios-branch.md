# Expo iOS branch — handoff and setup guide

This app's source of truth is the Base44 web app (`src/`). This document describes how to spin up a
**separate Expo branch/repo** that wraps the *same* Base44 backend (entities, functions, auth) so
the iOS build gets true native features without forking the data model.

The web app keeps exclusive ownership of SEO/GEO pages (`/tools`, `/learn`, `/tips`, `/locations`)
and all shared fitness logic. The Expo branch is an iOS-native shell only.

## Why a separate Expo branch (and not the built-in wrapper)

Base44 already wraps this app in a native webview and ships an IPA with camera permissions and push
notifications built in. That covers barcode scanning and push today. The one iOS capability the
built-in wrapper **cannot** currently provide is **native in-app purchase (StoreKit)**:

- Base44 documents that its StoreKit/Google Play Billing bridge is still in development.
- Apple Guideline 3.1.1 forbids third-party billing (Stripe) for digital goods inside the app.
- The existing `verifyGooglePlayPurchase` function is scaffolded for Android; there is no Apple
  equivalent yet.

So the Expo branch exists primarily to add **StoreKit IAP**. Native camera and push are secondary
wins (cleaner permission UX, background push). Everything else stays on the web app.

## Shared backend — no duplication

The Expo app talks to the **same** Base44 app. Do not create parallel entities or functions.

- **App ID / API base:** reuse the same Base44 app id and API base URL the web client uses
  (`src/api/base44Client.js`). The Expo app initializes the Base44 SDK against the same app.
- **Auth:** use Base44's email/password + Google OAuth flows exactly as the web app does. The Expo
  branch should open the hosted auth pages in an in-app browser or replicate the SDK auth calls.
- **Entities:** all 10+ entities (UserProfile, DailyLog, ExerciseSession, StrengthLog, etc.) are
  read/written identically from Expo via the Base44 SDK.
- **Functions:** reuse `barcodeLookup`, `upsertTrackingRecord`, `coachReply`,
  `generateAdaptiveMealPlan`, `generateAdaptiveTrainingBlock`, `generateWeeklyAutopilot`,
  `getPremiumAccess`, `analyzeBodyComposition`, `reportAiContent`, `deleteAccount`,
  `joinWaitlist`. Add only the two new iOS-native functions below.

## Repo structure

Recommended: a monorepo with the web app and the Expo app as siblings, sharing a `shared/` package.

```
recompone/
├── web/                 # this Base44 app (source of truth, SEO, shared logic)
│   ├── src/lib/fitness/ # pure JS — copy or symlink into shared/
│   └── base44/          # entities + functions (backend)
├── expo-ios/            # the Expo branch
│   ├── app/             # screens (mirrors web tabs: Today, Fuel, Train, Progress, More)
│   └── ...
└── shared/
    └── fitness/         # src/lib/fitness copied here, imported by both
```

If a monorepo is too heavy, a simpler path is a separate git branch (`expo-ios`) in this repo that
copies `src/lib/fitness` and the Base44 client config and ignores the web-only SEO pages.

## Shared code to port

Copy these pure-JS modules into the Expo app (they have no web-only dependencies):

- `src/lib/fitness/*` — all calculators, the adaptive engine, adherence, trends, projections,
  meal planning, training analysis. These are framework-agnostic and run unchanged in React Native.
- `src/lib/fitness/constants.js`, `biometricRanges.js`, `habitIcons.js` (swap icon names for
  `@expo/vector-icons`).
- `src/lib/heightConversion.js`, `src/lib/support.js`.

Do **not** copy: `src/pages/seo/*`, `src/components/seo/*`, `src/lib/seo/*`, `public/sitemap.xml`
(web-only SEO), or `@zxing/browser` (replaced by expo-camera below).

## Native feature 1 — barcode scanning (replaces @zxing/browser)

The web app uses `@zxing/browser` inside the BarcodeScanner component. In Expo:

- Install `expo-camera` (includes `BarCodeScanner`).
- Point the scanner at the same backend: on a successful scan, call
  `base44.functions.invoke("barcodeLookup", { barcode })` — the existing function already returns
  the food item. No backend change needed.
- Request camera permission with `expo-camera`'s permission hook; show the same denial/retry UX the
  web component does.

## Native feature 2 — push notifications

1. In the Expo app, install `expo-notifications`. Request permission on first launch.
2. Obtain the APNs token (Expo handles the APNs key upload via EAS). 
3. **New entity:** `PushDevice` — `{ owner_id, token, platform: "ios", active }` (admin-owned RLS,
   like `PremiumEntitlement`). The Expo app calls a new function to register its token.
4. **New backend function:** `registerPushToken` — stores/updates the `PushDevice` record for the
   signed-in user. (Server-only; sets `owner_id` from the authenticated session.)
5. **Sending:** from existing functions (e.g. `generateWeeklyAutopilot`), call the built-in
   `SendPushNotification` integration with the user's stored token. Note: `SendPushNotification`
   requires a native mobile build with push credentials configured — confirm credentials are set
   in EAS before relying on it.

## Native feature 3 — StoreKit in-app purchase (the main iOS blocker)

This is the capability that justifies the Expo branch. Mirror the existing Android pattern:

1. In the Expo app, install `react-native-iap` (or `expo-in-app-purchases`).
2. Product IDs must match the `PremiumEntitlement.product_id` enum already in the schema:
   `recompone_premium`, `adaptive_meal_plans`, `adaptive_training_blocks`,
   `weekly_autopilot`, `visual_progress_checks`, `ai_lifestyle_coach_premium`.
3. After a successful StoreKit purchase, call a **new backend function** `verifyApplePurchase`
   that mirrors `verifyGooglePlayPurchase`:
   - Receives the App Store receipt/transaction.
   - Validates the receipt server-side against Apple's App Store Server API.
   - Writes a `PremiumEntitlement` record with `source: "apple_store"` (add this value to the
     `source` enum in `base44/entities/PremiumEntitlement.jsonc`).
   - Handles refunds/cancellations via App Store Server Notifications V2 (a webhook endpoint)
     updating the entitlement `status` to `"revoked"` or `"expired"`.
4. The existing `getPremiumAccess` function already checks `PremiumEntitlement` server-side, so no
   client gating changes are needed — the Expo app calls it exactly as the web app does.
5. Do **not** use Stripe or any web callback to unlock Premium inside the iOS app.

## iOS App Store issue checklist (what was flagged, and how this resolves it)

| Flagged issue | Root cause | Resolution in the Expo branch |
|---|---|---|
| Digital goods billed via Stripe (Guideline 3.1.1) | Base44's StoreKit bridge is still in development | Native StoreKit via `react-native-iap` + `verifyApplePurchase` backend function |
| Camera permission purpose string | Base44 auto-generates for the webview wrapper | `expo-camera` + an explicit `NSCameraUsageDescription` in `app.json` |
| Account deletion (Guideline 5.1.1(v)) | Already implemented (`deleteAccount` function + `/delete-account` page) | Wire the same `deleteAccount` function to a native screen; no change needed |
| Health/medical claims (Guideline 1.4.1) | AI coach + body-composition scan | Keep the existing safety flags, no-medical-claim copy, and `reportAiContent` moderation; carry them into the Expo UI verbatim |
| Push notification usage | Built-in wrapper supports it | `expo-notifications` + APNs key in EAS; register token via `registerPushToken` |
| Private photo handling | Body-composition scan uses private uploads + 5-min signed URLs | Keep the same `analyzeBodyComposition` function; do not cache photos on device beyond the session |
| Frame isolation / OAuth | Deployment blockers for the web app | Not applicable to the native Expo app (no webview framing) |

## What stays web-only (do not port to Expo)

- All SEO/GEO pages: `/tools/*`, `/learn/*`, `/tips/*`, `/locations/*`.
- `public/sitemap.xml`, `public/robots.txt`.
- `src/components/seo/SeoShell.jsx` and the SEO content data files.

These exist for search ranking and have no place in the native app.

## What I cannot do from this sandbox

- I cannot run `expo init` or create a runnable Expo project inside this Base44 Vite sandbox.
- I cannot install Expo npm packages here (they would break the web build).
- The two new backend functions (`registerPushToken`, `verifyApplePurchase`) and the `PushDevice`
  entity can be created in this app when you're ready — say the word and I'll scaffold them so the
  Expo branch has its server side waiting.