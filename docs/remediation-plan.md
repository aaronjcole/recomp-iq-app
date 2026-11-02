# Remediation plan (from the 2026-09 full code review)

This plan orders the fixes from a full-repository review. That review was a single
pass followed by seven parallel agents that tried to disprove each finding. Findings
marked *plausible* depend on platform behaviour that could not be checked from the
review sandbox.

When the review ran, every automated check passed: lint, both typechecks, the three
node suites (fitness 124, security 173, contract 14), Android verification, the build
and e2e (40). Many `tests/security` checks only regex-match source text, so passing
them does not show the code works. The broken Apple verifier below passed all of its
tests.

## Phase 0: confirm facts that reorder the plan (no code)

1. **Is the owner's login an admin in Base44?** If so, stop using that login in the
   app until item 1 ships.
2. **Are there live paying subscribers?** Check App Store Connect and Play Console. If
   there are none, item 2 is a launch blocker rather than an active incident.
3. **Does Base44 enforce field enums?** In production, log a food from search and
   confirm it appears in the diary (item 5).
4. **Does Google sign-in work in the iOS build?** Test it on a physical device
   (item 10).
5. **Did Expo doctor pass on GitHub CI?** The review sandbox could not reach Expo's
   servers.

## Phase 1: stop ongoing harm (small independent PRs)

| # | Fix | Effort | Why now |
|---|-----|--------|---------|
| 1 | Add `created_by_id` owner filters in `ensureDefaultHabits`, `upsertTrackingRecord` (including `verifyHabitOwnership`), and every query in `RecompContext.loadInitial` and `loadHistory`. Admin RLS lets these unscoped queries read, merge and delete other users' rows. | S–M | An admin session corrupts other users' data |
| 2 | Replace `base44/shared/appleJwsVerify.js` with Apple's `SignedDataVerifier`, or fix it fully: the root cert is truncated, the code uses P-256 where it needs P-384/SHA-384, and it passes DER signatures where WebCrypto needs raw r‖s. Add the Apple certificate-type (OID) checks. Never re-activate a revoked entitlement on `DID_RENEW`. Add a test that runs verification on a real chain. | M | Every App Store notification returns 401: renewals never extend, refunds never revoke |
| 3 | Complete the `deleteAccount` cascade: FoodLogEntry, ReferralCode, Referral (delete by both `referrer_id` and `referee_id`), LifestyleProfile, CoachConversation and PushDevice. Assert on the `deleted` counts. | S | Contradicts the Privacy page and store deletion rules |
| 4 | Enforce the lifestyle-coach flag on the server in `lifestyleCoachReply`, and keep the endpoint disabled until it has the `isUnsafeCoachReply` filter and bounded `planAdjustments`. | S | Unfiltered advice ("900 kcal/day") is reachable by bundle subscribers |
| 5 | Food-search logging: add `"search"` to the `FoodLogEntry.source` enum, and show an error when a diary write fails. | S | Search-added food may be silently dropped, leaving duplicate FoodItems |
| 6 | Coach rate limit: reserve quota slots atomically (fixed slot IDs) or re-check after the write (`coachRateLimitDomain.js`). | S–M | Parallel requests exceed the free-tier AI quota |

## Phase 2: data integrity (needs design before code)

7. **Derive daily-log totals on the server.** Either recompute calories and macros from
   the FoodLogEntry rows, or have the server apply changes (deltas) instead of absolute
   totals. This one design fixes three bugs: lost updates between devices, totals left
   behind when a write fails, and past dates counting from 0. In the same PR:
   - clear `loadedDates` in `loadInitial`;
   - retry a failed `loadHistory`, and don't set `historyLoaded` when it fails;
   - disable the check-in until history has loaded, and merge check-ins by id instead
     of replacing them.

   **L**
8. **Make the live strategy the one source of targets.**
   - Meal plans use the live strategy instead of `targets_for_next_week`, drop the
     second 0.95/1.05 scaling, and clamp to the 1500 kcal floor.
   - Recompute macros whenever calories change.
   - `changeGoal` respects `manual_override`.
   - Null check-in fields are ignored rather than read as 0, and the sleep threshold
     is in hours.

   **M**
9. **Training blocks.** Key completions by (week, day_index). In `updateSession`,
   create the new StrengthLogs before deleting the old ones. **M**

## Phase 3: iOS launch blockers (skip anything already live and approved)

10. **Google sign-in.** Open the provider login in `ASWebAuthenticationSession`
    (`expo-web-browser`) and return to the app through the `recompone://` scheme. **M**
11. **Paywall (App Store rule 3.1.2).**
    - Add Terms and Privacy links and auto-renewal text.
    - Take prices and trial eligibility from StoreKit over the bridge.
    - Remove the "web checkout" copy from Referrals.

    **M**
12. **Bridge reliability.**
    - Add request timeouts.
    - Have native always reply.
    - Clear `pendingPurchaseRef` when a purchase finishes without an event.

    **S–M**
13. **WebView settings and purchase environment.**
    - Set `allowsInlineMediaPlayback` so the barcode camera works.
    - Add a custom error screen with retry.
    - Accept sandbox purchases only from allow-listed accounts.

    **S**

## Phase 4: user-facing correctness (batch into 2–3 PRs)

- **QuickLogSheet:**
  - show an error toast when a save fails;
  - send explicit nulls for cleared fields;
  - keep the user's input when a save rolls back.
- **HabitEditor:** block save while a save is in progress.
- **FoodSearchCard:** the "Today" button stays enabled after "Library" but does
  nothing.
- **Meal swap:** rebuild the grocery list, and make AI-generated meals swappable.
- **WorkoutTracker:** derive elapsed time from `startTime`.
- **Onboarding draft:** key it per user, clear it on logout, and store only form fields.
- **Tester bypass:** move it into the shared entitlement loader so testers can use the
  gated Premium endpoints.
- **AI meal-variety output:** check it against the calorie targets and the user's diet,
  and fall back to the fixed plan when it fails.
- **Photo analysis:** only create signed URLs for files the caller owns.
- **`swapAdaptiveMeal`:** add the Premium gate.

## Phase 5: test debt and cleanup

- **Test debt** (do alongside each item above): replace the regex-only
  `tests/security` checks with tests that run the code.
- **Entitlement lookup:** have all functions use `base44/shared/entitlementAccess.js`
  instead of their own copies.
- **Remaining low-severity fixes:**
  - longest streak must be at least the current streak;
  - the protein nudge compares a calorie gap with gram gaps;
  - Open Food Facts total sugars are stored as added sugar;
  - the 1200 vs 1800 limit on coach summaries;
  - forged `role:"coach"` history skips the coach's input safety check;
  - referral and report limits can be beaten with parallel requests;
  - Android Back loops on `/login`;
  - CodeQL doesn't run on `base44-builder`;
  - tighten the Android release checks;
  - progress photos: use cursor reads and close IndexedDB connections;
  - delete the dead `OAuthConsent.jsx`.
- **Google Play** (do this before wiring up Android billing, not now):
  - make the token claim atomic;
  - acknowledge purchases on the server;
  - handle voided purchases.

## Sequencing notes

- Items 1–6 are independent of each other, so run them in parallel.
- Settle item 7's design before starting the QuickLog work in Phase 4; both change the
  same write path.
- Keep the Base44 Builder out of `RecompContext.jsx` and `base44/functions/` while
  Phase 1–2 PRs are open.
- A backend fix only takes effect once it is deployed to Base44, not when it merges.
- This plan comes before the feature and performance waves in `improvement-plan.md`.
  Item 7 and that plan's "split the eager load / mega-context" refactor touch the same
  code, so do them as one piece of work.
