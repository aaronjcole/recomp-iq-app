# 00 — Summary
Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

## State of the repo

1. CI has failed on all 14 pushes to `main` (#531–#547). Every test, build and e2e step after the failing step is skipped, and the e2e suite could not load even if it ran (BE-05 / DEP-02, DEP-01).
2. Nothing gates `main`. Of its 280 commits, 110 come from Base44 Builder bots. The last 20 commits (+13,594/−2,192 lines) landed with no PR, among them payment code, AI-quota code and a Vite 6→8 major (BE-04 / DEP-03, GIT-03).
3. The 2,595-line Deno backend is never executed, type-checked or linted, and a Builder commit has already shipped a call the runtime SDK lacks (BE-03, BE-V1). ESLint enforces 6 rules on 131 of 300 product files (FE-04, QUAL-02).
4. Four defects are live in production code: user-identified SDK analytics that contradict the privacy page, referral rewards that are advertised but never granted, sandbox purchases that unlock real Premium, and AI ceilings that 25 free accounts can exhaust for everyone (W-01 / B44-01, BE-01, BE-07 / SEC-03, BE-02 / SEC-04).
5. The core is sound. `base44/shared` (6,608 LOC) has 0 platform imports, 75% of `src` LOC never touches the SDK, 852 node tests pass locally, and the iOS shell already does StoreKit and native auth. What is broken is the gates and the config, not the architecture (03 §9, TEST-11, 04 §2.1).

## How to read this audit

| Doc | Scope | Finding-ID prefixes | Lead problem |
|---|---|---|---|
| [01 — Architecture](01-architecture.md) | Directory map, entry points, routes, state, data layer, backend, external calls, CI, dependencies | `FE-*`, `BE-*`, `DEP-*`, `W-*` | CI red and ungated `main`; backend never executed |
| [02 — Dead code and branches](02-dead-code.md) | knip/depcheck triage, unreachable code, flags, the 91-branch table and its cleanup commands | `DEAD-*`, `GIT-*` | 79 of 91 branches merged and deletable; 242 no-op Tailwind class usages |
| [03 — Base44 coupling](03-base44-coupling.md) | Every Base44 touch point, a/b/c portability class, exit effort, 33 platform unknowns | `B44-*`, `U1`–`U33` | Exit costs ~28-38 eng-days; Apple purchases are bound to Base44 user ids |
| [04 — iOS feasibility](04-ios-feasibility.md) | Expo shell inventory, App Store risk, reuse measurement, 6 options compared | `IOS-*` | Ship the existing Expo WebView shell (option 1a), 8-14 eng-days |
| [05 — Health](05-health.md) | Security, reliability, performance, quality, testing, a11y, config | `SEC-*`, `REL-*`, `PERF-*`, `QUAL-*`, `TEST-*`, `A11Y-*`, `CFG-*` | Fail-open Premium and AI cost controls; client fragile on bad networks |

Tags: **VERIFIED** = cited lines opened or tool output. **SUSPECTED** = inference, or depends on Base44, Apple or runtime behaviour the repo does not show. Every effort, cost and reuse figure in any document is judgement. The tag on a row in this summary is the tag of its source finding.

The same issue often has several IDs. They are the same finding, not separate ones:

| Issue | IDs |
|---|---|
| CI red on main | BE-05 / DEP-02 / TEST-02 / IOS-10 |
| e2e cannot load (`esbuild`) | DEP-01 / TEST-01 / DEAD-11 |
| Direct pushes to main | BE-04 / DEP-03 / GIT-03 / B44-03 / CFG-05 |
| SDK analytics on | W-01 / B44-01 |
| Sandbox purchases grant Premium | BE-07 / SEC-03 / IOS-19 |
| App-wide AI ceilings | BE-02 / SEC-04 (amplified by SEC-V1) |
| Backend never executed | BE-03 / TEST-05; incident BE-V1 / TEST-06 |
| Backend SDK pin skew | BE-21 / DEP-20 / CFG-04 / B44-05 |
| Upload and food-photo gates | B44-V1 / SEC-07; BE-17 / B44-22 / SEC-13 |
| Photos never deleted | BE-19 / B44-04 / SEC-05 |
| Error boundary too high | FE-02 / REL-05 |
| Chunk reload loop | FE-03 / REL-04 |
| Boot failure → /login | FE-V1 / REL-01 |
| Context re-render churn | FE-01 / PERF-07 |
| Lint scope and rules | FE-04 / QUAL-01 / QUAL-02 / DEAD-15 / DEAD-V1 |
| Typecheck scope (frontend + base44/shared) | FE-05 / QUAL-03 |
| Dead files and unused deps | FE-20 / DEP-05 / DEAD-03 / DEAD-11 / QUAL-05 |
| OAuthConsent.jsx | FE-11 / DEAD-04 / B44-13 (SEC-18 is its unvalidated `redirect_url`, Info) |
| Gmail connector | BE-11 / DEAD-12 / B44-11 / SEC-16 |
| Push endpoint with no caller | BE-14 / DEAD-09 / B44-23 / QUAL-17 (the missing-notifications product gap is IOS-03, Medium) |
| Food-diary row caps | FE-17 / REL-15 |
| Client multi-entity writes | FE-19 / REL-20 |
| Tailwind 4 PR #177 | DEP-04 / GIT-07 |
| `xcode` test blocks #196 | DEP-24 / GIT-05 |
| Hard-coded Base44 origin | B44-10 / CFG-01 |
| Stale docs | BE-27 / DEAD-16 / SEC-20 / GIT-08 |

### Conflicts between documents, resolved for this summary

| # | Conflict | Resolution | How | Tag |
|---|---|---|---|---|
| C1 | ESLint rule count: 6 (FE-04) vs 9 (QUAL-01) | Both are right. 9 rules are configured and 6 are not `off`. The result is the same for `src/pages/Today.jsx` and `src/pages/Nutrition.jsx` | Writer ran `npx eslint --print-config` on both files and counted non-off rules | **VERIFIED** |
| C2 | Branch protection: 03 (B44-03) called `main` "unprotected" without querying it (corrected in QA); 01 (DEP-03) queried it | `main` is protected and requires nothing: `{"protected":true,"rsc":{"checks":[],"contexts":[],"enforcement_level":"off"}}` | Writer ran `gh api repos/aaronjcole/recomp-iq-app/branches/main` | **VERIFIED** |
| C3 | CI fix: 03 (BE-05) said "merge Dependabot #196" (corrected in QA); 01 DEP-24, 04 W2 and 05 TEST-02 say #196 fails | #196 fails earlier, at "Test native meal speech protocol and lifecycle" (.github/workflows/ci.yml:49-50), which runs before "Validate Expo configuration" (:52-53). Merging #196 does not make main green | Writer opened ci.yml:49-53 | **VERIFIED** |
| C4 | #177 build break: SUSPECTED in 02 (GIT-07, not executed; retagged in QA), VERIFIED in 01 (DEP-04, reproduced) | DEP-04 is used: `vite build` exited 1 with the Tailwind-4 PostCSS error | 01 DEP-04 evidence | **VERIFIED** |
| C5 | Backend-exit effort: 03 says 28-38 eng-days; 04 W8 uses 28-70 | 03's line items already cover Android (3-5 d), the iOS shell (1-2 d) and hosting (2-3 d) (03 §2 rows 16-18). 04's upper bound adds G-ios's 40-70-day view. I use 03's 28-38 for engineering time. The real swing is what both exclude: LLM-parity evaluation, Base44 export lead time (U22), the Play key reset and App Review. Neither figure changes the decision below | Read 03 §2 and 04 §2.7 W8 | **SUSPECTED** (estimates) |
| C6 | AI ceilings: High (BE-02) vs Medium (SEC-04) | High. 25 free accounts lock paying users out of the coach for 24 h, and SEC-03 makes Premium free for testers | Judgement on the shared evidence (base44/shared/coachRateLimitDomain.js:61-66, opened by writer) | — |
| C7 | Photo deletion: Medium (B44-04) vs Low (BE-19) | Medium, as 03 §1.2 argues: physique photos are sensitive, and B44-V1 lets any account create them | 03 §1.2 | — |
| C8 | When CI went red: the tooling README and GIT-03 said "since #536" (GIT-03 corrected in QA); 01 and 05 checked every run | The first failing push was #531 (2026-10-21) and the last green run was #529 | 01 §1.2 #1, 05 conflict #1 | **VERIFIED** |
| C9 | knip's 109 unused exports: 01 says "not individually verified"; 02 says every row was re-checked with `rg` | 02 did the per-symbol check (02 §2), so those rows stand as VERIFIED in 02 | 02 §2 | **VERIFIED** |
| C10 | Final QA: the same finding carried different severity or effort across 01-05 | Aligned to one value everywhere. Severity: SEC-04 → High (C6); BE-19 → Medium (C7); BE-17 / B44-22 → Medium (as SEC-13); CFG-05 → High (as BE-04); CFG-01 → Medium (as B44-10); FE-05 → Medium (as QUAL-03); DEAD-15 / DEAD-V1 → Medium (as FE-04); GIT-05 → Medium (as DEP-24); GIT-08 → Info (as BE-27); SEC-10 → Low (as IOS-15); SEC-16 → Low (as BE-11); FE-17 → Medium/Low split (as REL-15). Effort: BE-04 / B44-03 / CFG-05 → <1d (as GIT-03); CFG-04 → <1d (as BE-21); GIT-05 → <1h (as DEP-24); FE-19 / REL-20 → ~2-3 d. Facts: 03 BE-05's "merge #196" fix and GIT-07's "build break not executed" tag were corrected per C3/C4; IOS-19's premiumDomain.js:146 → :147 | QA re-opened the cited lines and re-queried CI runs and the branch rule (`gh api`) | **VERIFIED** (facts) / judgement (severity) |

---

## Top 10 issues

Ranked by value, meaning severity divided by effort. High at <1h comes first, then Medium at <1h, then High at <1d. Within each band, the issue with the larger blast radius ranks higher.

| Rank | Issue | Severity | Effort | Tag | One-line fix |
|---|---|---|---|---|---|
| 1 | CI is red on 14 straight `main` pushes. A non-hermetic `expo-doctor` (live Expo API data) fails first, so every test, build and e2e step is skipped. BE-05 / DEP-02 / TEST-02 — [01](01-architecture.md), [05](05-health.md) | High | <1h | **VERIFIED** | Set `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` on the gating doctor step (.github/workflows/ci.yml:52-53), and run the online doctor as a scheduled non-blocking job |
| 2 | The Playwright suite cannot load a single spec: tests/e2e/meal-speech-input.spec.js:2 imports `esbuild`, which nothing has installed since Vite 8. Fixing #1 exposes it. DEP-01 / TEST-01 — [01](01-architecture.md), [05](05-health.md) | High | <1h | **VERIFIED** | Add `"esbuild": "^0.28.2"` to devDependencies |
| 3 | Base44 SDK analytics is on by default and never disabled. It sends user id, session id, page paths and a 60 s heartbeat, which contradicts vite.config.js:21-23 and Privacy.jsx:76-77. W-01 / B44-01 — [01](01-architecture.md), [03](03-base44-coupling.md) | High | <1h | **VERIFIED** (code) / **SUSPECTED** (compliance effect) | Pass `analytics: { enabled: false }` to `createClient` (src/api/base44Client.js:6-13), or disclose it in Privacy and the store labels |
| 4 | Referral rewards ("free month, banked", "30% off") are advertised and never granted. No code moves a Referral past `pending`. BE-01 — [01](01-architecture.md) | High | <1h (copy) / >1d (pipeline) | **VERIFIED** (code) / **SUSPECTED** (no manual process) | Remove both claims from src/pages/Referrals.jsx:77-78,156-162 until a reward pipeline exists |
| 5 | Server-side AI quotas hold only if Base44 refuses end-user tokens on `/integration-endpoints/Core/*`. The browser bundle contains that client path. SEC-01 / U30 — [05](05-health.md), [03](03-base44-coupling.md) | High | <1h (verify) / <1d | **SUSPECTED** | Ask Base44 to disable frontend integration access for this app (src uses none), and add a credit-spend alarm |
| 6 | Apple sandbox purchases grant production Premium while `APPLE_SANDBOX_ALLOWED_USER_IDS` is unset (base44/shared/premiumDomain.js:147 returns `allowed: true`). BE-07 / SEC-03 / IOS-19 — [01](01-architecture.md), [03](03-base44-coupling.md), [04](04-ios-feasibility.md), [05](05-health.md) | Medium | <1h | **VERIFIED** (code) / **SUSPECTED** (secret state) | Set the allowlist to the testers plus the App Review account, then fail closed when it is empty |
| 7 | The photo pipeline has no server gate. Any free account can store unlimited 10 MB private files (uploadAnalysisPhoto/entry.ts:56), and food-photo inference is reachable while "disabled" (0 `ENABLE_FOOD_PHOTO` hits in base44/). B44-V1 / SEC-07, BE-17 / SEC-13 — [03](03-base44-coupling.md), [05](05-health.md) | Medium | <1h | **VERIFIED** | Check the premium feature, an `ENABLE_FOOD_PHOTO_SCAN` env flag and quota in uploadAnalysisPhoto and analyzeFoodPhoto, before `UploadPrivateFile`/`InvokeLLM` |
| 8 | The Builder and the owner push straight to `main` (20 commits with no PR since #187). The Builder PR workflow has never fired, and `main` requires no checks (C2). BE-04 / DEP-03 / GIT-03 / B44-03 / CFG-05 — [01](01-architecture.md), [02](02-dead-code.md), [03](03-base44-coupling.md), [05](05-health.md) | High | <1d | **VERIFIED** (history, branch rule) / **SUSPECTED** (whether the dashboard can target a branch) | Fast-forward `base44-builder`, point the Builder at it, require `verify` on `main`, and use PRs for owner changes |
| 9 | No `entry.ts` is ever executed, type-checked or linted, and the test fakes do not match the pinned SDK 0.8.48. That mismatch let a `count()` call reach main and break the quota path of all 4 AI features for ~4.5 h. BE-03 / TEST-06 / BE-V1 (full handler extraction, TEST-05, is listed under Large) — [01](01-architecture.md), [03](03-base44-coupling.md), [05](05-health.md) | High | <1d | **VERIFIED** | Add a CI job running `deno check base44/functions/*/entry.ts`, and generate the fake client from the 0.8.48 method list |
| 10 | Hard-coded app-wide daily AI ceilings (coach 500) mean 25 free accounts × 20 requests switch the coach off for every user, paying users included, for 24 h. Fake photo references burn the photo ceilings for free. BE-02 / SEC-04 (+ SEC-V1) — [01](01-architecture.md), [05](05-health.md) | High (C6) | <1d | **VERIFIED** (code) / **SUSPECTED** (signup open in dashboard) | Separate paid and free pools, make the ceilings env-configurable, alert at 80%, and check photo ownership before reserving quota |

Just outside the 10: DEP-24 (Medium, <1h: the `xcode` test blocks #196 and every future Expo bump), IOS-V1 (Medium, <1d: charged users stay locked out until they tap Restore) and FE-V1 / REL-01 (Medium, <1d: a flaky connection at launch logs the user out).

---

## Quick wins (<1 hour)

**CI and tooling**
- BE-05 / DEP-02: make the gating doctor step hermetic (Top 10 #1).
- DEP-01 / TEST-01: add `esbuild` to devDependencies (Top 10 #2).
- DEP-24 / GIT-05: delete the `xcode@3.0.1` override (expo-ios/package.json:31-35), rewrite dependencySecurity.test.ts for xcode 4, carry #196 on a human branch and land it.
- GIT-06 / GIT-07: close #167, #168 and #177, and add a CodeQL `groups:` entry to dependabot.yml.
- GIT-02 → GIT-01: cherry-pick fdb5865 into a docs PR, delete the 79 merged branches (02 §3.4), and turn on auto-delete of head branches.
- GIT-10: tag the shipped native build, e.g. `ios-build-6` → 7e6e81c.
- BE-12 / CFG-05: change `installCommand` to `"npm ci"` (base44/config.jsonc:4).
- CFG-07: fail the production build when `VITE_BASE44_APP_ID` is missing.
- DEP-21: add `"engines": { "node": ">=22.12" }` and an `.nvmrc`.
- DEP-18: drop `baseUrl` from jsconfig.json.
- DEP-15 / IOS-11: run plain `npm audit fix` in expo-ios to fix node-forge. Never use `--force`.
- DEP-11: bump all `@radix-ui/*` packages in one PR, run `npm dedupe`, close #159, then smoke-test the UI.
- TEST-08: make the e2e mock return 404 for unknown functions.

**Privacy, money and abuse**
- W-01 / B44-01: turn off SDK analytics (Top 10 #3).
- BE-01: remove the referral reward copy (Top 10 #4).
- SEC-01: ask Base44 to disable direct Core integration access (Top 10 #5).
- BE-07 / SEC-03 / IOS-19 and IOS-V2: set the sandbox allowlist, confirm `APPLE_BUNDLE_ID` equals expo-ios/app.json:14, and fail closed.
- B44-V1 / SEC-07 and BE-17 / B44-22 / SEC-13: add server gates to upload, food photo and check-in v2 (Top 10 #7).
- SEC-V1: verify photo ownership before reserving quota.
- REL-14: release the quota reservation when the LLM call fails.
- SEC-08: key the tester bypass on user ids and read it through `secrets.get`.
- SEC-14: require `Content-Type: application/json` on deleteAccount, exportAccountData and the verify* functions.
- BE-15 / REL-10: add `AbortSignal.timeout(8000)` to the Apple and Google fetches.
- BE-16: cap the webhook body, and log bundle-id mismatches.
- BE-24: make referral-code creation insert-then-rank, use `crypto.getRandomValues`, and fail when attempts run out.
- BE-11 / DEAD-12 / B44-11: delete base44/connectors/gmail.jsonc and revoke the grant.
- BE-14 / DEAD-09: delete registerPushToken and PushDevice unless server push is planned.
- IOS-15 / SEC-10: add an origin guard to IAP `sendResponse`.
- FE-12 / SEC-17: scope `recomp_active_workout` and `recomp-muted-plateaus` per user, and clear user data on sign-out.
- FE-21: replace the `@base44/sdk/dist/...` deep import.

**Client reliability and UX**
- FE-03 / REL-04: fix the chunk-reload loop guard.
- FE-02 / REL-05: add per-tab error boundaries inside AppLayout, plus a "Go to Today" link.
- REL-06: toast on the 5 unhandled mutation failures.
- REL-08: show "unavailable, retry" instead of "requires Premium" when access fails to load.
- REL-13, REL-16 and REL-17.
- FE-15: gate the nutrition report hook on `isActive`.
- FE-18: drop the pre-read before each write.
- FE-22: stop wiping `history.state`.
- FE-V2: preserve `returnTo` on the way to /login.
- FE-13: make Back on /onboarding exit.
- FE-06: add route metadata for the 3 "Page not found" screens.
- FE-10: replace the Base44 boilerplate 404 page.
- A11Y-V1: add `pointer-events-none` to the toast containers, which swallow taps in the top 32 px.
- A11Y-03: add a toast live region.
- A11Y-05, A11Y-06, A11Y-07 and A11Y-08.
- PERF-02: prefetch AppLayout and Today, and run public settings and `auth.me` in parallel.
- PERF-03: lazy-load TrendsDashboard, which keeps ~120 kB gz of recharts off the default Progress view.
- PERF-06 / FE-09 / DEP-10: drop react-query, or commit to adopting it.

**iOS release copy and config**
- IOS-09: remove the false "Available on the App Store." text (src/pages/ComingSoon.jsx:235).
- IOS-13: set `supportsTablet: false`.
- IOS-07: add the Apple billing notice to the deletion dialog.
- IOS-14 / B44-19: correct the README token claim.
- IOS-W1: inspect the generated privacy manifest.

**Dead code**
- FE-20 / DEP-05 / DEAD-03 / DEAD-11: retarget the 2 tests, delete the 8 dead files, then `npm rm @hookform/resolvers @radix-ui/react-accordion cmdk`.
- DEAD-05: delete mealPlanning.js and nasmKnowledgeBase.js.
- DEAD-06: decouple the `LIFESTYLE_COACH_ENABLED` flag from the 404-line domain module.
- DEAD-07 / QUAL-16: inline `itemizedFoodDiary`.
- DEAD-02.
- FE-11 / DEAD-04: knip-ignore OAuthConsent.jsx instead of deleting it.
- DEAD-14: move the non-web PNGs out of public/.
- BE-13 / DEAD-10: check row counts, then drop CoachConversation.
- BE-22 / QUAL-10, BE-25 / QUAL-07 and BE-26 / QUAL-13: import shared helpers instead of copies.
- BE-27 / DEAD-16 / SEC-20 / GIT-08: refresh the stale docs.
- CFG-06: add `.env.example`.

## Medium (<1 day)

**Gates and backend**
- BE-04 / DEP-03 / GIT-03 / GIT-04: route the Builder through its branch and require checks (Top 10 #8).
- BE-03 / QUAL-03: add `deno check` and handler smoke tests (Top 10 #9).
- BE-21 / DEP-20 / CFG-04 and BE-V1 / TEST-06: one SDK version string, plus a parity test for the fakes.
- BE-08: record every Base44 publish.
- IOS-18: no publish unless CI is green on that commit.
- TEST-10: run a nightly `test:e2e:deployed`.
- BE-10 / CFG-02 / TEST-09: run e2e against `vite preview`, with a flags-off project and a WebKit project.

**Abuse and security**
- BE-02 / SEC-04: tiered ceilings (Top 10 #10).
- SEC-02: get frame-ancestors headers from Base44.
- SEC-09: Apple notification replay protection and `REFUND_REVERSED`.
- SEC-11: meter the side endpoints.
- SEC-V2: add a nonce to native-return.
- BE-09: throttle and cache Open Food Facts search.
- B44-12: configure your own Apple and Google OAuth clients, and disable Microsoft and Facebook login.
- B44-04 / BE-19 / SEC-05: get a file-deletion guarantee from Base44.
- IOS-07: get an answer on SIWA token revocation.
- BE-18: add a concurrent-duplicate test.

**Client reliability**
- FE-V1 / REL-01: add an "auth unknown" state.
- REL-02: add timeouts and `allSettled`.
- REL-03: refresh without unmounting the app.
- FE-16 / B44-15: render public routes without waiting on auth.
- FE-07: hoist RecompGate.
- REL-07: DailyLog revision guard.
- REL-09: day rollover.
- REL-11, REL-12, REL-V1 and REL-18.
- FE-17 / REL-15: pagination for capped lists.
- FE-14: make Android Back close overlays.

**Performance and UI**
- FE-01 / PERF-07 and PERF-08: context and keep-alive churn.
- PERF-05 / DEP-08: remove framer-motion.
- PERF-09, PERF-10, PERF-11 and PERF-12.
- DEP-12: evaluate Recharts 3 or hand-rolled SVG for the 3 charts. DEP-13 / PERF-04: native `BarcodeDetector` with a 1D-only zxing fallback.
- DEP-09.
- DEAD-01: fix the colour token format, which revives 242 no-op opacity classes.
- A11Y-01, A11Y-02, A11Y-04, A11Y-09 and A11Y-10.

**Quality gates**
- FE-04 / QUAL-01 / QUAL-02 / DEAD-15 / DEAD-V1: fix the ESLint config, widen its scope, and enable `exhaustive-deps`.
- FE-05 / QUAL-03: widen the typecheck scope.
- QUAL-08, QUAL-09 and QUAL-12.

**iOS**
- IOS-V1: deliver unsolicited StoreKit transactions to the web.
- IOS-04: add an expo-haptics bridge.
- B44-10 / CFG-01: read `APP_ORIGIN` from EAS config.
- IOS-17: token-TTL spike, only if option 2 is triggered.

## Large (>1 day)

**iOS product**
- IOS-03: local reminders (~3-5 d).
- IOS-05: service worker plus an offline write queue (~5-8 d).
- DEP-16: Expo SDK 58 with react-native-iap 17 (~2-3 d).

**Data integrity**
- FE-19 / REL-20: move multi-entity writes server-side (~2-3 d).
- FE-08: per-user plan entity (~2 d).

**Tests**
- TEST-05, full handler extraction (~4 d; ~1 d for payment, deletion and coach).
- TEST-03 (~3 d).
- TEST-04 (~2 d).
- TEST-07 (~2 d).
- B44-21 (~2-3 d).

**Data layer**
- QUAL-11 / FE-09: adopt one data-fetching pattern (~3 d).

**Revenue paths**
- BE-06 / SEC-06: Play billing hardening, required before any Android billing ships (~2-3 d).
- BE-01: reward pipeline, if the rewards stay (~3-5 d).

**Dependencies**
- DEP-04 / GIT-07: Tailwind 4 migration (~2-3 d).
- DEP-14: root majors (~5-8 d total).
- DEP-19: React 19, only if option 2 (~2 d).

**Exit hedges**, only when leaving Base44 is scheduled:
- B44-18: entities adapter (~3 d).
- B44-09: Android build off Base44 (~3-5 d).
- 03 §2: the full exit (~28-38 eng-days plus vendor lead time).

**Contingent**
- 04 §4.2: option 2, a React Native UI on Base44 (65-110 eng-days), only if a 04 §6 decision gate trips.
- DEAD-05: wiring in `adaptiveGoalEngine` (>1d). Deleting it instead is <1h.

---

## Decision memo: stay on Base44, hybrid, or full standalone

**Position: stay on Base44 through iOS v1. Not hybrid, not standalone. Confidence: 75%.**

Shipping iOS on the existing Expo shell costs 8-14 eng-days (04 §8). Leaving Base44 costs 28-38 eng-days before vendor lead time (03 §2, C5), and a native rewrite off Base44 costs 123-225 (04 §5). Seven of the Top 10 are repo-only fixes under a day each, and every backend would need them. The code is already portable: `base44/shared` (6,608 LOC) has 0 platform imports, and 201 of 233 `src` files never touch the SDK (03 §9). The lock-in that matters is identity, because Apple purchases are bound to Base44 user ids (B44-02). Any exit must preserve those ids, so waiting makes it bigger in row count, not harder in kind.

**Strongest counter-argument.** The worst problems belong to the platform and cannot be fixed from this repo:
- Deploys are manual, ungated and unrecorded (BE-08, IOS-18).
- `Core.InvokeLLM` may accept user tokens (SEC-01).
- Private photos cannot be deleted (B44-04).
- Framing headers are out of reach (SEC-02).
- Base44 holds hosting, auth email, the Android wrapper and possibly the Apple Services ID (B44-09, B44-12).

Every Builder commit deepens this.

**Why I still hold.** A migration fixes none of these faster than a vendor ticket plus your own OAuth clients (<1d, B44-12). With 33 open Base44 unknowns, 6 of them blocking (03 §1, §10), any migration plan today is a guess. Hedge now; decide on an exit once U1, U3, U4 and U22 are answered.

**Consistency.** This matches 04 §6, which says stay on Base44 and ship option 1a. 03 takes no stay-or-leave position. Its exit estimate and its unknowns support not migrating now. Where 03 and 04 disagree (C2, C3, C5), I side with the evidence as recorded above, and none of those points changes the position.

**Three facts that would change the answer:**
1. **Base44 confirms that end-user tokens can call `Core.*` integrations and that this cannot be disabled (SEC-01 / U30).** Every quota and premium gate would then be bypassable from devtools. The answer becomes **hybrid**: move LLM and file storage to your own provider keys behind the existing functions, and keep Base44 for data and auth.
2. **Base44 cannot export all rows with ids, or the User table, or it owns the Apple Services ID (U22, U3, U4).** Lock-in would then become permanent and grow with every user. The answer becomes **hybrid now**: your own OAuth clients plus a scheduled full export while the user base is small.
3. **The Builder cannot target a non-main branch, and Base44 publishes cannot be gated or versioned (GIT-04, U25, U14).** Then no process fix can keep untested code out of the live iOS app (IOS-18). The answer becomes **hybrid**: host the frontend yourself with a CI-gated deploy, and keep Base44 as the backend.

A 4.2 rejection by App Review changes the UI choice to option 2. It does not change this backend decision (04 §6).

---

## Could not assess

Aggregated from the "Could not assess" sections of 01-05 and deduplicated, plus the items that apply to this summary.

**Live Base44 backend and dashboard.** No dashboard access, and no request reached recomp-iq.base44.app or fitnesstrackerapps.com (the proxy returned 403). That leaves open:
- Deployed entity schemas and RLS, and whether jsonc constraints are enforced on browser writes (U1, B44-18).
- Which accounts are admins (U2).
- The User table and password-hash exportability (U3).
- OAuth client and Apple Services ID ownership (U4, B44-12).
- Token TTL, refresh and cookies (U5), and CSRF via cookies (SEC-14).
- Signup mode (U6, BE-02).
- Auth email sender and templates (U7).
- The provider, model, retention and cost behind `InvokeLLM`, and whether `gemini_3_flash` and `automatic` still resolve (U8, B44-05).
- File-storage retention and whether a delete API exists (U9, B44-04 / BE-19 / SEC-05).
- Secret values: `APPLE_SANDBOX_ALLOWED_USER_IDS`, `APPLE_BUNDLE_ID`, `PREMIUM_TESTER_EMAILS` and the Play secrets, and whether `Deno.env` and `base44:runtime` read the same store (U10, BE-20, IOS-V2, SEC-08).
- Production `VITE_*` flags (U11, DEAD-08, CFG-02, REL-18).
- Function runtime: Deno or workerd, wall-clock timeouts, isolate count, body limits and read-after-write consistency (U12, BE-18, REL-07, REL-12, BE-15).
- The deployed function list, including whether `joinWaitlist` is still live (U13).
- What version is live, and whether the broken `count()` build was ever published (U14, BE-V1).
- Dashboard automations (U15).
- Retention of analytics events already collected (U16, W-01).
- Whether realtime honours RLS (U18).
- The MCP server, and whether the platform needs OAuthConsent.jsx (U19, DEAD-04).
- The Gmail grant (U20).
- Custom-domain `/api` routing, SEO prerender, and CSP, frame-ancestors and XFO headers (U21, SEC-02).
- Bulk export (U22).
- Quotas and billing (U23).
- The data environment (U24).
- Builder target-branch setting and unpushed edits (U25, GIT-04).
- Moderation of AI reports (U26).
- Whether a user token can call Core integrations (U30, SEC-01).
- Manual referral grants (U31, BE-01).
- Hosted dev or preview environments (U32).
- Exact resolution of `npm:@base44/sdk@0.8.48` (U33).
- Whether the hosted build honours `installCommand`, installs devDependencies, and which Node version it uses (BE-12, DEP-21, DEP-23).
- Email verification and account linking across the 5 login methods (SEC-08), and `from_url` redirect behaviour (SEC-V2).
- Whether a service worker can be registered on the Base44 host (IOS-05, REL-19).
- Whether live hosting serves /auth/native-return.html as a static file (04 §10).

docs.base44.com was unreachable, so SDK semantics come from the installed 0.8.57 source and the 0.8.48 tarball only.

**App Store Connect and EAS.** No access to:
- Build 6, any TestFlight upload, the subscription group, the ASSN V2 URL (U28), App Privacy answers and sandbox testers.
- The App Review outcome. The Medium 4.2 rating is a judgement, because enforcement is discretionary.
- The Apple guideline text, which the writer did not re-fetch.

**Google Play and the Android wrapper.** Not in the repo:
- Whether the wrapper calls `window.handleAndroidBack` and honours `false` (FE-13, FE-14).
- Whether it calls `registerPushToken` or `verifyGooglePlayPurchase`, or acknowledges purchases (SEC-06, QUAL-17).
- Who owns the upload key and the Play Console, and what assetlinks contains (U17, B44-09).
- Whether `env(safe-area-inset-top)` is 0 in the wrapper (A11Y-V1).

**Production data volumes.** Unknown:
- Row counts per entity, including the writer-less CoachConversation, WaitlistEntry, PushDevice and LifestyleProfile (U27, DEAD-10).
- The number of paying Apple subscribers. This decides whether B44-02 is a live-data constraint or a design rule.
- The number of stored photos.
- Whether any user has hit the row caps (FE-17 / REL-15).

**Real-device testing.** None was done. Not tested:
- StoreKit sheet, Ask-to-Buy and launch-time redelivery (IOS-V1).
- The ASWebAuthenticationSession return, and Apple and Google sign-in through Base44.
- getUserMedia barcode preview, and Web Share with files in WKWebView.
- IndexedDB persistence across updates.
- iPad layout.
- Speech audio routing.
- Screen-reader output.
- Safe-area overlap.
- Re-render, parse and CPU cost. FE-01, PERF-07, PERF-08 and PERF-10 are desktop Node measurements, extrapolated.

**Execution not performed.**
- Deno was not run, and no backend function was invoked.
- expo-ios/node_modules is not installed. So the shell typecheck and tests were not run locally, no Metro bundle or IPA was inspected, and "build-time only" for the expo-ios audit findings stays SUSPECTED (DEP-15 / IOS-11, IOS-W1).
- The app was not run (no `VITE_BASE44_APP_ID`, no backend).
- Playwright could not load (DEP-01), so routing and UI were verified statically only.
- Untested: whether the doctor skip flag or `EXPO_OFFLINE=1` makes every doctor check pass, and whether #196 passes doctor once DEP-24 is fixed.
- `npm ci` was not run on each Dependabot branch.

**GitHub.**
- Job logs were blocked (403). The cause of the Typecheck failures in #533-#539 and of the September doctor failures on Dependabot PRs is therefore unknown.
- Not readable: review requirements, the bypass list and the "Automatically delete head branches" setting.
- Unknown: why Dependabot opened the major #177 (the alerts API returned 403).
- The CodeQL check runs on #167 and #168 were only partly read.

**Static-analysis limits.**
- Runtime-built class names (DEAD-01 and DEAD-02 are not visually confirmed).
- Unused entity fields and unused props, beyond a heuristic scan (QUAL-14).
- The full byte cost of retained dead data.
- The exact ~75-site UI call total.
- A full-history secret scan; only tracked files and the tooling digest were swept.

**Upstream and runtime compatibility.** Not checked:
- Changelogs for Tailwind 4, Recharts 3, lucide 1.x, eslint-plugin-react-hooks 7, react-native-iap 17 and Expo SDK 58 (DEP-14, DEP-16).
- React 19 compatibility of `@base44/sdk` and `@base44/vite-plugin`.
- Hermes support for `crypto.subtle`, the SDK running inside React Native, and JavaScriptCore reuse. These matter for options 2 and 4 only.

**Estimates.** Every effort, cost, calendar and reuse percentage across 01-05 is engineering judgement, with ±40% stated in 04 §9. They exclude Base44 export lead time, the Play upload-key reset and App Review turnaround.

**Future Builder behaviour.** Whether the Builder will re-add OAuthConsent.jsx or removed dependencies again (FE-11, DEP-V1) is inferred from 2 past occurrences and 1 past occurrence respectively.

**This summary.** The writer re-ran only these checks: base44Client.js:6-13, premiumDomain.js:146-147, ci.yml:49-53, meal-speech-input.spec.js:1-3 with `node_modules/esbuild` absent, Referrals.jsx:77-78, coachRateLimitDomain.js:61-66, uploadAnalysisPhoto/entry.ts:56, the 0-hit `ENABLE_FOOD_PHOTO` grep, the ESLint print-config (C1), the branch-protection API call (C2), and the commit-author counts on main (280 total, 110 Builder, 20 since #187). A final QA pass re-opened 50+ cited lines across 01-05 (every Top 10 item included), re-ran the CI-run and branch-rule `gh api` queries, and made the C10 corrections. Everything else carries the tag of its source document.
