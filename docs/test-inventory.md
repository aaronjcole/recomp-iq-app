# Test inventory: `tests/security` and `tests/contract`

Classes:
- **a**: the test runs real code (imports a module, calls it, checks what it returns or does).
- **b**: the test guards behavior by matching regexes against source text. **b-wiring** means the decision itself is tested by running it elsewhere, and the regex only pins that a Deno entry or a JSX page calls it, or calls it in the right order.
- **c**: the test matches source text or config to guard a structural or policy rule, where matching text is the right tool.

| | a | b | c | total |
|---|---|---|---|---|
| Before (d4dfacb) | 203 | 47 | 70 | 320 |
| After | 233 | 40 | 75 | 348 |

Of the 40 remaining **b** tests, 27 are b-wiring. Most of those pin the order of steps in a Deno entry handler, for example "auth, then the entitlement check, then reads, then the LLM call". To run that ordering as code, each whole handler would have to move into `base44/shared` and be driven with a fake `Request`. That is the next step if more debt is paid down.

## Converted in this change

| File | Test (now) | Was | Risk area | What executes now |
|---|---|---|---|---|
| apple-premium | appleStoreNotification looks up… / ignores other apps… / refunds and revocations… / expiration… / a renewal only moves expiry forward… / auto-renew off… | b | payments | `appleNotificationDomain.js` (extracted): bundle, product and id gating; revoke, expire and renew; stale or replayed notifications |
| apple-premium | an active, matching Apple transaction… / verification fails closed… | b | payments | `applePurchaseDomain.appleTransactionVerification` (extracted) |
| apple-premium | bound to the authenticated account through the signed token | b | payments, auth | `appAccountTokenMatches` (extracted) + `deriveAppleAppAccountToken` |
| apple-premium | a verified purchase writes the internal bundle entitlement… | b | payments | `appleEntitlementWrite` (extracted) |
| tracking-persistence (new) | 7 tests | b (owner-scoping, tracking-idempotency) | ownership, data integrity | `trackingRecordPersistence.js` (moved out of upsertTrackingRecord unchanged), using `fakeBase44Client` with admin visibility |
| default-habit-provisioning (new) | 7 tests | b (default-habit-integrity) | ownership, data integrity | `defaultHabitsProvisioning.js` (moved out of ensureDefaultHabits unchanged): seeding, owner-verified service-role keying, paged history merge, and stores that return other users' rows |
| entitlement-loader, premium-entitlements, food-photo-premium | bounded pages of 500 / record cap | b (loader regexes) | payments | the regexes were replaced by executing `loadPremiumAccessRecords` |
| adaptive-meal-plan | AI variety output is bounded… | b | health/safety | `mergeAiMealsIntoPlan`: rejects a 7-day short week, caps titles and fields, bounds ingredients, falls back per day |
| adaptive-meal-plan | prompt executes without leaking… | b | health, privacy | `buildAiVarietyPrompt` with poisoned check-in data |
| adaptive-meal-plan | meal swaps validate… | b | health | swap validator regexes removed; already executed by tests/fitness "swap requests are strictly validated" |
| local-plan-cache | a biometrics or goal edit preserves manually authored targets | b | data integrity | `recalculatedStrategyUpdate` (extracted from Profile.jsx) |
| onboarding-draft | signing out clears every onboarding draft before the SDK logout runs | b | privacy (health answers) | `signOutWith` (extracted from signOut.js) |
| android-release | live release verification rejects a frameable production origin | b | security config | `framingProtection` (extracted from verify-android-release.mjs) |

## Remaining class b (ranked by risk)

| File | Test | Kind | Risk note |
|---|---|---|---|
| account-deletion | deleteAccount only removes the user record after a fully successful cascade | wiring | data deletion; the cascade is executed, the ordering is not |
| apple-premium | the paywall verifies… before finishing StoreKit | b | payments; JSX page, needs component extraction |
| apple-premium | Expo shell strictly scopes bridge messages… / terminates a pending request on a mismatched StoreKit update | b | payments; React Native component, not importable in Node |
| apple-premium | verifyApplePurchase wires… / paywall and native shell pass the token / appleStoreNotification … applies only the shared plan | wiring | payments |
| apple-sandbox-purchases | applies the decision after the ownership check | wiring | payments |
| food-photo-premium | requires the entitlement / gate runs before quota… / 403 reaches the user through message / analyzeFoodPhoto resolves access… / Fuel tab hides the trigger | wiring ×4, b ×1 (403 body) | payments (paid inference) |
| body-composition-scan, adaptive-meal-plan ×2, adaptive-training-block, weekly-autopilot | …verifies server entitlement before reading… / LLM call behind every guardrail | wiring | payments, health |
| entitlement-loader | swapAdaptiveMeal checks Premium before reading the request | wiring | payments |
| analysis-upload-ownership | only the server can write AnalysisUpload / ×2 verifies photo ownership before signing | wiring | ownership; domain executed |
| analysis-images | keep signed URL creation and paid inference on the server | wiring | ownership, cost |
| ai-coach-backend | coach and report functions are authenticated and narrowly owner-scoped | wiring | health/safety: the high-risk classifier runs before the LLM call |
| lifestyle-coach-safety | refuses before entitlements, the LLM, or any write while disabled | wiring | health/safety kill switch |
| coach-rate-limit, ai-report-rate-limit, referral-attribution | …through rank-after-insert / precedes paid inference | wiring | cost, integrity; algorithms executed |
| tracking-persistence, default-habit-provisioning | authenticates… and delegates | wiring | ownership |
| ios-native-auth | shell routes provider sign-in through ASWebAuthenticationSession | wiring | auth; RN component |
| daily-nutrition-increments | the client sends nutrition changes as increments | b | data integrity; inside the RecompContext provider |
| local-plan-cache | account deletion purges the locally cached plan output | b | data deletion (device-local) |
| biometric-validation | the profile editor blocks the save that corrupted targets | b | data integrity; JSX handler guard |
| adaptive-meal-plan | meal swaps validate… (server and page wiring part) | wiring | low |
| local-plan-cache | a failed weekly review refresh keeps the review | b | low |
| release-configuration | mobile release flows prioritize primary actions… | b | low (UI order, optimistic update) |
| observability | the telemetry flag defaults off and gates on an explicit endpoint | b | low; `telemetryEnabled()` is executed |
| accessibility-semantics | training history starts with a bounded day window | b | low (UI) |
| mobile-tab-navigation | pull-to-refresh yields to charts | b | low (UI) |
| sleep-free-tier | sleep insights stay in the free Today experience | b | low (UI) |

## Class c (text matching is the right tool)

| File | Tests |
|---|---|
| repository-policy | all 7: entity schemas, RLS on owned entities, admin-only waitlist, no secrets, deletion scoping, no public file storage, CI push branches |
| owner-scoping | user-owned list/filter calls always name the owner. The static scan now also covers `base44/shared` |
| entitlement-loader | no function keeps its own reader / every gated function uses the shared loader / the loader never reads env |
| apple-premium | Expo bundle and account-token namespace / PremiumEntitlement schema |
| adaptive-meal-plan | prompt inputs are pinned (call site, builder params, check-in reads) / meal planning exposed in Fuel / entry on the default segment / ARIA tabs |
| default-habit-integrity, tracking-idempotency, onboarding-draft, premium-entitlements | client seeding centralized / client writes go through the function / shared-code dir / every logout path uses signOut / premium access is server-authorized (schema, routes) |
| android-release | identity, packaging, capabilities, public routes, listing images, route titles |
| release-configuration | photo-analysis flags, support contact, launch claims, route metadata, public legal routes |
| seo-indexability | static crawler files, static document metadata, routing |
| observability | ErrorBoundary, RouteErrorBoundary, entry init, lazy imports, funnel events, privacy disclosure |
| body-composition-scan, visual-progress | no uploads, signed URLs or LLM calls from the client; privacy text |
| accessibility-semantics | headings, aria labels, gold token contrast |
| UI/config singletons | ai-coach-backend (AiContentReport schema), biometric (onboarding bounds = shared bounds), lifestyle (no applyTargetAdjustments), local-plan-cache ×2, mobile-tab (legacy redirects), native-store (Apple login), adaptive-training, weekly-autopilot, playwright (config), ios-app-icon, ios-webview-layout ×3, ios-webview-settings ×2, reduced-motion, touch-target ×3, type-token, vendor-chunks |
| contract | barcode scanner API usage, FoodLogEntry.source enum, RecompContext consumers |

## Class a (by file, after)

account-deletion 9, adaptive-meal-plan 2, ai-coach-backend 10, ai-report-rate-limit 7, analysis-images 3, analysis-upload-ownership 6, android-back 3, android-release 3, apple-jws-verify 15, apple-premium 16, apple-sandbox-purchases 3, biometric-validation 4, coach-contract 8, coach-rate-limit 11, daily-nutrition-increments 7, default-habit-integrity 6, default-habit-provisioning 7, entitlement-loader 8, food-photo-premium 4, ios-native-auth 4, lifestyle-coach-safety 6, local-plan-cache 2, mobile-tab-navigation 1, native-store-entry 2, observability 13, onboarding-draft 8, owner-scoping 6, playwright-browser-fallback 15, premium-entitlements 4, premium-plans 6, referral-attribution 6, release-configuration 1, seo-indexability 3, tracking-idempotency 5, tracking-persistence 7, visual-progress 2, barcode-decoder 11.

## Bugs found

None. Every converted behavior already held when it was run. Two observations, neither changed:

- `verifyApplePurchase` decoded `signedTransactionInfo` from the App Store Server API without checking its signature. This is now fixed: it verifies the signature and certificate chain the same way the webhook does (`verifiedTransactionInfo` in `applePurchaseDomain.js`).
- The AI meal prompt asks for days within 10% of target, but validation accepts 15%. This is a deliberate margin, not a bug.
