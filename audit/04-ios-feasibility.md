# 04 — Standalone iOS Feasibility
Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

Sources: verified dossiers G-ios (finding IDs `IOS-*`), F-base44 (`B44-*`, unknowns `U*`), A-frontend (`FE-*`) and C-deps (`DEP-*`), the tooling digest, and the writer's own checks (`W1`-`W10`, §2.7). Tags: **VERIFIED** = cited lines opened, or tool/command output; **SUSPECTED** = inference, Apple/Base44/EAS runtime behaviour, or engineering judgement. EXTERNAL = Apple guideline text quoted from developer.apple.com, which the G-ios author and verifier both fetched on 2026-10-28. **Every effort, cost, calendar and reuse-percentage figure in this document is judgement and therefore SUSPECTED**, whatever the tag on the LOC next to it.

How the four requested options are read:
- **Option 1:** keep Base44 and wrap the web app. **1a** continues the existing Expo WebView shell (`expo-ios/`). **1b** switches the wrapper to Capacitor. **1c** is a PWA only, with no App Store binary.
- **Option 2:** React Native/Expo native UI that reuses the React logic, with the Base44 backend kept.
- **Option 3:** native SwiftUI rewrite that also leaves Base44 for a new backend.
- **Option 4:** Base44 kept as backend only, with a new native SwiftUI frontend.

Option 2 is also "Base44 as backend only", with an RN frontend. Option 4 is therefore evaluated as its Swift variant, so options 3 and 4 differ only in the backend.

---

## 1. Bottom line

**Stay on Base44 and ship the Expo WebView shell that already exists (option 1a). Do not switch to Capacitor, do not go PWA-only, and do not rewrite for v1.**

The 1,214-LOC shell already does four things:
- StoreKit subscriptions, verified server-side with Apple.
- Native speech capture.
- Provider sign-in through ASWebAuthenticationSession.
- A native retry screen.

What remains is about 8-14 engineer-days ($6k-17k) of hardening:
- CI is red.
- Two Apple secrets need checking.
- Paying users can stay locked out (IOS-V1).
- The account-deletion copy is missing the billing notice.
- The website wrongly says "Available on the App Store."
- Local notifications and haptics are not built yet; both blunt guideline 4.2.

Every alternative gives up the single UI codebase:
- **RN (option 2):** reuses ~51% of app code but only ~31% of the frontend, for 65-110 eng-days.
- **SwiftUI on Base44 (option 4):** reuses ~28%, for 95-155 eng-days.
- **SwiftUI off Base44 (option 3):** reuses ~19%, for 123-225 eng-days. It must also preserve Base44 user ids, or every existing Apple subscription breaks.

**Strongest argument against:** every screen is remote web content with no offline mode. That makes a discretionary 4.2 rejection a real risk (Medium, **SUSPECTED**), and in-gym logging is exactly where a WebView is weakest. If App Review rejects under 4.2 after the native additions, move to option 2: RN on the same Base44 backend and bundle ID. Never move to 3 or 4.

---

## 2. What exists today

### 2.1 The Expo shell (`expo-ios/`)

| File | LOC | Role | Tag |
|---|---|---|---|
| `expo-ios/src/RecompOneWebView.tsx` | 502 | WKWebView host (`source={{ uri: APP_ORIGIN }}`, `:407`), StoreKit listeners, auth-session intercept, navigation allowlist, retry screen | **VERIFIED** |
| `expo-ios/src/speechCapture.ts` | 171 | Speech controller (consent before OS permission, `:136-141`) | **VERIFIED** |
| `expo-ios/src/bridgeProtocol.ts` | 165 | `APP_ORIGIN = "https://recomp-iq.base44.app"` (`:4`), 2-product allowlist (`:6-9`), request validation | **VERIFIED** |
| `expo-ios/src/nativeAuth.ts` | 107 | Base44 provider-login URL detection (`:24-25`), callback token validation (`:96-107`) | **VERIFIED** |
| `expo-ios/src/injectedBridge.ts` | 97 | Injected `window.wixMobileNativeBridge` IAP Promise bridge (`:73-92`) | **VERIFIED** |
| `expo-ios/src/injectedSpeechBridge.ts` | 53 | Injected, origin-guarded `window.recompOneSpeech` | **VERIFIED** |
| `expo-ios/src/speechProtocol.ts` | 52 | Speech message schema | **VERIFIED** |
| `expo-ios/src/nativeSpeech.ts` | 42 | expo-speech-recognition adapter and native consent `Alert` (`:34-41`) | **VERIFIED** |
| `expo-ios/App.tsx`, `index.ts` | 20 + 5 | Root view, `<StatusBar style="auto" />` | **VERIFIED** |
| **Total** | **1,214** | `wc -l` (writer re-ran) | **VERIFIED** |

**Tests.**
- `expo-ios/tests/` holds 2 files (299 LOC).
- Root tests import shell modules directly: for example `tests/security/ios-native-auth.test.js`, `tests/security/premium-plans.test.js:4` and `tests/e2e/ios-bridge.spec.js` (DEP-18).

**Dependencies** (`expo-ios/package.json:13-24`):
- Present: `expo ~57.0.30`, `react-native 0.86.3`, `react 19.2.3`, `react-native-iap ^16.5.1`, `react-native-webview 13.16.1`, `expo-web-browser ~57.0.3`, `expo-speech-recognition 57.1.1`.
- Absent: `expo-notifications`, `expo-haptics`, `expo-updates` and `expo-secure-store`. **VERIFIED**.

**Configuration**, all **VERIFIED**:
- `expo-ios/app.json` sets:
  - `"bundleIdentifier": "com.base6a68bb922bf88da5ec767da3.app"` (`:14`).
  - `"buildNumber": "1"` (`:15`).
  - `"supportsTablet": true` (`:16`), with `"orientation": "portrait"` (`:6`).
  - `ITSAppUsesNonExemptEncryption: false`, plus camera and photo purpose strings (`:18-20`).
  - Speech plugin purpose strings (`:24-27`).
  - `"scheme": "recompone"` (`:11`).
- `expo-ios/eas.json` sets `appVersionSource: "remote"` (`:4`), production `autoIncrement` (`:21`) and `ascAppId 6803546092` (`:27`).

### 2.2 Native capability inventory

| # | Capability | State | Evidence | Tag |
|---|---|---|---|---|
| 1 | Hosted web app in WKWebView | Yes; production origin hard-coded, with no staging profile | `RecompOneWebView.tsx:405-410`, `bridgeProtocol.ts:4` | **VERIFIED** |
| 2 | StoreKit auto-renewing subscriptions | Yes | `RecompOneWebView.tsx:185-193` `initConnection` → `fetchProducts({ type: "subs" })` → intro-offer eligibility. `:278-286` purchase with `appAccountToken`. `:300-301` restore. `:320` `finishTransaction` only after the web asks, which happens after server verification (`src/components/premium/PremiumPaywall.jsx:46-52`) | **VERIFIED** |
| 3 | Server-side Apple verification and ASSN V2 | Yes | `base44/functions/verifyApplePurchase/entry.ts:90-110` (production API, then sandbox on 404), `:119` JWS verify, `:191-194` appAccountToken ownership. `base44/functions/appleStoreNotification/entry.ts:39-57`. Embedded Apple Root CA G3 at `base44/shared/appleJwsVerify.js:25-38` | **VERIFIED** code. Behaviour against live Apple payloads is **SUSPECTED** (tests use self-generated chains, `tests/fixtures/apple-jws/`) |
| 4 | Speech recognition | Yes; native iOS recognizer, *not* on-device-only (W1) | `nativeSpeech.ts:26-29` `lang: "en-US", … recordingOptions: { persist: false }` sets no on-device flag. The consent text (`:37`) says "Apple may process speech online." | **VERIFIED** |
| 5 | Provider sign-in in ASWebAuthenticationSession | Yes | `RecompOneWebView.tsx:356` `WebBrowser.openAuthSessionAsync(sessionUrl, NATIVE_AUTH_CALLBACK)`. Return page: `public/auth/native-return.html:27-45` | **VERIFIED**. Whether Base44 serves the static return page live is **SUSPECTED** |
| 6 | Navigation allowlist and system browser | Yes | `nativeAuth.ts:24` `BASE44_AUTH_HOSTS`. Off-origin links go to `WebBrowser.openBrowserAsync` (`RecompOneWebView.tsx:389-392`); mailto/tel go to `Linking.openURL` (`:396-399`) | **VERIFIED** |
| 7 | Offline / error | Native retry screen only | `RecompOneWebView.tsx:447-459` "RecompOne couldn't load … Try again" | **VERIFIED** |
| 8 | Camera (barcode, photos) | Web APIs inside WKWebView | `src/components/nutrition/BarcodeScanner.jsx:3,118` (`@zxing/browser`). `RecompOneWebView.tsx:431-432` `allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction={false}` | **VERIFIED**. getUserMedia on device is **SUSPECTED** |
| 9 | Share sheet | Web Share API from inside the shell | `src/lib/dataExport.js:26-39` `nav.share({ files: [file] … })`; `:40` throws `ExportDeliveryUnavailable` | **VERIFIED** code. WKWebView file share is **SUSPECTED** |
| 10 | Safe area | Web CSS only | `RecompOneWebView.tsx:435` `contentInsetAdjustmentBehavior="never"`; `env(safe-area-inset-*)` in 9 web files | **VERIFIED** |
| 11 | Haptics | **No** (no-op on iOS) | IOS-04 | **VERIFIED** |
| 12 | Push or local notifications | **No** | IOS-03 | **VERIFIED** |
| 13 | HealthKit, widgets, Siri, Live Activities | **No** | `rg -i "healthkit\|expo-notifications\|widgetkit\|live ?activit\|siri" expo-ios src` → 0 code hits. HealthKit is planned only, in `docs/features/reminders-and-integrations.md:92` | **VERIFIED** |
| 14 | Deep links | Scheme registered; used only by the auth callback | `app.json:11`. No `Linking.addEventListener`, `getInitialURL` or `useURL` in `expo-ios/` | **VERIFIED** |
| 15 | Native Sign in with Apple sheet | **No.** Apple sign-in is the Base44 web OAuth flow inside ASWebAuthenticationSession | IOS-06, IOS-W2 | **VERIFIED** |
| 16 | Privacy manifest | Not configured in app.json | IOS-W1 | **VERIFIED** (config); contents of the generated binary **SUSPECTED** |

**Web side of the bridge**, all **VERIFIED**:
- `src/lib/nativeIapBridge.js:41-53` requires the three IAP bridge methods.
- `src/lib/nativeStoreShell.js:11-17` treats `wixMobileNativeBridge`, or the UA `WixBrandedLiteApp`, as a native shell.
- `src/App.jsx:70`: `isNativeStoreShell() ? "/login" : "/coming-soon"` sends signed-out native users to `/login`, not to the marketing page.
- The bridge deliberately reuses the Base44/Wix wrapper's global name (`injectedBridge.ts:60-72`). That is an external contract this repo does not control.

### 2.3 Release state

| Item | Value | Evidence | Tag |
|---|---|---|---|
| App Store Connect app | `ascAppId 6803546092`. EAS owner `promptlabllc`, project `df0b21a1-…` | `eas.json:27`, `app.json:31,34` | **VERIFIED** |
| Version / build | `1.0.0` / `"1"` in config. EAS remote version source with autoIncrement | `app.json:5,15`, `eas.json:4,21` | **VERIFIED** |
| Last native change | 7e6e81c (2026-10-20). 10 commits ever touch `expo-ios/` | `git log origin/main -- expo-ios` | **VERIFIED** |
| Build 6 | Docs say it was compiled from 7e6e81c and passed deep signature verification, and that "the archive has not been uploaded to TestFlight or submitted for App Store review" | `docs/features/nutrition-integration.md:81,83` | **SUSPECTED** (no EAS/ASC access) |
| CI | Red on main. The expo-doctor step fails and skips every later step | IOS-10 | **VERIFIED** (tooling, GitHub API) |
| Public claim | `src/pages/ComingSoon.jsx:235` "Available on the App Store." | IOS-09 | **VERIFIED** |

### 2.4 Guideline 4.2 evidence balance

Measured split, all **VERIFIED** (`wc -l`):
- Native TypeScript: 1,214 LOC.
- Remote web UI (`src/`): 32,445 LOC in 234 files.
- So native code is about 3.6% of client code, and 100% of rendered screens are remote.

| Argues against a 4.2 rejection | Evidence | Tag |
|---|---|---|
| Real StoreKit purchase, restore and intro-offer eligibility, with server verification | §2.2 rows 2-3 | **VERIFIED** |
| Native speech capture behind a native consent alert | `nativeSpeech.ts:34-41` | **VERIFIED** |
| ASWebAuthenticationSession sign-in instead of in-WebView OAuth | `RecompOneWebView.tsx:356` | **VERIFIED** |
| Account-based utility: 17 authenticated routes plus onboarding (`src/App.jsx:109-128`), camera barcode scanning, on-device progress photos in IndexedDB (`src/lib/progressPhotos.js:23-28`) | cited | **VERIFIED** |
| Native users never land on the marketing page (`src/App.jsx:70`) | cited | **VERIFIED** |

| Argues for a 4.2 rejection | Evidence | Tag |
|---|---|---|
| Every screen comes from the live website, and the same URLs work in Safari | `RecompOneWebView.tsx:407` | **VERIFIED** |
| No offline content and no service worker | IOS-05 | **VERIFIED** |
| No notifications, no native haptics, no HealthKit, no widgets, no native tab bar | §2.2 rows 11-13 | **VERIFIED** |
| SEO and marketing routes still render inside the shell if reached by URL | `src/App.jsx:86-102` | **VERIFIED** (direct navigation only) |

Apple's text (EXTERNAL, 4.2): "Your app should include features, content, and UI that elevate it beyond a repackaged website."

Assessment: **Medium** 4.2 risk. **SUSPECTED**; enforcement is discretionary.

### 2.5 Gaps

| Gap | Why it matters for iOS | ID | Tag |
|---|---|---|---|
| Unsolicited StoreKit transactions never reach the web | Charged users stay locked out until they tap Restore | IOS-V1 | **VERIFIED** |
| No notifications | No re-engagement, and one fewer 4.2 signal | IOS-03 | **VERIFIED** |
| No offline logging | Gym use; reads as "website" for 4.2 | IOS-05 | **VERIFIED** |
| Haptics no-op | Cheap native signal left unused | IOS-04 | **VERIFIED** |
| Account deletion has no billing notice or SIWA revocation | 5.1.1(v) reviewer note or rejection | IOS-07 | **VERIFIED** |
| iPad enabled for a 448 px phone layout | iPad review and screenshots | IOS-13 | **VERIFIED** |
| No HealthKit or widgets | Retention and 4.2 | §2.2 row 13 | **VERIFIED** |
| No staging origin in the shell | Every web publish hits every installed app | IOS-18 | **VERIFIED** (origin) / **SUSPECTED** (publish mechanics) |
| No privacy manifest config | Required-reason API declarations | IOS-W1 | **SUSPECTED** (impact) |

### 2.6 Findings

Ordered by severity. Findings that came from another dossier keep their ID; duplicates are merged and listed under one heading.

### IOS-01 The iOS app is a thin remote WebView: 100% of screens come from the live website, and 4.2 rejection risk is Medium
- Tag: **VERIFIED** (code). Approval outcome **SUSPECTED**.
- Severity: High
- Evidence:
  - `expo-ios/src/RecompOneWebView.tsx:407` `source={{ uri: APP_ORIGIN }}`.
  - `expo-ios/src/bridgeProtocol.ts:4` `export const APP_ORIGIN = "https://recomp-iq.base44.app";`.
  - 1,214 native LOC against 32,445 web LOC (`wc -l`).
  - 0 code hits for notifications, HealthKit, widgets or expo-haptics (§2.2).
  - Guideline 4.2 text is EXTERNAL.
- Impact: A rejection would block launch and force native work under deadline. StoreKit, speech and the auth session are the main counterweight.
- Fix: Before the first submission, add local reminders (IOS-03) and a haptics bridge (IOS-04). List every native feature, plus a sandbox-allowlisted demo account, in the App Review notes. Effort: <1d for notes and haptics; 3-5 days for notifications.

### IOS-10 / DEP-02 / DEP-24 / DEP-01 CI is red on main, and the obvious fix (merge Expo PR #196) does not turn it green
- Tag: **VERIFIED** (tooling README, GitHub API per C-deps, writer lockfile check W2)
- Severity: High (driven by DEP-02 and DEP-01; DEP-24 on its own is Medium, as in 01 and 05)
- Evidence:
  - `.github/workflows/ci.yml:52-53` runs `npm run doctor --prefix expo-ios`, which is `"doctor": "npx expo-doctor"` (`expo-ios/package.json:11`).
  - It fails with "expo expected ~57.0.31 found 57.0.30" because the expected version comes from Expo's API at run time (DEP-02). The steps after it (`ci.yml:55-74`: fitness, security and contract tests, Android verify, build, e2e) are skipped.
  - PR #196 bumps expo, and moves `xcode` 3.0.1 → 4.0.0. `git show origin/dependabot/npm_and_yarn/expo-ios/expo-57.0.31:expo-ios/package-lock.json` gives `node_modules/xcode 4.0.0 {"simple-plist":"^1.3.1"}` and no `node_modules/uuid` entry (writer re-ran).
  - That breaks `expo-ios/tests/dependencySecurity.test.ts:8` `const uuid = fromXcode("uuid");` and `:14` `manifest.overrides["xcode@3.0.1"]` (DEP-24). #196 fails at the `test:speech` step (C-deps, GitHub job steps).
  - e2e is also broken underneath: `tests/e2e/meal-speech-input.spec.js:2` `import { build } from "esbuild";` and esbuild is no longer installed (tooling `e2e.txt`; DEP-01). So `tests/e2e/ios-bridge.spec.js` cannot run either.
- Impact: No regression signal for the paywall and bridge web code that ships into the iOS app, and any upstream Expo patch turns main red again. G-ios's "merge #196 now" fix is insufficient; the C-deps finding wins (see §2.7).
- Fix:
  - Run doctor with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, or as a non-blocking scheduled job. Whether `EXPO_OFFLINE=1` alone suffices is **SUSPECTED**.
  - Rewrite `dependencySecurity.test.ts` for xcode 4 and drop the `xcode@3.0.1` override, then land #196.
  - Add `esbuild` as a devDependency.
  - Effort: <1h each.

### B44-01 Base44 SDK analytics is on in production and sends user-identified events, which the App Privacy label must declare
- Tag: **VERIFIED** (code trace, F-base44). The App Store consequence is **SUSPECTED**.
- Severity: High
- Evidence:
  - `src/api/base44Client.js:6-13` passes no `analytics` option.
  - In the SDK, `node_modules/@base44/sdk/dist/client.js:213` sets `enabled: … analytics?.enabled ?? true`, and `dist/modules/analytics.js:291` sends `user_id: user.id`, with page paths and 60 s heartbeats.
  - This contradicts `vite.config.js:21-23` and `src/pages/Privacy.jsx:76-77` ("Aggregated, de-identified analytics"). The WKWebView runs the browser SDK, so it applies to the iOS app.
- Impact: An App Privacy "nutrition label" that omits identifier-linked usage data would be inaccurate (guideline 5.1.2 exposure, **SUSPECTED**).
- Fix: `createClient({ …, analytics: { enabled: false } })` before App Store submission, or declare the data. Effort: <1h.

### IOS-V1 StoreKit transactions that arrive outside an active purchase request are cached natively but never reach the web, so a charged user stays locked until they tap Restore
- Tag: **VERIFIED** (code path). Frequency **SUSPECTED**.
- Severity: Medium
- Evidence:
  - `expo-ios/src/RecompOneWebView.tsx:141-144`: `const result = rememberPurchase(purchase); const pending = pendingPurchaseRef.current; if (!pending) return;`.
  - The pending request is cleared by the 30 s grace timer (`:292-296`, "Once it is approved, use Restore Purchases.") and on every load start (`:421`).
  - The web has no listener for unsolicited transactions. Only the manual Restore button is wired (`src/components/premium/PremiumPaywall.jsx:129`).
  - The server cannot repair it: `base44/functions/appleStoreNotification/entry.ts:73` `if (!existing?.length) return json({ ok: true });` (writer opened). ASSN never creates a missing entitlement.
  - The repo's own TestFlight matrix step 6 expects redelivery (`docs/expo-ios-branch.md:148-149`).
- Impact: After an app kill or network failure between StoreKit success and `verifyApplePurchase`, or after an Ask-to-Buy approval, the user has paid but has no Premium. Matrix step 6 fails as written.
- Fix: On an unsolicited `purchaseUpdatedListener` event, dispatch an origin-guarded `recompone:iap-transaction` event that the web verifies and finishes. Alternatively, run one silent restore per signed-in launch. Effort: <1d (plus a rebuild).

### IOS-V2 `APPLE_BUNDLE_ID` is marked "⚠️ update before TestFlight purchase testing", and every Apple verification fails closed if it is wrong
- Tag: **SUSPECTED** (the secret's live value is not visible). Fail-closed behaviour **VERIFIED**.
- Severity: Medium
- Evidence:
  - `docs/apple-premium-launch.md:60` (writer opened): `` `APPLE_BUNDLE_ID` | `com.base6a68bb922bf88da5ec767da3.app` | ⚠️ update before TestFlight purchase testing ``.
  - `base44/shared/applePurchaseDomain.js:52-54` rejects on a missing or mismatched bundle id. The secret is read at `verifyApplePurchase/entry.ts:44,125`.
  - ASSN silently ignores notifications on a mismatch (`base44/shared/appleNotificationDomain.js:32-34`).
- Impact: Every purchase and restore fails ("Purchase incomplete"), and renewals and refunds are ignored. That is a 2.1 / 3.1.1 rejection risk during review.
- Fix: Confirm the secret equals `expo-ios/app.json:14` and tick the doc row. Effort: <1h.

### IOS-19 Sandbox (free) Apple purchases grant Premium to any account while `APPLE_SANDBOX_ALLOWED_USER_IDS` is unset
- Tag: **VERIFIED** (code). The secret value is **SUSPECTED** (doc row ⬜).
- Severity: Medium (rises once a public TestFlight link exists)
- Evidence:
  - `base44/shared/premiumDomain.js:147` `if (allowlist.size === 0) return { allowed: true, sandbox: true, unconfigured: true };` (:146 parses the list; line corrected in QA).
  - `docs/apple-premium-launch.md:64` "While unset, every sandbox purchase is accepted and logged. | ⬜ set before launch".
- Impact: Any TestFlight tester can give their production account Premium for free, and the grant renews by re-subscribing in the sandbox.
- Fix: Set the secret to the tester and App Review demo user ids before the first TestFlight invite. Effort: <1h.

### IOS-07 In-app account deletion exists, but omits Apple's required subscription notice and has no Sign in with Apple token revocation
- Tag: **VERIFIED** (code and absence). The requirement is EXTERNAL. Whether Base44 revokes SIWA tokens itself is **SUSPECTED**.
- Severity: Medium
- Evidence:
  - Deletion works: `src/pages/Profile.jsx:247-255` invokes `deleteAccount`, and the cascade deletes `PremiumEntitlement` (`base44/shared/accountDeletionDomain.js:48`).
  - The dialog copy (`Profile.jsx:592-597`, writer opened) mentions records, photos and AI-file retention, but not the Apple subscription.
  - `rg -i "auth/revoke|appleid\.apple\.com"` over the repo → 0.
  - Apple's account-deletion page (EXTERNAL): "notify them that billing will continue through Apple".
- Impact: Likely 5.1.1(v) friction. A deleted user keeps being billed by Apple with no warning.
- Fix: Add the billing notice and a link to `https://apps.apple.com/account/subscriptions` in the dialog and on `/delete-account`. Ask Base44 whether `User.delete` revokes Apple tokens. Effort: <1h for the copy; <1d for the SIWA answer.

### IOS-03 Push notifications are not implemented: a backend endpoint and an entity exist, but nothing calls them and nothing sends
- Tag: **VERIFIED** (no in-repo caller or sender). A call from the Base44 Android wrapper is **SUSPECTED**-unlikely.
- Severity: Medium
- Evidence:
  - `base44/functions/registerPushToken/entry.ts:3-4` "Called by the mobile app after obtaining an APNs/FCM token." (writer opened).
  - `rg registerPushToken src expo-ios/src public index.html scripts tests` → 0.
  - No `expo-notifications` in `expo-ios/package.json:13-24`, and no APNs/FCM sender.
  - `docs/features/reminders-and-integrations.md:7` agrees: "No app code calls the function, nothing sends a push, and no Base44 function runs on a schedule."
- Impact: No re-engagement channel for a habit app, and one fewer 4.2 signal.
- Fix: Local reminders through `expo-notifications` plus a bridge message, as the doc recommends (`:15-17`). Delete `registerPushToken` and `PushDevice` unless server push is planned. Effort: 3-5 days.

### IOS-05 Offline means a native retry screen only: no service worker, no cached shell, no offline writes
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - `RecompOneWebView.tsx:447-459` renders the retry screen.
  - `rg -i "serviceWorker|workbox|vite-plugin-pwa|registerSW" src index.html public vite.config.js package.json` → 0.
  - `src/components/OfflineBanner.jsx:23` "You're offline — changes are not saved. Reconnect before logging new data." (writer opened).
- Impact: Logging is lost in gyms and basements, a core context for a workout tracker. It also supports a "website" reading under 4.2.
- Fix: Short term, say so in the review notes. Medium term, a Workbox app-shell service worker plus an IndexedDB write queue for FoodLogEntry/StrengthLog. Whether a service worker works on the Base44-hosted origin is **SUSPECTED**. Effort: >1d (~5-8 days).

### IOS-09 The public page claims the iPhone app is "Available on the App Store." while docs say no build was ever uploaded
- Tag: **VERIFIED** (code). App Store status **SUSPECTED**.
- Severity: Medium
- Evidence:
  - `src/pages/ComingSoon.jsx:235` `<p className="mt-1.5 text-sm text-white/60">Available on the App Store.</p>` is unconditional; only the link at `:236` depends on `APP_STORE_URL` (writer opened).
  - `tests/e2e/public-smoke.spec.js:113` pins the text.
  - `docs/features/nutrition-integration.md:83` "has not been uploaded to TestFlight".
- Impact: A false availability claim on the indexable home page.
- Fix: Render "Coming to iPhone" unless `APP_STORE_URL` is set, and change the e2e assertion to match. Effort: <1h.

### IOS-18 Web publishes change the iOS app with no App Review and no CI gate
- Tag: **SUSPECTED** (Base44 publish mechanics are platform-side). The 2.5.2 text is EXTERNAL.
- Severity: Medium
- Evidence:
  - The shell always loads production (`bridgeProtocol.ts:4`).
  - `docs/features/nutrition-integration.md:85` "The shell loads the production web origin, not the Builder preview" (writer opened).
  - base44-builder[bot] pushes straight to main, and CI does not gate main (tooling README; B44-03).
- Impact: A broken publish breaks every installed iOS app at once. A large paywall or feature change via web could be read as changing functionality after review (2.5.2: apps may not "download, install, or execute code which introduces or changes features or functionality").
- Fix: Make "CI green on the published commit" a written precondition of every Base44 publish, and keep paywall and IAP changes behind a shell version check. Effort: <1d.

### FE-V1 A transient network or 5xx failure at boot is treated as "signed out", with no retry
- Tag: **VERIFIED** (code trace, A-frontend). Frequency **SUSPECTED**.
- Severity: Medium
- Evidence:
  - `src/lib/AuthContext.jsx:114-127`: on a non-401/403 `auth.me()` failure it sets `isAuthenticated=false` and `authChecked=true` with no `authError`.
  - `src/App.jsx:107` then sends the user to `<Navigate to="/login" replace />`.
  - The retry effect fires only while `!authChecked` (`src/components/ProtectedRoute.jsx:15-19`).
- Impact: On a flaky gym or cellular connection, an iOS user who is already signed in sees the login screen, and a reviewer on a throttled network sees an apparent logout.
- Fix: Keep a retryable "auth unknown" state (splash plus Retry) on network/5xx errors. Effort: <1d.

### FE-02 RouteErrorBoundary wraps the whole authenticated tree; on iOS a crash on a tab root leaves no navigation
- Tag: **VERIFIED** (code, A-frontend). How often users get stuck is **SUSPECTED**.
- Severity: Medium
- Evidence:
  - `src/App.jsx:158-162` wraps all of `AuthenticatedApp`, including the `AppLayout` nav (`src/components/AppLayout.jsx:81-120`).
  - Tab switches use `replace` (`AppLayout.jsx:89`), so the WebView's swipe-back (`RecompOneWebView.tsx:436` `allowsBackForwardNavigationGestures`) has no history to return to.
- Impact: A deterministic render error on a tab root strands an iOS user on a card whose only button re-throws; quitting the app is the only exit.
- Fix: An inline ErrorBoundary per kept-alive tab inside AppLayout, plus a "Go to Today" link. Effort: <1h.

### B44-10 The Base44 origin is hard-coded into the iOS binary, the Apple webhook and the Android contract, while the web canonical is another domain
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - `expo-ios/src/bridgeProtocol.ts:4`, `expo-ios/src/nativeAuth.ts:24-25`, `base44/functions/appleStoreNotification/entry.ts:8`, `android/play-release.json:7`.
  - Canonical `https://fitnesstrackerapps.com/` at `index.html:13`.
- Impact:
  - Any host or auth change needs a new binary and App Review.
  - iOS storage lives on the base44.app origin, separate from web users on the custom domain. FE-08 is affected: meal plans and Autopilot reviews exist only in that origin's localStorage (`src/pages/AdaptiveMealPlan.jsx:120,176`), so they do not carry over between iOS and web or survive a reinstall.
- Fix: Move `APP_ORIGIN` to EAS build config, and pick one canonical origin before any migration. Effort: <1d plus a review.

### IOS-04 Haptic feedback is a no-op in the iOS app
- Tag: **VERIFIED** (code). That WebKit lacks `navigator.vibrate` is **SUSPECTED**/EXTERNAL; the repo's own comment says so.
- Severity: Low
- Evidence:
  - `src/lib/haptics.js:17-20` "iOS Safari silently ignores it. The Expo branch can replace this body with expo-haptics" (writer opened).
  - `:28-31` calls only `navigator.vibrate`.
  - 8 call sites in 6 files; `HAPTIC_TRIGGERS.MEAL_LOGGED` has 0 uses.
- Impact: Set completion, habits and check-ins feel web-like, and a cheap 4.2 signal goes unused.
- Fix: Add an `expo-haptics` bridge (`window.recompOneHaptics`) and wire `MEAL_LOGGED`. Effort: <1d plus a rebuild.

### IOS-13 `supportsTablet: true` commits a phone-only layout to iPad review
- Tag: **VERIFIED** (config and layout). iPad review and screenshot consequences **SUSPECTED**.
- Severity: Low
- Evidence:
  - `expo-ios/app.json:16` `"supportsTablet": true` with `:6` `"orientation": "portrait"`.
  - `src/components/AppLayout.jsx:59,82` caps the layout at `max-w-md` (448 px).
- Impact: Reviewers on iPad see a narrow phone column, and the release needs iPad screenshots.
- Fix: Set `supportsTablet: false` for v1. Effort: <1h plus a rebuild.

### IOS-15 IAP responses are injected without an origin check, and the IAP bridge is installed on Base44 auth-host pages
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - `RecompOneWebView.tsx:117-125` `sendResponse` injects `window.dispatchEvent(new CustomEvent(…))` with no `location.origin` guard; the speech path guards (`:91,94`).
  - `injectedBridge.ts:17-20` has no origin check and is injected into every main-frame load.
  - Requests from other origins are dropped (`:225` `if (!isTrustedAppUrl(…)) return;`).
- Impact: Limited to the allowlisted Base44 hosts; at most a product id and transaction id could leak there.
- Fix: Mirror the speech guard (`location.origin === APP_ORIGIN`) in both places. Effort: <1h.

### FE-16 Every route waits on the Base44 API before first paint, with no request timeout
- Tag: **VERIFIED** (A-frontend)
- Severity: Low
- Evidence:
  - `src/App.jsx:75-80` renders `AppSplash` until `isLoadingPublicSettings || isLoadingAuth`.
  - The SDK axios client sets no `timeout` (`node_modules/@base44/sdk/dist/utils/axios-client.js:118-126`).
- Impact: On iOS a stalled backend shows the WebView splash indefinitely, which is worse than the native retry screen (that only covers a failed page load).
- Fix: Add a timeout to the public-settings call and render public routes without waiting. Effort: <1d.

### FE-06 Three authenticated screens announce "Page not found" to VoiceOver
- Tag: **VERIFIED** (A-frontend, executed `getRouteMetadata`)
- Severity: Low
- Evidence: `src/lib/routeMetadata.js:14-168` has no entry for `/more/data`, `/more/referrals` or `/more/coach/lifestyle`, so they fall back to `NOT_FOUND_METADATA` (`:170-174`).
- Impact: VoiceOver users, App Review accessibility checks included, hear "Page not found".
- Fix: Add the 3 entries, plus a test that covers every `path=`. Effort: <1h.

### IOS-14 / B44-19 Shell docs overstate the token boundary
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - `expo-ios/README.md:10` "Native code never receives or stores the Base44 access token." (writer opened).
  - But `expo-ios/src/nativeAuth.ts:103-106` reads `access_token` from the callback, and `RecompOneWebView.tsx:363` injects it into the WebView URL.
  - `docs/expo-ios-branch.md:72` calls `App.tsx` a "safe-area shell", but `App.tsx` has no safe-area code.
- Impact: Security reviewers get the wrong trust model for sign-in.
- Fix: Reword to "receives the token transiently during provider sign-in; never persists it". Effort: <1h.

### IOS-11 / DEP-15 expo-ios `npm audit`: 4 high, 5 low, all in Expo CLI/config tooling
- Tag: **VERIFIED** (audit JSON, writer re-read). "Not in the IPA" is **SUSPECTED** (no Metro bundle was produced).
- Severity: Low
- Evidence:
  - `/tmp/claude-0/-home-user-recomp-iq-app/363ad519-3bee-54f6-bf9e-e120665568ef/scratchpad/expo-audit-verify.json`: high = `@expo/cli`, `expo`, `node-forge`, `zod`; low = `@expo/config`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, `deepmerge`.
  - Locked versions: node-forge 1.4.0 (`expo-ios/package-lock.json:4664-4665`), zod 3.25.76 at :6196-6197, deepmerge 4.3.1 at :2472-2473; the advisories are listed in tooling/expo-npm-audit.txt.
  - `node-forge`, `@expo/metro-config` and `@expo/prebuild-config` show `fixAvailable: true`. The others resolve only via `--force`, which means `expo@51.0.39`, a downgrade.
- Impact: Build-machine exposure only.
- Fix: Plain `npm audit fix` in expo-ios for node-forge, never `--force`; zod waits for Expo. Effort: <1h.

### DEP-16 The Expo SDK is one major behind and react-native-iap one major behind; Dependabot never proposes either
- Tag: **VERIFIED** (C-deps)
- Severity: Low
- Evidence:
  - expo is locked at 57.0.30; latest is 58.0.21. react-native-iap 16.5.1; latest 17.2.2, and react-native-nitro-modules must move with it.
  - `.github/dependabot.yml:44-55,66-70` ignores minor and major updates for `/expo-ios`.
- Impact: The payment shell drifts off supported SDKs with no prompt. This is the main recurring maintenance cost of option 1a.
- Fix: A yearly SDK upgrade task: `npx expo install --fix`, then iap 17 and nitro together, then an EAS device build. Effort: >1d (~2-3 days including device QA).

### IOS-W1 No privacy manifest configuration in the shell
- Tag: **VERIFIED** (absence in config). Whether Expo prebuild emits an adequate `PrivacyInfo.xcprivacy` is **SUSPECTED**.
- Severity: Low
- Evidence:
  - `expo-ios/app.json:13-22` (the `ios` block) has `infoPlist` but no `privacyManifests` key.
  - `rg -i "privacyManifest|xcprivacy" expo-ios` (excluding the lockfile) → 0 (writer ran).
- Impact: Apple requires required-reason API declarations. A missing or incomplete aggregated manifest shows up as an App Store Connect warning or rejection at upload.
- Fix: Inspect the generated `PrivacyInfo.xcprivacy` in the build-6 IPA, and add `ios.privacyManifests` to app.json if it lacks React Native's required-reason entries. Effort: <1h.

### IOS-16 The web build only works from an origin that serves Base44's `/api`, which blocks a bundled Capacitor or offline shell
- Tag: **VERIFIED** (code). Base44 CORS for `capacitor://localhost` is **SUSPECTED**.
- Severity: Low (decision input, not a defect)
- Evidence:
  - `src/api/base44Client.js:10` `serverUrl: ''` (writer opened).
  - `src/lib/app-params.js:106` `appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || window.location.origin` (writer opened).
  - The OAuth callback is bound to the initiating origin (`app-params.js:53-54`).
- Impact: Capacitor's main advantage, a local bundle that launches offline, is unavailable without code, environment and Base44 CORS changes. A remote-URL Capacitor app is functionally the current Expo shell.
- Fix: Do not switch to Capacitor. Effort: n/a.

### IOS-17 The Base44 SDK supports native bearer-token clients, so options 2 and 4 can keep the backend; there is no refresh-token API
- Tag: **VERIFIED** (SDK 0.8.57 code; writer re-opened). Gateway acceptance of non-browser clients and token TTL are **SUSPECTED**.
- Severity: Info
- Evidence:
  - `node_modules/@base44/sdk/dist/modules/auth.js:189-199` `setToken` sets `Authorization: Bearer ${token}`, and its localStorage write is guarded by `typeof window !== "undefined" && window.localStorage`.
  - `:215-230` `loginViaEmailPassword` POSTs `/apps/${appId}/auth/login` and returns `access_token`.
  - `grep -i refresh dist/modules/auth.js` → 0.
  - Writer check W5: the SDK detects React Native explicitly. `dist/utils/common.js:7` `export const isReactNative = !isNode && typeof document === "undefined";`, and `dist/modules/analytics.js:44` disables analytics when `isReactNative`.
- Impact: A native frontend can call all 22 invoked functions and the entities directly. When the session expires, the user must log in again.
- Fix: Before committing to option 2 or 4, spike the token TTL, Turnstile on email login, and gateway acceptance (U5). Effort: <1d.

### IOS-W2 The Base44 SDK has no native identity-token sign-in, so options 2 and 4 cannot show the native Sign in with Apple sheet on Base44
- Tag: **VERIFIED** (absence in SDK 0.8.57). Whether an undocumented Base44 REST endpoint exists is **SUSPECTED**.
- Severity: Info
- Evidence:
  - The auth module's methods are `hasToken`, `me`, `updateMe`, `redirectToLogin`, `loginWithProvider`, `logout`, `setToken`, `loginViaEmailPassword`, `isAuthenticated`, `inviteUser`, `register`, `verifyOtp`, `resendOtp`, `resetPasswordRequest`, `resetPassword` and `changePassword` (`dist/modules/auth.js:102-286`).
  - `grep -n -i "id_token\|idToken\|identityToken\|apple" dist/modules/auth.js` → 0 (writer ran).
- Impact: Native frontends on Base44 keep the ASWebAuthenticationSession web flow (`nativeAuth.ts`, `public/auth/native-return.html`). That is compliant with 4.8 (IOS-06) but not the native sheet users expect.
- Fix: None for option 1. For options 2 and 4, reuse the existing flow. Effort: n/a.

### DEP-19 React 18 (web) and React 19.2 (shell) share no runtime code; this constrains option 2
- Tag: **VERIFIED** (current sharing). Option-2 implications **SUSPECTED**.
- Severity: Info
- Evidence:
  - Root react is 18.3.1; expo-ios has `react 19.2.3` (`expo-ios/package.json:19`).
  - `rg "expo-ios" src base44` (excluding .md) → 0.
  - None of the web UI stack runs in RN: Radix, vaul, recharts, framer-motion DOM, Tailwind classes, react-router-dom (C-deps).
- Impact: Sharing hooks or contexts such as `RecompContext` between web and RN needs peer ranges of `^18 || ^19`, or the web moved to React 19 first.
- Fix: If option 2 is chosen, bump the web to React 19 (~2 days) and extract `base44/shared` plus the pure `src/lib` into a workspace package. Effort: >1d (~2-3 days).

### B44-02 Apple subscriptions are cryptographically bound to Base44 user ids
- Tag: **VERIFIED** (code; writer opened)
- Severity: High (migration blocker; it applies to option 3 only)
- Evidence:
  - `base44/shared/appleAppAccountToken.js:1` `const TOKEN_DOMAIN = "com.base6a68bb922bf88da5ec767da3.app:storekit-account:v1:";`, hashed with the Base44 user id (`:22-27`).
  - `base44/functions/verifyApplePurchase/entry.ts:191-194` returns 409 "Purchase is already linked to another account" on a mismatch.
- Impact:
  - Option 3 must import Base44 user ids as primary keys (or a `legacy_id`), or every existing subscriber's restore fails.
  - Options 1, 2 and 4 are unaffected if they keep the bundle id and the same token derivation.
- Fix: Keep the domain string and the user ids forever. Effort: <1d (design).

### B44-12 Apple and Google sign-in run on Base44-configured OAuth; Microsoft and Facebook are enabled but not offered
- Tag: **VERIFIED** (config). Identity portability **SUSPECTED** (U4).
- Severity: Medium (for option 3)
- Evidence:
  - `base44/auth/config.jsonc:2-6` enables username/password, Google, Microsoft, Facebook and Apple (writer opened).
  - `:9-10` `googleOAuthMode: "default"`, `googleOAuthClientId: null`.
- Impact: If Base44 owns the Apple Services ID, Apple `sub` values and private-relay emails will not survive option 3.
- Fix: Configure your own Apple and Google OAuth clients before any backend exit, and disable the unused providers. Effort: <1d.

### IOS-02 The native capability set is narrowly scoped and degrades safely
- Tag: **VERIFIED**
- Severity: Info
- Evidence:
  - Product allowlist and validation: `bridgeProtocol.ts:6-9,72-110`.
  - `PremiumPaywall.jsx:63-66` handles an old shell without `getProducts`.
  - `src/lib/nativeSpeechBridge.js:34-44` runs a 2 s capability handshake.
  - `nativeSpeech.ts:6-8` uses `requireOptionalNativeModule` so an old binary does not crash.
- Impact: The happy path works end to end in code (see IOS-V1 for recovery).
- Fix: None. Effort: n/a.

### IOS-06 Sign in with Apple is offered next to Google (4.8 satisfied in code) via the Base44 web flow
- Tag: **VERIFIED** (code). That the provider works at runtime is **SUSPECTED**.
- Severity: Info
- Evidence:
  - `src/pages/Login.jsx:40-42` `loginWithProvider("apple", returnTo)`; the button is at `:61-67`, above Google.
  - `src/pages/Register.jsx:80-82`.
  - `base44/auth/config.jsonc:6` `"enableAppleLogin": true`.
- Impact: Compliant. Users see the web Apple ID page, not the native sheet.
- Fix: Device test per `docs/deploy-1-5.md:48`. Effort: <1h.

### IOS-08 The paywall complies with 3.1.1/3.1.2: StoreKit only, no external purchase CTAs, disclosures present
- Tag: **VERIFIED**
- Severity: Info
- Evidence:
  - `PremiumPaywall.jsx:230-242` (writer opened): "auto-renewing subscription … Payment is charged to your Apple ID", plus Terms and Privacy links.
  - `rg -i "checkout|stripe|paypal|…|paddle"` over src hits only "paddleboarding" (`src/lib/seo/locationsData.js:13,237`).
- Impact: No 3.1.1 blocker. It also means there is no web purchase path at all, which matters for option 1c.
- Fix: None. Effort: n/a.

### IOS-12 Release metadata is consistent, with no in-repo evidence of any TestFlight or App Store submission
- Tag: **VERIFIED** (config, git). Build 6 is **SUSPECTED**.
- Severity: Info
- Evidence:
  - `app.json:14-16`, `eas.json:4,21,27`.
  - The last `expo-ios` commit, 7e6e81c, matches the build-6 commit claimed in `docs/features/nutrition-integration.md:81`.
- Impact: Shipping v1 is a process step (upload and review) once the §8 items are done.
- Fix: Upload a rebuild after the IOS-V1, haptics and notifications changes, then run `docs/expo-ios-branch.md:137-150`. Effort: <1d.

### 2.7 Dossier conflicts resolved and writer checks

| # | Topic | Conflict / check | Resolution (writer opened or ran) | Tag |
|---|---|---|---|---|
| W1 | Speech | G-ios bottom line says "On-device speech recognition" | `expo-ios/src/nativeSpeech.ts:26-29` sets no on-device requirement, and `:37` says "Apple may process speech online." Corrected to "native iOS speech recognition" | **VERIFIED** |
| W2 | CI fix | G-ios IOS-10: "Merge Dependabot PR #196 now". C-deps DEP-24: #196 fails CI | PR #196 lockfile has `xcode 4.0.0 {"simple-plist":"^1.3.1"}` and no `node_modules/uuid`, so `dependencySecurity.test.ts:8` fails. C-deps wins; merged into IOS-10 | **VERIFIED** |
| W3 | expo-ios audit severities | Tooling README groups deepmerge among the 4 highs | `expo-audit-verify.json`: deepmerge is low; the highs are @expo/cli, expo, node-forge, zod. G-ios and C-deps agree after their verification | **VERIFIED** |
| W4 | "Builder edits web only" (G-ios option table) | Imprecise | `git log origin/main -- expo-ios`: 1 of 10 commits is base44-builder[bot] (698293b, 2026-10-07, "Restrict WebView HTTPS navigation to allowed origins"); in `src`, 71 of 197 commits are the Builder's. The Builder mostly, not only, edits web | **VERIFIED** |
| W5 | SDK on React Native | Not in the dossiers | `node_modules/@base44/sdk/dist/utils/common.js:7` `isReactNative`; `dist/modules/analytics.js:44`. Added to IOS-17 | **VERIFIED** |
| W6 | Entity call counts (G 73, F 79, A 71) | Different regexes | `rg -o "base44\.entities\.[A-Z]\w+\.\w+\(" src` → 71 (all in RecompContext.jsx). `base44\.entities\.[A-Z]\w+` → 73 (+2 in nutritionReportHook.js). `entities\.[A-Z]\w+\??\.\w+\(` → 79 (adds the injected-client calls in sessionEdit.js and planSettings.js). No contradiction | **VERIFIED** |
| W7 | Auth call counts (G and F both 16, different lists) | G includes `isAuthenticated`, F includes `logout` | 16 `base44.auth.*` references outside the wrapper, 1 of them in the dead `src/pages/OAuthConsent.jsx`, plus `auth.logout` ×2 through an injected client (`src/lib/signOutCore.js:16,18`) | **VERIFIED** |
| W8 | Backend-exit effort | F-base44 §2.1 sums the Base44 exit at 28-38 eng-days; G-ios gives option 3 40-70 days for the backend | Both are judgement. F's sum omits LLM output-parity evaluation and vendor lead time; G's includes 10-20 days of web/Android re-pointing. This document uses the union, 28-70 days, so option 3 is 123-225 days | **SUSPECTED** |
| W9 | Option-1 effort | G-ios gives 6-10 days, but its own line items sum to ~6.6-12 days | The §8 line-item table, which adds B44-01, FE-V1, FE-02 and DEP-24, sums to ~7.5-14.5 days, stated as 8-14 | **SUSPECTED** |
| W10 | Web purchase path (for option 1c) | Not in the dossiers | `base44/entities/PremiumEntitlement.jsonc:27-35` `source` enum = `tester`, `google_play`, `apple_store`, `admin`. No web source | **VERIFIED** |

---

## 3. Code reuse measurement

Method (G-ios, verifier re-counted; writer re-ran the bucket LOC):
- A `src/lib` file counts as "pure" when it imports neither react-dom, react-router, the Base44 SDK, DOM globals, `localStorage` nor `import.meta.env`, transitively.
- The 47 pure files (4,417 LOC) have exactly one non-relative import, `from "react"` (in `recompContexts.js`). Their only DOM-global hits are in comments, at `androidBack.js:29`, `onboardingDraft.js:9`, `planSettings.js:108` and `sessionEdit.js:1`.
- `base44/shared` imports only `./` siblings.
- Tests (137 files, 22,155 LOC) and SEO/marketing code are excluded from the totals.

| Bucket | Scope | Files | LOC | 1a Expo shell | 1b Capacitor | 1c PWA | 2 RN/Expo | 3 SwiftUI + new backend | 4 SwiftUI on Base44 | Tag |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | Pure JS logic in `src/lib` (non-SEO), incl. `src/lib/fitness` 22 files / 2,333 LOC | 47 | 4,417 | 100% | 100% | 100% | 100% | 0% (port to Swift; 345 fitness tests as oracle) | 0% (same) | LOC **VERIFIED** |
| B2 | SEO/marketing (`src/lib/seo` 1,846, `src/pages/seo` 1,402, `src/components/seo` 190) | 16 | 3,438 | 100% | 100% | 100% | stays web | stays web | stays web | **VERIFIED** (excluded from totals) |
| B3 | `src/lib` bound to DOM, SDK or router (RecompContext.jsx 1,947, AuthContext, PremiumAccessContext, planCache, progressPhotos, …) | 27 | 3,750 | 100% | 100% | 100% | ~70% (contexts port; DOM-only files rewritten) | 0% | 0% | LOC **VERIFIED**, % **SUSPECTED** |
| B4 | Pages, non-SEO (DOM + Tailwind) | 29 | 7,417 | 100% | 100% | 100% | ~10% (state and handlers copied, markup rewritten) | 0% | 0% | LOC **VERIFIED**, % **SUSPECTED** |
| B5 | Components, non-ui, non-SEO | 90 | 11,445 | 100% | 100% | 100% | ~10% | 0% | 0% | LOC **VERIFIED**, % **SUSPECTED** |
| B6 | shadcn/Radix `src/components/ui` | 19 | 1,533 | 100% | 100% | 100% | 0% | 0% | 0% | **VERIFIED** |
| B7 | App shell: `App.jsx` 174, `main.jsx` 19, `index.css` 178, 2 hooks 47, `api/base44Client.js` 27 | 6 | 445 | 100% | 100% | 100% | 0% | 0% | 0% | **VERIFIED** |
| B8 | `base44/shared` pure domain | 34 | 6,608 | 100% | 100% | 100% | 100% | ~90% if the new backend is JS/TS | 100% | LOC **VERIFIED** |
| B9 | `base44/functions` (Deno + SDK) | 25 | 2,595 | 100% | 100% | 100% | 100% | ~20% (handlers rewritten for the new data layer) | 100% | LOC **VERIFIED**, % **SUSPECTED** |
| B10 | `base44/entities` schemas + RLS | 25 | 2,645 | 100% | 100% | 100% | 100% | ~50% (schema as spec; RLS rewritten) | 100% | LOC **VERIFIED**, % **SUSPECTED** |
| B11 | `expo-ios` shell | 10 | 1,214 | 100% | ~39% (474 LOC of protocol/validation TS: bridgeProtocol 165, nativeAuth 107, injectedBridge 97, injectedSpeechBridge 53, speechProtocol 52) | 0% | ~60% (react-native-iap flow, speechCapture, nativeAuth; WebView bridge dropped) | 0% | 0% | LOC **VERIFIED**, % **SUSPECTED** |
| **Total, app-relevant** | B1, B3-B11 | **312** | **42,069** | **42,069 (100%)** | **41,329 (98.2%)** | **40,855 (97.1%)**, but no StoreKit | **21,505 (51.1%)** | **7,789 (18.5%)** | **11,848 (28.2%)** | arithmetic **VERIFIED**, % **SUSPECTED** |
| **Frontend only** | B1, B3-B7 | 218 | 29,007 | 100% | 100% | 100% | **8,929 (30.8%)** | 0% | 0% | same |
| **UI LOC to rewrite** | B4-B7 | 144 | 20,840 | 0 | 0 | 0 | 20,840 | 20,840 | 20,840 | **VERIFIED** |
| **Logic LOC to port to another language** | B1 + B3 | 74 | 8,167 | 0 | 0 | 0 | 0 (JS stays) | 8,167 (+ backend) | 8,167 | **VERIFIED** |

Screen scope for any native UI (G-ios, **VERIFIED**):
- 22 screens: 17 authenticated routes (`src/App.jsx:112-128`), `/onboarding` (`:109`) and 4 auth routes (`:103-106`).
- They total 6,239 LOC of page code.
- Legal pages (`:89-92`) stay as web links; the 10 SEO routes (`:93-102`) stay web.
- Heavy components: `WorkoutTracker.jsx` 880, `FoodEntryComposer.jsx` 496, `FoodDiaryCard.jsx` 440, `BarcodeScanner.jsx` 434, `SessionEditSheet.jsx` 407.
- Web libraries with no RN drop-in: recharts (the Progress chunk is 453.7 kB / 122 kB gz, tooling `build.txt`), @zxing/browser (BarcodeScanner chunk 446.4 kB / 118.9 kB gz), Radix, vaul, framer-motion.

Backend surface a new native client must call (F-base44, writer re-ran, **VERIFIED**):
- 25 `functions.invoke` sites across 22 functions in 18 files.
- 79 direct entity calls across 15 entities, plus 4 dynamic `entities[stage.name]` calls (`src/lib/planSettings.js:155-183`) and 1 realtime `subscribe` (`src/lib/nutritionReportHook.js:23-25`).
- 16 auth references (W7).

---

## 4. Option-by-option evaluation

Every option keeps the bundle id `com.base6a68bb922bf88da5ec767da3.app` (`expo-ios/app.json:14`) and the ASC app 6803546092 (`eas.json:27`). The bundle id is baked into the appAccountToken domain (`base44/shared/appleAppAccountToken.js:1`). So options 1a, 1b, 2 and 4 are *app updates* for existing subscribers, not new apps.

### 4.1 Option 1 — Keep Base44 and wrap the web app (1a Expo shell, 1b Capacitor, 1c PWA)

**Reusable code.**
- 1a: 100% (42,069 LOC). The shell exists and is tested (expo-ios/tests, root tests).
- 1b: 98.2%. 740 LOC of RN-specific shell is replaced.
- 1c: 97.1%, but the StoreKit path is lost.

**Rewrite scope.**
- 1a: none for UI. New native work is limited to IOS-V1, haptics and notifications.
- 1b: rewrite the 1,214-LOC shell on Capacitor plugins (IAP, speech, auth session) with no capability gain.
  - A remote-URL Capacitor app behaves like the Expo shell.
  - A bundled one is blocked by IOS-16 (`serverUrl: ''`, origin-bound OAuth).
- 1c: no binary. Requires:
  - A service worker; none exists (IOS-05).
  - A web payment provider and a new `PremiumEntitlement.source`; the enum has no web source (W10), and src has no checkout code (IOS-08).

**Backend replacement.** None.

**App Store risk.**
- 1a and 1b: 4.2 Medium (IOS-01). 2.5.2 exposure from web publishes (IOS-18). 5.1.1(v) copy gap (IOS-07). 3.1.1 compliant (IOS-08). 4.8 compliant (IOS-06). Minor 2.3.10: a "Google Play beta" card at `src/pages/ComingSoon.jsx:209-228`, reachable only by direct URL.
- 1c: no App Store review, and no App Store distribution.

**Auth.**
- 1a, 1b: the Base44 web session lives in WKWebView localStorage (`src/lib/app-params.js:66-68`). Provider sign-in already uses ASWebAuthenticationSession. Email/password and OTP run in the web UI.
- 1c: same as the website.

**Payments.**
- 1a: done (react-native-iap, `verifyApplePurchase`, ASSN V2), except IOS-V1, IOS-V2 and IOS-19.
- 1b: StoreKit must be re-plumbed through a Capacitor plugin.
- 1c: no StoreKit. iOS revenue needs a new web checkout, entitlement source and server path.

**Push.**
- 1a, 1b: local reminders via `expo-notifications` (or the Capacitor equivalent) plus a bridge and a rebuild. Server push needs a sender and a scheduler, neither of which exists (IOS-03).
- 1c: web push on iOS needs a home-screen install and a service worker (EXTERNAL / **SUSPECTED**); the service worker does not exist.

**Android & web.** Unchanged. Android remains the Base44-managed wrapper (`android/play-release.json:3-12`, B44-09). One UI serves web, Android and iOS.

**Maintenance burden.**
- 1a, 1c: one UI codebase.
- 1a adds a yearly Expo SDK upgrade (~2-3 days, DEP-16) and a native rebuild plus review only for native changes. The non-hermetic CI doctor step needs the IOS-10 fix.
- 1b adds a second wrapper technology for no gain.

**Timeline & cost.**
- 1a: 8-14 eng-days, $6k-17k, 2-4 calendar weeks plus App Review (§8 line items). The minimal path without notifications and haptics is ~4-9 days. HealthKit read-only is another 5-10 days and gets its own design review (`docs/features/reminders-and-integrations.md:92,129`).
- 1b: 1a plus 5-10 days.
- 1c: not estimated by the dossiers. Writer judgement: >1d (~10-20 days) for a service worker, web checkout and entitlement source. **SUSPECTED**.

**Verdict.** 1a is recommended. 1b is rejected: cost with no gain. 1c is rejected: no App Store presence and no payment path.

### 4.2 Option 2 — React Native/Expo native UI reusing React logic, Base44 backend kept

**Reusable code.** ~51% of app code (21,505 LOC), but ~31% of the frontend (8,929 of 29,007 LOC):
- B1 pure logic: 100%.
- `base44/shared`, functions and entities: 100%.
- B3 contexts: ~70%.
- Shell: ~60%.
- RecompContext.jsx (1,947 LOC) is mostly hooks and data logic, but it imports react-router `Outlet`/`Navigate` (`:2`) and has ~35 LOC of DOM JSX (`:1912-1946`). **SUSPECTED** port share.

**Rewrite scope.**
- 22 screens and 20,840 LOC of UI.
- Navigation (react-router → React Navigation).
- Charts (recharts → an RN chart library).
- Barcode (zxing → a native camera scanner).
- Image picker and photo storage (IndexedDB → file system).
- Haptics and notifications natively.

Constraint: React 18 (web) and 19.2 (RN) do not share hooks without peer-range work or a web React 19 bump (DEP-19).

Variant 2b, *incremental*: keep the WebView for the long tail and replace only the tab bar and Today first:
- That is `AppLayout.jsx` 124 + `Today.jsx` 112 + `src/components/today` 1,771 = 2,007 LOC (writer `wc -l`).
- New problem: sharing the Base44 token between native screens and the WebView's localStorage. **SUSPECTED** design work.

**Backend replacement.** None. The SDK supports bearer tokens and detects React Native (IOS-17, W5). Gateway acceptance is **SUSPECTED**.

**App Store risk.** 4.2 Low. The 2.5.2 exposure disappears for native screens; it remains for any screen still in a WebView. 5.1.1(v) and 3.1.1 are as in option 1 (the IOS-07 copy fix carries over).

**Auth.**
- SDK `loginViaEmailPassword` → `setToken`, with the token kept in Keychain (needs `expo-secure-store`).
- No refresh API, so the user logs in again when the token expires; the TTL is unknown (U5).
- Turnstile requirements for non-browser clients are unknown.
- Provider sign-in reuses `public/auth/native-return.html` + `recompone://auth` (`nativeAuth.ts:103`).
- No native SIWA sheet (IOS-W2).

**Payments.**
- Reuse the react-native-iap flow (`RecompOneWebView.tsx:185-320`) and call `verifyApplePurchase` with a bearer token (`docs/apple-premium-launch.md:183-186`).
- The appAccountToken must be derived exactly as `base44/shared/appleAppAccountToken.js:22-27` does. It uses `crypto.subtle` (`:23`), which Hermes may need polyfilled (**SUSPECTED**).
- Fix IOS-V1 in the new purchase listener.

**Push.** `expo-notifications` natively for local reminders. Server push is still missing (no sender, no scheduler).

**Android & web.**
- The web app must stay for SEO (B2, 3,438 LOC) and for web users.
- The RN app could also replace the Base44 Android wrapper (+15-25% effort, **SUSPECTED**), which would remove the Base44/Wix Android dependency (B44-09). If not, there are 2 UIs on Android and iOS combined.

**Maintenance burden.**
- 2 UIs (web + RN), so every feature is built twice. The Builder generates web code only, so RN screens are hand-written.
- Shared logic (B1, B8) stays single-sourced in JS, so the fitness engine does not drift: the server's `decideWeeklyCheckIn` runs the same JS engine (`src/lib/fitness/trends.js:1-3`).
- Plus the yearly Expo SDK upgrade.

**Timeline & cost.** 65-110 eng-days, $52k-132k, 4-6 months solo:
- UI port of 20,840 LOC at 250-400 LOC/day.
- 10-15 days of infrastructure.
- 5-10 days of QA.
- Plus ~2 days for the web React 19 bump if hooks are shared (DEP-19).

**Verdict.** The right *next* step if option 1a is rejected under 4.2 or offline logging becomes the top complaint. Not justified for v1.

### 4.3 Option 3 — Native SwiftUI rewrite that leaves Base44

**Reusable code.** ~19% (7,789 LOC), and 0% of the frontend:
- `base44/shared` ~90%, if the new backend is JS/TS.
- Functions ~20%.
- Entity schemas ~50% (as a spec).

**Rewrite scope.**
- 22 screens in Swift (20,840 LOC of UI equivalent).
- 8,167 LOC of client logic ported to Swift; the 345 fitness tests serve as an oracle.
- A new backend and a Swift REST client.

**Backend replacement.** Everything (F-base44 §2.1):
- Auth with email/OTP, Google and Apple. Base44 user ids must be kept (B44-02), and the Apple Services ID may be Base44-owned (B44-12).
- 25 entities with RLS.
- 25 functions.
- 5 InvokeLLM sites, which need an output-parity evaluation.
- Private files: 3 sites, and the SDK has no delete endpoint (B44-04).
- Secrets.
- Bulk data migration; Base44 bulk export is unknown (U22).
- Re-pointing the ASSN URL (`appleStoreNotification/entry.ts:6-8`).
- Re-pointing the web app and the Android wrapper.
- 33 Base44-side unknowns, documented in [03 §10](03-base44-coupling.md#10-unknowns-on-base44s-side-to-export-or-document).

**App Store risk.** 4.2 Low. The real risk moves to the migration: a cutover bug breaks restores for existing subscribers (409 at `verifyApplePurchase/entry.ts:191-194`).

**Auth.** A new provider (Supabase/Clerk). Native SIWA via AuthenticationServices becomes possible. Password-hash exportability is unknown (U3).

**Payments.** StoreKit 2 natively. Port the verifier and webhook (`base44/shared/appleJwsVerify.js` and the purchase/notification domains are pure, §3 B8).

**Push.** APNs natively, plus your own sender and scheduler.

**Android & web.** The web app must be re-pointed to the new backend. Android stays a web wrapper, or becomes a separate Kotlin app.

**Maintenance burden.** 3 stacks: the web JS UI, Swift, and the new backend with its own operations (backups, on-call). The fitness engine is duplicated in Swift and JS (the server runs the JS engine), so drift is likely.

**Timeline & cost.** 123-225 eng-days, $98k-270k, 6-11 months solo. That is the option 4 frontend (95-155) plus a 28-70-day backend exit (W8).

**Verdict.** Rejected. The highest cost, the most unknowns, and it puts every existing subscriber at risk, for no capability that options 2 and 4 cannot also reach.

### 4.4 Option 4 — Base44 as backend only, new native SwiftUI frontend

**Reusable code.** ~28% (11,848 LOC): the whole backend (B8-B10). 0% of the frontend. A variant that runs the 4,417 LOC of pure JS through JavaScriptCore would raise reuse and remove engine drift; feasibility is **SUSPECTED** and was not assessed.

**Rewrite scope.** 22 screens and 20,840 LOC of UI in Swift. 8,167 LOC of client logic in Swift. A Swift REST client for the 22 functions and 15+ entities, including Mongo-style operators (`$gte`, `$set`, `$unset` at `src/lib/planSettings.js:95`, B44-18) and realtime.

**Backend replacement.** None. Calls go to `POST /apps/${appId}/functions/${name}` (`node_modules/@base44/sdk/dist/modules/functions.js:64`) with a bearer token.

**App Store risk.** 4.2 Low.

**Auth.** As option 2, in Swift: bearer token in Keychain, no refresh API, the provider web flow through ASWebAuthenticationSession, and no native SIWA sheet on Base44 (IOS-W2).

**Payments.** StoreKit 2 natively, with `verifyApplePurchase` reused unchanged. Swift must reproduce the SHA-256 appAccountToken derivation byte for byte (`appleAppAccountToken.js:22-27`).

**Push.** APNs natively. The sender and scheduler are still missing on Base44 (U15).

**Android & web.** Web and Android stay on the web UI, so there are 2 UIs in 2 languages.

**Maintenance burden.** 2 UIs in 2 languages, plus a duplicated fitness engine (Swift client, JS server), plus Base44 platform drift: the Builder bumps the SDK on main (B44-05).

**Timeline & cost.** 95-155 eng-days, $76k-186k, 5-8 months solo:
- UI at 200-350 LOC/day.
- 15-25 days to port logic and tests.
- 5-10 days for the REST client and auth.
- 5-8 days for StoreKit 2, speech and camera.
- ~10 days of QA.

**Verdict.** Rejected. It costs more than option 2 and reuses less, and it splits the engine across two languages.

---

## 5. Comparison matrix

All effort, cost and percentage cells are **SUSPECTED** estimates. LOC cells are **VERIFIED** (§3).

| Option | Reuse (all / frontend) | UI LOC to rewrite | Backend change | 4.2 risk | Other App Store exposure | Auth | Payments | Push | Android | UIs to maintain | Eng-days | Cost @ $800-1,200 | Calendar (solo) | Reversible? | Risk to existing subscribers |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1a Expo WebView (recommended)** | 100% / 100% | 0 | None | **Medium** | 2.5.2 via web publish (IOS-18); 5.1.1(v) copy (IOS-07) | Exists (web session + ASWebAuth) | Exists; IOS-V1 fix | Local via expo-notifications (3-5 d) | Unchanged | 1 | 8-14 | $6k-17k | 2-4 weeks | Fully | None |
| 1b Capacitor | 98% / 100% | 0 (shell rewrite) | None | Medium | Same as 1a | Re-plumb | Re-plumb StoreKit plugin | Plugin | Unchanged | 1 | 13-24 | $10k-29k | 3-5 weeks | Yes | Low (re-tested IAP) |
| 1c PWA only | 97% / 100% | 0 | New web-payment entitlement path | n/a (not listed) | No App Store presence | Web | **None** (no web checkout; W10) | Web push needs a SW (none) | Unchanged | 1 | ~10-20 (writer) | ~$8k-24k | 2-5 weeks | Yes | n/a (no iOS IAP; no iOS app to update) |
| 2 RN/Expo on Base44 | 51% / 31% | 20,840 | None | Low | 2.5.2 only for screens left in a WebView | SDK bearer + Keychain; no refresh | Reuse react-native-iap + verifier | Native local | Can replace the Base44 wrapper (+15-25%) | 2 (web + RN) | 65-110 | $52k-132k | 4-6 months | Partly | None if token derivation kept |
| 3 SwiftUI + new backend | 19% / 0% | 20,840 | **Full exit** (28-70 d) | Low | Cutover risk | New provider; ids must be kept | StoreKit 2 + ported verifier | APNs + own sender | Web wrapper re-pointed | 2 + new backend | 123-225 | $98k-270k | 6-11 months | No (one-way data move) | **High** unless Base44 ids preserved (B44-02) |
| 4 SwiftUI on Base44 | 28% / 0% | 20,840 | None | Low | — | As 2, in Swift | StoreKit 2 + existing verifier | APNs; no sender | Unchanged | 2 (2 languages) | 95-155 | $76k-186k | 5-8 months | Partly | None if derivation exact |

Ranking for v1: **1a > 1b > 2 > 4 > 3**, with 1c not a standalone iOS answer. 1b ranks second only as a costlier route to the same app as 1a. It should not be chosen.

---

## 6. Recommendation

**Stay on Base44. Ship option 1a: the existing Expo WebView shell, hardened, through TestFlight to App Review.** Staying on Base44 is the right answer for v1.

Why:
1. **The hard native parts are done and match what Apple checks first.**
   - StoreKit purchase, restore and finish, with server verification and ASSN V2 (§2.2 rows 2-3).
   - Sign in with Apple next to Google (IOS-06).
   - In-app deletion (IOS-07).
   - A compliant paywall (IOS-08).
   - Native speech capture (§2.2 row 4).
2. **The gap to submission is 8-14 engineer-days**, against 65-225 for any rewrite. Most of it is bug or config work that every option would need anyway: IOS-V1, IOS-V2, IOS-19, IOS-07.
3. **One UI codebase is the team's main asset.**
   - One human committer made 157 of 280 commits on main between 2026-07-09 and 2026-10-23 (aaronjcole 120 + Aaron Cole 37); base44-builder[bot] made 109 more (`git log origin/main --format=%an`, writer ran).
   - Every alternative creates a second UI that the Builder cannot generate.
4. **The fallback is cheap and keeps everything that matters.**
   - Option 2 keeps the Base44 backend, the bundle id, the ASC app, the verifier and ~60% of the shell.
   - Moving later is an app update, not a migration.
   - Options 3 and 4 are never better than option 2 here: they lose the single-sourced JS fitness engine and cost more.

Decision gates. Move to option 2, starting with variant 2b (native tab bar + Today), if any of these happens:
- App Review rejects under 4.2 after the native additions in §8.
- TestFlight or early users name offline logging, or "feels like a website", as a top complaint.
- A retention lever that a bridge cannot deliver becomes a priority (widgets, background HealthKit sync).

Consider option 3 only if Base44 itself becomes untenable (pricing, outage, policy). Even then, migrate the backend first with ids preserved ([03](03-base44-coupling.md)) and keep the UI choice separate.

---

## 7. Strongest argument against the recommendation

Steelman: **"Option 1a optimises for the cheapest path to a rejection, or to a mediocre app, and only delays a native build that will cost more later."**

1. **4.2 is a coin Apple flips, and this app gives Apple every reason to reject.**
   - Every screen is the live website (`RecompOneWebView.tsx:407`), and the same URLs open in Safari.
   - A cold offline launch shows only an error card (IOS-05).
   - There are no notifications, no native haptics, no widgets and no HealthKit.
   - Apple's own words, "elevate it beyond a repackaged website", describe this binary.
   - A rejection lands after the TestFlight and ASC work, and the native build then happens under deadline anyway.
2. **The core use case is the WebView's weakest scenario.**
   - Body-recomposition tracking means logging sets and meals in gyms, often on bad connectivity.
   - The app says so itself: "You're offline — changes are not saved." (`src/components/OfflineBanner.jsx:23`).
   - On a flaky connection a signed-in user is bounced to the login screen (FE-V1), and the splash waits on the backend with no timeout (FE-16).
   - A native app with local persistence fixes this structurally. The web path needs a service worker and an IndexedDB queue (5-8 days) on an origin the team does not control, where the service worker itself is **SUSPECTED** feasible.
3. **Delay makes option 2 more expensive.**
   - The Builder made 109 commits to main in ~3.5 months. The web UI that a port must rewrite is already 20,840 LOC and grows with every feature.
   - If a native app is inevitable for a subscription fitness product, the cheapest time to start is now.
4. **iOS quality is tied to the least-controlled pipeline in the repo.**
   - The Builder pushes straight to main (B44-03), and CI has been red on every main push since 2026-10-21, #531 (IOS-10).
   - The shell loads production with no staging origin (`bridgeProtocol.ts:4`), and a web publish changes the iOS app instantly, without review (IOS-18).
   - A native app would put a review gate and a versioned binary between Builder output and iPhone users.
5. **The native tax gets paid anyway, piecemeal.**
   - Haptics, notifications, HealthKit and transaction recovery each need a bridge message, a binary and a review.
   - Each bridge widens a fragile contract built on a borrowed Wix global name (`injectedBridge.ts:60-72`).
6. **Vendor exposure compounds.**
   - Base44 owns hosting, auth, the Android wrapper (B44-09), possibly the Apple Services ID (B44-12), and the analytics default (B44-01).
   - Shipping iOS on top deepens all of it.

Why it still does not flip the recommendation:
- **The downside of 1a is bounded:** 8-14 days, and the work is reusable. IOS-V1, IOS-V2, IOS-19, IOS-07 and the CI fixes are needed by every option.
- **The downside of starting option 2 now is 65-110 days before any user or reviewer feedback**, on an app with no evidence yet that offline logging or "feel" drives churn.
- **Rejection is recoverable.** Variant 2b replaces only the tab bar and Today (~2,007 LOC) inside the same Expo project and the same ASC app.
- Points 4 and 6 are real, but they are fixed by process (a CI gate on publish, IOS-18) and by your own OAuth clients (B44-12). A rewrite does not fix them.

---

## 8. Preconditions / next steps

In order. Effort per the cited finding; the sum is the option 1a estimate.

| # | Step | IDs | Effort (eng-days) | Tag of underlying issue |
|---|---|---|---|---|
| 1 | Make CI meaningful: run doctor with the dependency check skipped (or as a non-blocking scheduled job); rewrite `dependencySecurity.test.ts` for xcode 4 and land #196; add `esbuild` as a devDependency; then confirm the e2e `ios-bridge.spec.js` runs | IOS-10, DEP-02, DEP-24, DEP-01 | 0.25-0.5 | **VERIFIED** |
| 2 | Confirm the `APPLE_BUNDLE_ID` secret; set `APPLE_SANDBOX_ALLOWED_USER_IDS` to the testers and the App Review demo account | IOS-V2, IOS-19 | 0.1-0.25 | **SUSPECTED** / **VERIFIED** |
| 3 | Deliver unsolicited StoreKit transactions to the web, or silent-restore on launch | IOS-V1 | 0.5-1 | **VERIFIED** |
| 4 | Deletion dialog and `/delete-account`: Apple billing notice and "Manage subscription" link; ask Base44 about SIWA token revocation | IOS-07 | 0.25-1 | **VERIFIED** |
| 5 | Remove the false "Available on the App Store." claim; set `supportsTablet: false`; add origin guards on IAP injection; fix the README token claim | IOS-09, IOS-13, IOS-15, IOS-14 | 0.25-0.5 | **VERIFIED** |
| 6 | Disable SDK analytics, or declare it in App Privacy | B44-01 | 0.1 | **VERIFIED** |
| 7 | Boot failure ≠ signed out; per-tab error boundaries | FE-V1, FE-02 | 0.5-1 | **VERIFIED** |
| 8 | expo-haptics bridge; wire `MEAL_LOGGED` | IOS-04 | 0.5-1 | **VERIFIED** |
| 9 | Local reminders via expo-notifications plus a bridge (and delete or keep `registerPushToken`, deliberately) | IOS-03 | 3-5 | **VERIFIED** |
| 10 | Check the generated privacy manifest in the IPA | IOS-W1 | (in #11) | **SUSPECTED** |
| 11 | App Store Connect: subscription group, App Privacy label (consistent with step 6), screenshots (iPhone only after step 5), App Review notes listing the native features, demo account | IOS-12 | 1-2 | **SUSPECTED** (ASC state) |
| 12 | EAS rebuild, then TestFlight; run `docs/expo-ios-branch.md:137-150` steps 1-7 on a physical device, including step 6 (redelivery) and Ask-to-Buy | IOS-12, IOS-V1 | 1-2 | **SUSPECTED** (device) |
| 13 | Process: no Base44 publish unless CI is green on that commit; keep paywall and IAP changes behind a shell version check | IOS-18 | <1 | **SUSPECTED** |
| | **Total** | | **~7.5-14.5 → 8-14** | |

After launch, and not blocking it:
- **IOS-05:** service worker plus offline write queue (5-8 days).
- **DEP-16:** Expo SDK 58 upgrade (2-3 days).
- **B44-10:** `APP_ORIGIN` from EAS config.
- **HealthKit read-only:** its own design review (`docs/features/reminders-and-integrations.md:129`).
- **IOS-17:** a token-TTL/Turnstile spike, only when the option 2 decision gate trips (<1d).

---

## 9. Assumptions

| Assumption | Value | Basis | Tag |
|---|---|---|---|
| Day rate | $800-1,200 per engineer-day (contractor); founder time costed at the same rate | G-ios §4 | **SUSPECTED** |
| Team | 1 full-time engineer (the owner), with the Base44 Builder for web changes | 157 of 280 main commits by one human, 110 by Builder bots, 13 by Dependabot (`git log origin/main --format=%an`) | **VERIFIED** (history) / **SUSPECTED** (future staffing) |
| Calendar | Solo, full-time, ~21 working days per month, plus buffer; excludes App Review turnaround, Base44 export lead time and the Play upload-key reset | G-ios §4, F-base44 §2.1 | **SUSPECTED** |
| RN port rate | 250-400 LOC/day of the 20,840 UI LOC, plus 10-15 days infra and 5-10 days QA | G-ios §4 | **SUSPECTED** |
| SwiftUI rate | 200-350 LOC-equivalent/day, plus 15-25 days logic port, 5-10 days REST client and auth, 5-8 days StoreKit 2/speech/camera, ~10 days QA | G-ios §4 | **SUSPECTED** |
| Backend exit (option 3) | 28-38 days (F-base44 line items, Supabase target) to 40-70 days (G-ios, incl. web/Android re-pointing); union 28-70 used | W8 | **SUSPECTED** |
| Error bars | ±40% on every estimate | G-ios §4 | **SUSPECTED** |
| EAS build allowance | Docs report 15 free iOS builds per month, 0 used before build 6 | `docs/features/nutrition-integration.md:81` | **SUSPECTED** |
| Apple Developer Program, Base44 plan cost | Not modelled; Base44 quotas and billing are unknown (U23) | — | **SUSPECTED** |
| Bundle id and ASC app | Kept in every option | `app.json:14`, `appleAppAccountToken.js:1`, `eas.json:27` | **VERIFIED** |

---

## 10. Could not assess

- **App Review outcome.** 4.2 is discretionary. "Medium" is a judgement from §2.4, not a fact.
- **EAS and App Store Connect state.** Build 6, any TestFlight upload, the subscription group, the ASSN V2 URL configuration, App Privacy answers. Needs EAS and ASC access. All **SUSPECTED**, from the docs.
- **Base44 secrets and platform behaviour.**
  - `APPLE_BUNDLE_ID`, `APPLE_SANDBOX_ALLOWED_USER_IDS` and `PREMIUM_TESTER_EMAILS` values.
  - Whether `User.delete` revokes SIWA tokens.
  - Access-token TTL and refresh; Turnstile for non-browser clients.
  - Whether the gateway accepts bearer calls from native clients.
  - CORS for bundled origins.
  - Publish mechanics (IOS-18).
  - Whether a service worker can be registered on the Base44 host.
  - Whether the Android wrapper calls `registerPushToken`.
  - These need the Base44 dashboard or vendor answers (U4, U5, U10, U12, U15, U17).
- **Live hosting of `/auth/native-return.html`.** The sandbox proxy refused the host, so static serving versus SPA fallback is unverified.
- **On-device behaviour.** Not tested; needs a physical iPhone and iPad:
  - StoreKit sheet, Ask-to-Buy, launch-time redelivery (IOS-V1).
  - ASWebAuthenticationSession return; Apple and Google sign-in through Base44.
  - getUserMedia barcode preview and Web Share with files in WKWebView.
  - IndexedDB persistence across updates.
  - iPad orientation.
  - Speech audio routing.
- **The shipped IPA.** `expo-ios/node_modules` is not installed, so expo-doctor and the shell typecheck were not re-run locally. The generated Info.plist (incl. `UISupportedInterfaceOrientations~ipad`) and `PrivacyInfo.xcprivacy` (IOS-W1) were not inspected. No Metro bundle was produced to confirm that the audit findings are build-time only (IOS-11).
- **Whether `EXPO_OFFLINE=1` or the skip flag makes every doctor check pass in CI.** No Expo API access here; C-deps' local run failed 2 network checks.
- **Hermes support for `crypto.subtle`** (option 2 appAccountToken derivation), **React Native compatibility of `@base44/sdk` 0.8.57 at runtime** (axios, socket.io-client, partysocket), and **JavaScriptCore reuse** for option 4: not tested.
- **Reuse percentages and every effort, cost and calendar figure.** Estimates from stated rates, not measurements. Only the LOC and the arithmetic were re-checked.
- **Upstream breaking changes:** react-native-iap 17 and Expo SDK 58 changelogs were not read (DEP-16).
- **Apple guideline text for 4.2.2, 3.1.1, 2.5.6 and 2.3.10.** Carried from the G-ios author's fetch; the G-ios verifier re-matched 4.2, 5.1.1(v), 2.5.2, 4.8 and the account-deletion page. The writer did not re-fetch any Apple page.
- **iOS web push and PWA capabilities (option 1c).** External platform behaviour, not verified here.
