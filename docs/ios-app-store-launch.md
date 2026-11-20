# iOS App Store launch: who does what

The path from the current `main` to RecompOne live on the App Store, split between
**you** (anything that needs your Apple, Expo or Base44 login, or a real iPhone) and
**Claude** (anything that a cloud session can run once it has a token and network access).
Work top to bottom. The background is in [apple-premium-launch.md](apple-premium-launch.md),
[deploy-1-5.md](deploy-1-5.md), [release-checklist.md](release-checklist.md) and
[expo-ios/README.md](../expo-ios/README.md).

Fixed identifiers: bundle ID `com.base6a68bb922bf88da5ec767da3.app`, App Store Connect app
`6803546092`, EAS project `@promptlabllc/recompone-app`.

## November 20, 2026 readiness review

Reviewed current `main` at `a017ead`, not the October checkout. Fixed the generated MFA
components' missing UI imports and JavaScript typing errors using the existing adaptive select;
this does not enable or change the deployed MFA policy. Removed the disabled Lifestyle Coach
from the current Premium purchase promises. Apple refund/revocation handling now ignores an
older subscription period when a newer paid period is recorded, and a genuinely newer signed
renewal can restore access without replaying the refunded period.

Verification: 869 unit/security/contract tests, 222 browser scenarios, and 8 targeted MFA/paywall
checks pass. Root lint, root and native TypeScript, the configured production build, 19 native
tests, and all 21 offline Expo Doctor checks pass. Root dependency audit has zero advisories;
the native tooling dependency tree still has three advisory entries (@expo/cli/zod and
node-forge), which are not native runtime purchase code. Do not force an incompatible Zod
major upgrade into Expo to suppress its audit report.

The owner accepted the updated Apple Developer Program agreement in the browser; its account
warning disappeared. App Store version 1.0 is still Prepare for Submission, with no attached
build, empty support/reviewer fields, and automatic release selected at inspection. Five existing
screenshots and both subscription product IDs are present. Privacy/compliance, reviewer access,
subscription review details, native device acceptance, and final submission remain release gates.

EAS reports build 6 as the latest completed archive, built October 20 from `7e6e81c`; it predates
the iPhone-only setting on current main. November allowance was 0 of 15 included iOS builds used
and no overages. A new archive must use remote auto-increment, existing credentials, and the
existing app/project identifiers. No public submission or release is implied by a build/upload.

## 0. Unblock the cloud session (you, about 10 minutes)

A cloud session can't sign in to Apple or Expo through a browser. Its network policy also
blocks Expo, App Store Connect and the live app.

- [ ] Environment settings (cloud environment menu → Edit → Network access): allow
      `api.expo.dev`, `exp.host`, `storage.googleapis.com` (EAS project upload),
      `api.appstoreconnect.apple.com` and `recomp-iq.base44.app`.
- [ ] Create an Expo access token, preferably for a robot user on the `promptlabllc` account.
      Add it in the same settings as the environment variable `EXPO_TOKEN`. Never paste it into chat.
- [ ] Make sure EAS has an App Store Connect **Team** API key with the App Manager role, for uploads.
      Add it on your Mac with `npx eas-cli credentials` so the `.p8` never enters the container.
      The key in the Base44 secrets is for the App Store Server API and is probably an In-App
      Purchase key, which can't upload builds.
- [ ] Start a **new** session. Environment changes don't reach a running one.

## 1. Decisions only you can make (tell Claude before the build)

- [ ] **Is any version of app `6803546092` already on the App Store** (for example from Base44's
      own wrapper)? If yes, `version` in `expo-ios/app.json` (currently `1.0.0`) must go above it.
      Also, if that version ran natively on iPad, App Store Connect rejects an update that drops
      iPad, so `supportsTablet` would have to go back to `true`.
- [x] **iPad: dropped.** `supportsTablet` is `false`, so the app is iPhone-only and no iPad
      screenshots are needed. iPads can still run it in iPhone compatibility mode, and App Review
      may test it that way.
- [ ] **Photo scans:** keep `ENABLE_FOOD_PHOTO_SCAN` and `ENABLE_BODY_COMPOSITION_SCAN` off for
      launch unless their privacy review is done. Whatever is on has to be declared in App Privacy.

## 2. App Store Connect (you, in a browser on your Mac)

- [ ] **Business:** the Paid Apps agreement is active and tax and banking are complete (account
      holder only). Until then StoreKit returns no products, even in the sandbox.
- [ ] **Subscriptions:** in one group, `recompone_premium_monthly` at $4.99 and
      `recompone_premium_annual` at $39.99 with a 14-day free-trial introductory offer. Each needs a
      display name, a description and a review screenshot, and must reach *Ready to Submit*.
- [ ] **Server notifications:** set the Production and Sandbox URLs to
      `https://recomp-iq.base44.app/functions/appleStoreNotification`, Version 2. Then use
      *Request a Test Notification* and confirm the Base44 log shows a 200.
- [ ] **Sandbox tester:** create one in Users and Access → Sandbox. Use a fresh one to test the trial.
- [ ] **App Privacy:** declare what the app actually collects, matching `/privacy`: email, health and
      fitness entries, AI Coach messages, purchase history, user ID, and photos if a scan is on.
      None of it is used for tracking.
- [ ] **Age rating:** answer for the free-form AI Coach and the nutrition and training guidance.
- [ ] **Version page:**
  - Screenshots: 6.9" iPhone only (the app is iPhone-only).
  - Description and keywords.
  - Support URL `https://recomp-iq.base44.app/support` and privacy URL `https://recomp-iq.base44.app/privacy`.
  - A Terms of Use link (`/terms`) in the description, or the custom EULA field. Guideline 3.1.2
    requires this for auto-renewing subscriptions.
- [ ] **App Review information:**
  - A permanent demo account. Don't rely on the tester-email bypass, because the reviewer has to
    be able to make a real sandbox purchase.
  - Notes: sign-in options, the paywall at More → Premium features, that core tracking is free,
    and account deletion at More → Account deletion.
  - List the native features: StoreKit, the system sign-in sheet, barcode camera and voice input.

## 3. Base44 dashboard (you)

- [ ] Confirm steps 1–4 of [deploy-1-5.md](deploy-1-5.md) are done in production, in order. That
      includes `verifyApplePurchase` republished with `appleJwsVerify.js`.
- [ ] **Secrets:**
  - `APPLE_BUNDLE_ID` is exactly `com.base6a68bb922bf88da5ec767da3.app`.
  - `APPLE_ISSUER_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` are set.
  - `APPLE_SANDBOX_ALLOWED_USER_IDS` holds your testers' Base44 user IDs **and the demo
    account's**. While it is unset, every sandbox purchase grants Premium.
- [ ] Republish `verifyApplePurchase` after changing secrets. Functions read secrets only when they start.
- [ ] Name a primary and a backup owner for the `AiContentReport` moderation queue.

## 4. Build and TestFlight (Claude, after step 0; each step waits for your OK)

- [ ] Run `eas whoami` and `project:info`, and check that the distribution certificate and
      provisioning profile are valid.
- [ ] Run `eas account:usage promptlabllc` and confirm the build allowance or cost with you.
- [ ] Run `eas build --platform ios --profile production --freeze-credentials --non-interactive`.
- [ ] With your go-ahead, run `eas submit --platform ios --latest` to upload to TestFlight.
- [ ] Run `npm run test:e2e:deployed` and `npm run verify:android:live` against production.

## 5. Test on a real iPhone with the TestFlight build (you)

- [ ] Continue with Google and Continue with Apple open the system sheet and finish signed in on
      the starting page. Cancelling the sheet returns to the login page.
- [ ] Email sign-up, the one-time code, login and logout all work inside the app.
- [ ] The paywall shows StoreKit prices in local currency, and a fresh sandbox Apple ID sees the trial.
- [ ] A monthly purchase unlocks Premium, and a `PremiumEntitlement` row with source `apple_store`
      and status `active` appears.
- [ ] After a delete and reinstall, Restore Purchases brings Premium back.
- [ ] Ask to Buy (an interrupted purchase) releases the paywall within about 30 s with the waiting
      message. A second tap doesn't say "already in progress".
- [ ] Expiring and then refunding in the sandbox moves the entitlement to `expired`, then `revoked`.
- [ ] The barcode camera preview works, and denying the camera permission is handled.
- [ ] Voice meal input handles grant and deny, Stop and Cancel.
- [ ] Launching offline shows the "Try again" screen.
- [ ] More → Account deletion removes a throwaway account.
- [ ] Take the review screenshot of the paywall showing both prices and Restore Purchases.
- [ ] If you have an iPad, open the app there once. It runs in iPhone compatibility mode, which
      App Review may use, so sign-in and the paywall should still work.

## 6. Submit (you click it, or Claude runs it through EAS with your OK)

- [ ] On the version page, attach the tested build and both subscriptions. The first
      subscriptions must go out with an app version.
- [ ] Choose **manual release** so you decide when it goes live, then submit for review.

## 7. Release day (you)

- [ ] Clear `PREMIUM_TESTER_EMAILS` and revoke the `source: tester` records that shouldn't survive.
      Do this after approval, not before review.
- [ ] Release the version.
- [ ] Set `VITE_APP_STORE_URL` to the `apps.apple.com` listing and republish the frontend.
- [ ] Watch the `verifyApplePurchase` and `appleStoreNotification` logs for the first real purchases.

## Most likely reasons for rejection

- **4.2 Minimum functionality.** The app is a WebView shell around the hosted web app. The native
  StoreKit, sign-in sheet, camera and voice input are the counter-argument, so state them plainly
  in the review notes.
- **2.1 App completeness.** The reviewer's sandbox purchase fails because the demo account isn't in
  `APPLE_SANDBOX_ALLOWED_USER_IDS`, the Paid Apps agreement isn't active, or a subscription
  isn't attached to the version.
- **3.1.2 Subscriptions.** The Terms of Use link is missing from the metadata. The in-app terms,
  Restore control and auto-renewal text already exist.
