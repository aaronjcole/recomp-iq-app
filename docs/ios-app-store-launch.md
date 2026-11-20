# iOS App Store launch: who does what

The path from the current `main` to RecompOne live on the App Store, split between
**you** (anything that needs your Apple, Expo or Base44 login, or a real iPhone) and
**the coding agent** (verification, release preparation, and authorized uploads).
Work top to bottom. The background is in [apple-premium-launch.md](apple-premium-launch.md),
[deploy-1-5.md](deploy-1-5.md), [release-checklist.md](release-checklist.md) and
[expo-ios/README.md](../expo-ios/README.md).

Fixed identifiers: bundle ID `com.base6a68bb922bf88da5ec767da3.app`, App Store Connect app
`6803546092`, EAS project `@promptlabllc/recompone-app`.

## November 20, 2026 readiness review

### Premium price-loading follow-up

Removed the native paywall's purchasable USD fallback. StoreKit prices now load
with a 12-second overall web deadline, explicit Retry, late-bridge detection and
stale-response protection. Native startup/paywall lookups coalesce with a
9-second deadline; failures and empty results can retry. Trial eligibility runs
separately and cannot block prices; unknown eligibility never advertises a trial.
The native changes require a replacement TestFlight binary. A real-device price,
purchase, verification and Restore test is still required; automated mocks do not
prove Apple's product configuration or the phone's connection works.

The broad security run also found a stale assertion expecting a draggable mobile
selector. Updated it to protect the stationary dialog fix already confirmed by
the owner; no selector behavior was changed in this follow-up.

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

Fixes were pushed to `main` as `54df608`; the owner confirmed publishing them in Base44.
Both signed-out deployed smoke checks passed again after that publication. Authenticated
production purchase and photo flows have not been proven by these public smoke checks.

The owner accepted the updated Apple Developer Program agreement; its warning disappeared.
The separate **Paid Apps Agreement remains unsigned** in App Store Connect Business. The owner
must review/sign it and complete any tax/banking requirements; the agent must not accept it.

Saved App Store draft changes: support URL; subscription disclosure and Terms/Privacy links in
the description; accurate app and subscription review notes; approved private review contact;
manual release instead of automatic release; and US-only app availability. Game Center is off.
Privacy/deletion URLs now point to the actual Base44-hosted routes. Five existing screenshots
and both subscription product IDs are present. Subscription review screenshots, a permanent
reviewer login, age/content-rights declarations, and privacy label reconciliation remain.
With the owner's explicit confirmation, Apple saved the declaration that this app is not a
regulated medical device in any country or region. The current label omits Purchase History
despite server-stored subscription records;
its existing SDK/diagnostic categories also need verification rather than blind removal.

iPhone-only version 1.0.0 **build 7** completed using existing credentials and the included
November allowance (0/15 used before this build):

- EAS build: `5e80ba49-40ad-446b-aeb6-a43040b3d98b`, source `54df608`.
- Private upload: `02868961-5916-496f-aac1-203ce54e3efd`, finished November 20.
- App Store Connect visibly lists build 7 as **Processing**; no build is attached to the draft
  version, no tester group was added, and no public App Review submission/release was performed.

The owner requests **both AI photo scans for launch**, not their removal. They have not been
enabled by this review. Account deletion currently removes AnalysisUpload records but cannot
delete their private stored files, losing the references needed for provider-assisted deletion.
Base44's current [media guidance](https://docs.base44.com/Building-your-app/Using-media#removing-live-app-uploads)
directs developers to Customer Care for deletion of live-app uploads. Before enabling, establish
a verified deletion/retention process, align consent and privacy statements (including the
inference provider), reconcile Apple's disclosures, and test against isolated data.

With the owner's permission, Base44 Support ticket **#6b004c48** was opened from the workspace
containing RecompOne and visibly marked **Handled by a support specialist**. The request asks
for supported private-file deletion after analysis/account deletion, storage/backup/inference
retention periods, and a documented API or Customer Care workflow/SLA. A follow-up asks about
model-training use, opt-out, and subprocessor controls. Only the app name/ID and generic platform
questions were sent, with no files, health records, or credentials, and an explicit request not
to access user records. A substantive human answer is still pending; do not treat the initial
automated reply as verified retention or training-policy confirmation. No scan release flag was
changed during this work; verify deployed flag values and keep the features gated until cleared.

## 0. Unblock the cloud session (you, about 10 minutes)

This historical section applies only to a restricted cloud runner. The current desktop session
already has authorized Apple browser and Expo access; do not create new tokens or keys for it.

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

## 1. Decisions only you can make (tell the agent before the build)

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

## 4. Build and TestFlight (agent, with the owner's authorization)

- [ ] Run `eas whoami` and `project:info`, and check that the distribution certificate and
      provisioning profile are valid.
- [ ] Run `eas account:usage promptlabllc` and confirm the build allowance or cost with you.
- [ ] Run `eas build --platform ios --profile production --freeze-credentials --non-interactive`.
- [ ] With your go-ahead, run `eas submit --platform ios --id <verified-build-id>` to upload
      that exact archive privately. Do not rely on `--latest` or auto-submit for App Review.
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

## 6. Submit (you click it, or the agent uses App Store Connect with your OK)

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
