# RecompOne Premium — testing and launch runbook

This is the source of truth for Premium access while the app is in testing and for the transition to a paid launch. The implementation is deliberately fail-closed: seeing a Premium card never grants access, and an unavailable entitlement check leaves every Premium feature locked.

## What is available now

| Feature | Route | Individual product ID | Data handling |
|---|---|---|---|
| Adaptive weekly meal plan + grocery list | `/nutrition/meal-plan` | `adaptive_meal_plans` | Server-generated from the signed-in user's current targets and recent progress. |
| Adaptive 4–6 week training block | `/training/plan` | `adaptive_training_blocks` | Server-generated from schedule, equipment, recent sessions, and recovery signals. |
| Weekly Autopilot Review | `/today/autopilot` | `weekly_autopilot` | Server-generated seven-day scorecard with one prioritized next action. |
| Visual progress tools | `/progress/visual-check` and Progress | `visual_progress_checks` | On-device comparison plus an optional, deploy-enabled AI body-composition range. The AI flow uses private uploads, five-minute signed links, server-side entitlement checks, and no medical claim. |

The all-in-one product ID is `recompone_premium`. It unlocks all four features. The individual product IDs above are already supported so pricing can later be bundle-only, add-on-only, or a mixture without changing feature gates.

## Give an account testing access

### Option A — env var (recommended for early testing)

Set the `PREMIUM_TESTER_EMAILS` app Secret in Base44 to a comma-separated list of account email addresses. Any signed-in user whose email matches receives full bundle tester access without a database record. The check is server-side and transparent in `getPremiumAccess/entry.ts`.

```text
PREMIUM_TESTER_EMAILS=you@example.com,teammate@example.com
```

**Clear this Secret before the production launch.** Removing it (or setting it to an empty string) silently falls through to the database path and no access is granted.

### Option B — admin dashboard record

In the Base44 data dashboard, create one `PremiumEntitlement` record:

```text
owner_id: <the tester's Base44 User ID, not email>
product_id: recompone_premium
source: tester
status: active
expires_at: <optional ISO date-time; omit for access until revoked>
```

Use the bundle record for internal testing so every feature is available. To test an individual add-on, use its product ID instead. `PremiumEntitlement` is admin-owned; ordinary clients cannot create, read, update, or delete these records directly.

Test the following states before launch:

1. No entitlement: all four catalog cards remain visible and say they are locked.
2. Active bundle tester entitlement: all four cards say `Access granted · available now` and open their feature routes.
3. Active individual entitlement: only its mapped feature opens.
4. Revoked, expired, malformed, or unknown entitlement: access fails closed.
5. Entitlement service failure: the catalog reports that status is unavailable and all features remain locked.

## Launch cutover

Before the production launch:

1. Clear `PREMIUM_TESTER_EMAILS` from Base44 app Secrets and revoke or expire every `source: tester` DB record that should not survive launch.
2. Keep the current server and client checks in place. Do not replace them with a build-time flag or client-only unlock.
3. Create the Google Play subscription described in [Draft: Google Play subscription terms](#draft-google-play-subscription-terms-not-shown-in-the-app): one subscription `recompone_premium` with monthly and annual base plans. The individual add-on IDs above stay in the domain model for later and need no Play products at launch.
4. Wire up the `verifyGooglePlayPurchase` backend function (already scaffolded at `base44/functions/verifyGooglePlayPurchase/entry.ts`):
   - Set the `PLAY_PACKAGE_NAME` Secret to your Android package name.
   - Create a Google service account with the Android Publisher API scope, download the JSON key, and store it as the `GOOGLE_PLAY_SA_JSON` Secret.
   - In the native Android layer, call `base44.functions.invoke("verifyGooglePlayPurchase", { purchaseToken, productId })` after a successful Google Play Billing purchase. This validates the token server-side and writes a `source: google_play` entitlement.
   - Google Play sends a Real-Time Developer Notification (RTDN) on each subscription change. Add a webhook handler that re-reads the subscription from the Android Publisher API before changing anything:
     - **Cancellation** (`SUBSCRIPTION_CANCELED`): Premium stays active until Google's expiry time. The paywall copy promises access to the end of the paid period, so do not revoke here.
     - **Expiry** (`SUBSCRIPTION_EXPIRED`): set `status` to `"expired"`.
     - **Revocation, refund or voided purchase**: set `status` to `"revoked"`.
5. Test purchase, pending, cancellation, restore, refund, reinstall, account switch, offline, and service-failure states with Play license testers.
6. Update the Play listing, Terms, Privacy Policy, and Data Safety answers before advertising Premium.

Recommended first commercial shape: one all-in-one Premium product. The individual IDs should remain available in the domain model, but launching a single bundle gives users a simpler promise and creates fewer billing and support edge cases. Add-on pricing can be introduced after real usage shows that users understand and value a feature independently.

## Platform blockers — do not route around these

### Google Play Billing

The entitlement model is ready, but it intentionally does not invent a purchase bridge. Base44 documents that its mobile app is a secure WebView and that digital goods in mobile apps require Apple/Google native billing; Base44 also says built-in StoreKit/Google Play Billing support is still being developed. Do not use Stripe or trust a browser callback to unlock Premium inside the Android app.

Confirm Base44's supported billing bridge before implementation. This is a Section 3.D platform-gated item and requires founder approval plus device/license-tester verification.

Reference: [Base44 — Uploading your app to app stores](https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores)

### Draft: Google Play subscription terms (not shown in the app)

**Status: specification only.** Nothing below renders anywhere.

On Android today, `paywallPurchasePath` returns `"unavailable"` (`src/lib/premiumPlans.js`). The paywall then shows:
- the plan cards with reference USD prices and a disabled "Coming soon" button;
- no store name and no trial promise;
- no billing terms and no restore control.

`docs/android-play-release.md` says nothing about subscriptions may be advertised in the Android app until Google Play Billing, its disclosures and its entitlement flow ship. The reference prices are still a soft form of advertising, so decide whether the Premium page should be shown in the Android app at all before release. The text below is for the billing work.

#### Proposed paywall copy

Replace each `{…}` with the values configured in Play Console. Show the trial sentences only to accounts that Google Play reports as eligible for the trial offer.

> RecompOne Premium is an auto-renewing subscription, billed {monthly | yearly} through Google Play at {localized price} per {month | year}. {If trial: Your {N}-day free trial starts today; your Google Play payment method is charged {localized price} on {trial end date} unless you cancel before then.} {Otherwise: Google Play charges your payment method when the purchase completes.} The subscription renews automatically at the end of each billing period until you cancel. Cancel anytime in Google Play: open the Play Store, tap your profile picture, then **Payments & subscriptions → Subscriptions → RecompOne**. When you cancel, you keep Premium until the end of the current billing period and are not charged again. Uninstalling the app does not cancel your subscription. Food, workout, sleep, habit, and progress tracking remain free without a subscription.
>
> [Manage subscription] · [Terms of Use] · [Privacy Policy]

**Manage subscription** should deep-link to the Play subscriptions center for this product: `https://play.google.com/store/account/subscriptions?sku=recompone_premium&package=com.base6a68bb922bf88da5ec767da3.app`. The package name comes from `android/play-release.json` and must stay the same for the life of the Play listing (`docs/android-play-release.md`). An Android build that leaves the Base44 wrapper should keep this package. A different package is a separate Play app, and existing subscriptions would not carry over to it.

#### What each part discloses

Google's 2020 announcement of its subscriptions policy ([Android Developers Blog](https://android-developers.googleblog.com/2020/04/building-user-trust-through-more.html)) asks the offer to state the following clearly and accurately. Confirm these against the current policy; see "Verify before launch".

| Requirement | Covered by |
|---|---|
| Whether a subscription is needed for all or part of the app | "Food, workout, sleep … remain free" (also on the paywall today) |
| Price and billing frequency | "billed {monthly \| yearly} … at {localized price} per {period}" |
| Trial duration, price, what's included, when it converts to paid | The trial sentence: length, the date of the first charge and its amount; "Premium" is the whole bundle |
| How to cancel or manage | The Play Store path and the Manage subscription link |

Additional points users act on. These are attributed to [Google Play Help](https://support.google.com/googleplay/answer/7018481) but were not checked against that page while drafting:
- access continues until the end of the paid period after cancelling;
- uninstalling does not cancel.

**Deliberate differences from the Apple text:**
- The Apple text promises renewal charges within 24 hours before the period ends and a cancellation cut-off 24 hours before. Neither appears here: those timings come from Apple's disclosure. Confirm Google Play's renewal and cut-off timing before adding any.
- Billing goes to the "Google Play payment method", not an Apple ID.
- Cancellation happens in the Play Store, not in Apple ID settings.

#### When Google Play Billing is implemented
1. **Products.** Create one Play subscription with ID `recompone_premium`, with base plans `monthly` and `annual`, and, if it should match iOS, a 14-day free-trial offer on `annual`. `verifyGooglePlayPurchase` already accepts only IDs from `PREMIUM_PRODUCTS`, which includes `recompone_premium`, so a separate subscription per plan would be rejected.
2. **Paywall.** Make bridge detection platform-specific, then add a `"play"` case to `paywallPurchasePath`.
   - **Why the detection must change first:** `hasNativeIapBridge` (`src/lib/nativeIapBridge.js`) treats any `wixMobileNativeBridge` that has `requestPurchase` / `restorePurchases` / `finishTransaction` as StoreKit, and the Android wrapper injects that same global. A Play bridge with the same method names would be treated as Apple's: it would show the Apple terms and Apple product IDs and call `verifyApplePurchase`.
   - **Detection:** give each bridge an explicit platform, or check for Play before the StoreKit check.
   - **Play plans:** `premiumPlans` and `isNativePurchase` need a Play variant built on the base plans of `recompone_premium`.
   - **In the Play case:**
     - render this text with prices, periods and trial eligibility from Play Billing, not hard-coded;
     - add Restore (re-query owned purchases) and the Manage subscription link;
     - never show the Apple text or any iOS/App Store reference.
3. **Server.** Verification has to be rewritten for subscriptions, not patched.
   - **What it does today:** `verifyGooglePlayPurchase` checks one-time in-app products (`purchases.products.get`, `base44/functions/verifyGooglePlayPurchase/entry.ts`). A subscription token does not verify there, and expiry is always null.
   - **Token binding:** the rules in `base44/shared/googlePlayPurchaseDomain.js` assume a one-time purchase whose token never changes. Subscriptions replace tokens on resubscribe and plan change (`linkedPurchaseToken`).
   - **Before any real purchase**, build verification on `purchases.subscriptionsv2.get`, and add the remaining Google Play items from `docs/remediation-plan.md`:
     - read `subscriptionState`, `lineItems[].expiryTime`, the offer details and `testPurchase`;
     - acknowledge each purchase within 3 days, or Google refunds it;
     - reject test purchases outside testing;
     - bind `obfuscatedExternalAccountId` to the Base44 account, as Apple's flow binds `appAccountToken`;
     - handle RTDN as described under "Launch cutover" (cancellation keeps access until expiry; refund or revocation ends it), plus the Voided Purchases API;
     - take expiry from Google.
4. **Tests.**
   - A unit case for the `"play"` path.
   - e2e cases: the Play bridge shows these terms and no Apple text; the Android wrapper without the bridge still shows "Coming soon".
5. **Store listing.** Update the Play listing, Data Safety (purchase history) and the in-app Terms of Use with the subscription's terms before release.

#### Verify before launch
The current Developer Program Policy text could not be fetched while drafting (support.google.com was not reachable). Before release:
- check this copy against the live [Subscriptions policy](https://support.google.com/googleplay/android-developer/answer/9900533) and [Understanding subscriptions](https://support.google.com/googleplay/android-developer/answer/12154973);
- check the cancellation and access points against the live [Google Play Help article](https://support.google.com/googleplay/answer/7018481);
- check the Play Store menu path in the copy ("Payments & subscriptions → Subscriptions"), since Play's UI wording changes;
- check any regional rules for trials and auto-renewal in the countries you sell in;
- have the final wording reviewed alongside the Terms of Use.

### AI body-composition scanning — approved deploy opt-in

`BodyCompositionScan` is off unless the app Secret `ENABLE_BODY_COMPOSITION_SCAN=true` is set; there is no Vite build flag. The authenticated Premium-access function exposes only that release boolean (it decides whether Progress shows the scan), and the analysis and upload endpoints independently enforce the same Secret. A local frontend against the hosted backend follows the hosted Secret; against `base44 dev`, set the Secret locally. The founder accepted Base44's current private-file deletion limitation for the initial live test. The limitation is disclosed immediately before upload and in the Privacy Policy.

The enabled flow requires the `visual_progress` Premium entitlement in both the UI and backend. The browser uploads only to private storage; the authenticated backend verifies entitlement before reading profile data, creates five-minute signed URLs, invokes the AI provider, and returns a conservative body-fat range. Lean-mass ranges are derived on the server from the bounded result. Results remain in session storage only. Safety flags pause the flow.

Before a public Play rollout, re-review usage limits and confirm that Play Data Safety answers cover optional body photos and AI processing. Keep the on-device Visual Progress Check available as the lower-data alternative.

Reference: [Base44 integrations reference](https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations)

## Release invariants

- Premium UI is discoverable while locked; data access and generation are not.
- Server-backed Premium features verify entitlement before reading fitness history.
- Visual Progress Check never sends photos or photo metadata to Base44 or an AI provider; the separate, explicitly disclosed AI range does.
- No entitlement stores an email, purchase receipt, profile field, or health metric.
- In-app account deletion removes server-owned Premium entitlements and the current device's progress photos.
- Both brand PNGs remain in the repository.
