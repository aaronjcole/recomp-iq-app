# RecompOne — Code & UX Improvement Plan

_A full audit of the shipped Android/Base44 build, verified against a production build, turned into a four-wave plan of attack. Companion dashboard: an interactive version of this plan was produced alongside this doc._

**Method:** 6 review dimensions × find-then-adversarially-verify, plus a completeness critic. 45 findings survived verification (0 refuted). Bundle sizes below were measured from `npm run build`, not estimated.

> **Reading note.** This plan and the appendix below are a snapshot of the original audit, verified *before* any implementation. The appendix therefore quotes each finding's raw text and describes the code as it was at audit time. Two things follow from that:
>
> - **Already shipped in PR #29** (treat their appendix / Wave-0 entries as historical, not backlog): the optimistic habit-tap fix, the barcode/food-photo scanner lazy-load, and the removal of 11 unused dependencies + 2 orphaned UI files.
> - **Already shipped in PRs #30–#44:** the Today redesign, context oracles/split, privacy-gated observability, every low-risk Section 3.A item except the platform-dependent waitlist limiter, shared Coach quotas, and live frame-protection verification. Use `docs/codex-handoff.md` for current status rather than treating the raw audit appendix as an active checklist.
> - **PNG policy — decided: keep both.** Where the raw appendix finding recommends *deleting* `public/brand/recompone-logo-primary.png` and `recompone-mark-master.png`, that is **superseded**. `recompone-logo-primary.png` is validated as a 1024×1024 Play-listing asset by `tests/security/android-release.test.js` **and** referenced in `docs/play-store/`; `recompone-mark-master.png` is a documented brand master. Both are intentionally kept; the "delete PNGs" quick win was dropped.
>
> The "45 findings" figure counts the verified appendix findings; the "Reliability blind spots" section adds follow-ups the completeness critic raised on top of that count.

## Executive summary

This is a competent weekend build with better bones than most: route-level React.lazy already splits all 25 pages (App.jsx), the domain math in src/lib/fitness is real and partly tested, and CI runs lint/typecheck/tests/e2e. The problems are concentrated and fixable. The biggest cheap wins are dead weight: the @zxing barcode decoder (~110KB gz) is statically bundled into the most-used Fuel tab (Nutrition.jsx:17) despite only mounting on tap, eleven dependencies (three, jspdf, moment, lodash, etc.) are declared-but-never-imported, and two 1.2MB brand PNGs ship in the AAB unused (~2.36MB). The single worst felt-jank is that habit +/- taps have no optimistic update and block on two sequential network calls (RecompContext.jsx:401-438) — an S-effort fix. The deeper performance ceiling is the data/state layer: the whole app blocks first paint on a Promise.all of 13 collections with no caching (RecompContext.jsx:172), and an unmemoized mega-context (RecompContext.jsx:609,654) re-renders every kept-alive tab on any write. Honest risks: (1) the Play release is currently blocked — the Base44-generated AAB requests location/contacts/mic/calendar permissions a Health app cannot justify, and Base44 says these are not editable in-repo, so this needs escalation before upload; (2) there is zero offline resilience (no service worker, no write queue) for an app whose whole premise is flaky-network daily logging; (3) the Today screen dilutes its own "one Best Move" value prop behind two co-equal hero cards plus ~9 stacked, partly-duplicated cards — the top UI/UX target.

## UI/UX verdict

No — it is competent and internally consistent (shadcn/Radix + Tailwind, a coherent teal design language, sensible tab shell) but it is not yet as good as it should be, and the gaps are systemic rather than cosmetic. Three problems dominate. (1) The Today screen actively undercuts the product's one-sentence value prop: BestMoveCard and RecompSignalHero sit as two co-equal, confidence-scored hero cards using identical vocabulary (Today.jsx:53,55), followed by ~9 stacked cards with genuine data duplication (macro bars on Today and Nutrition; 'Latest read' on Today and Progress). (2) Logging is fragmented — two surfaces both edit weight + workout_completed (QuickLogCard and QuickLogSheet) with four separate triggers, giving two mental models for the most-repeated action. (3) A cluster of native-feel/a11y gaps: no heading hierarchy below h1, sub-44px dismiss targets, no prefers-reduced-motion, no tap-highlight reset, color-only active tab, and non-scaling 10px type. Where to deploy a dedicated UI-design subagent, in order: FIRST the Today screen redesign (single highest-value surface — but hand it clear founder direction on what the one hero and canonical logging surface should be, because that is product judgment, not autonomous coding); SECOND a design-system unification pass (rem type tokens, 44px primitives, active-tab affordance, reduced-motion, tap-highlight, heading semantics) which lands across all five tabs at once and is highly automatable. Do the S-effort polish bundle immediately regardless.

## Sequencing

Attack in four waves, ordered by mobile-impact/effort. WAVE 0 — ship the quick wins this week as small independent PRs (they carry disproportionate value for S effort and are low-risk): optimistic habit taps, lazy-load @zxing/FoodPhotoScan/BodyCompositionScan, dead-deps + orphaned-file removal, the two 1.2MB PNGs, safe-area/Coach-height insets, the Best Move missing-data guard, and the native-feel polish bundle (tap-highlight, active-tab, nav labels). In parallel, kick off the Play release escalation (Wave 1 item) since it is gated on Base44 support turnaround, not code — start the clock immediately and make verify:android:aab a mandatory pre-upload step. WAVE 1 (Phase 1) — the foundational refactors that everything else rides on: split the 13-collection eager load into critical+deferred with react-query caching, then break up the mega-context (do these two together, they share RecompContext and the same test surface), and build the Android Back overlay stack. These are L, high-risk, and NOT good autonomous-subagent work — keep a human in the loop and lean on the e2e suite. WAVE 2 (Phase 2) — the performance and mobile initiatives that a coding subagent CAN largely own: framer-motion→CSS + reduced-motion, the Progress O(n^2) fix, the single-round-trip write path, and 44px touch targets. Run the Today UI/UX redesign in this window as a separate design-led track (founder brief → design subagent → build), and stand up the offline SW/outbox once the Base44 wrapper constraints are confirmed. WAVE 3 (Phase 3) — hardening and polish, all highly subagent-deployable and parallelizable: correctness fixes, the four test suites, backend abuse controls + CSP, the accessibility pass, type-token unification, manualChunks, and file-deletion hygiene. Rationale: the quick wins buy immediate felt performance and trust while the release escalation runs; the Phase-1 data/state refactor is the prerequisite that makes later per-tab optimizations meaningful; the UI redesign needs founder product decisions so it runs on its own clock; and Phase 3 is a broad parallel fan-out of well-scoped subagent tasks.

## Quick wins (Wave 0)

### Give habit +/- taps an optimistic update
- **Effort:** S · **Impact:** high
- **Files:** `src/lib/RecompContext.jsx` · `src/components/today/HabitsCard.jsx`
- upsertHabitEntry (RecompContext.jsx:401-438) awaits HabitEntry.filter (:407) AND upsertTrackingRecord (:418) before the first setHabitEntriesCurrent (:427), so the ring/counter/streak in HabitsCard freezes until ~2 sequential round-trips return on cellular — it reads as broken and users double-tap. Mirror upsertDailyLog (which writes state at :325 before the network) by computing the optimistic entry from habitEntriesRef and reconciling/rolling back after. This is the single most user-visible jank in the daily loop.

### Lazy-load the @zxing barcode scanner (and FoodPhotoScan) on tap
- **Effort:** S · **Impact:** high
- **Files:** `src/pages/Nutrition.jsx` · `src/components/nutrition/BarcodeScanner.jsx` · `src/components/nutrition/FoodPhotoScan.jsx`
- BarcodeScanner is statically imported (Nutrition.jsx:17) but only rendered behind {showScanner} (:226); it pulls @zxing/browser + @zxing/library (~110KB gz of the 121.6KB Fuel chunk). Convert to React.lazy + Suspense so the decoder loads only when scanning is requested, and fold the flag-OFF FoodPhotoScan (:18,:233) into the same boundary so disabled AI-scan code never downloads. Removes ~110KB gz / ~440KB parse from first paint of the most-opened daily tab.

### Lazy-load the flag-OFF BodyCompositionScan on Progress
- **Effort:** S · **Impact:** low
- **Files:** `src/pages/Progress.jsx` · `src/components/progress/BodyCompositionScan.jsx`
- Statically imported at Progress.jsx:11 but only rendered behind featureFlags.bodyCompositionScan (:160, default OFF at featureFlags.js:14). React.lazy behind the flag+state gate so a disabled feature ships nothing into the already-heavy Progress chunk. Same one-line pattern as the barcode fix; low bytes but clean hygiene and privacy-surface reduction.

### Remove 11 unused dependencies + 2 orphaned UI files
- **Effort:** S · **Impact:** medium
- **Files:** `package.json` · `src/components/ui/chart.jsx` · `src/components/ui/sonner.jsx`
- three, jspdf, moment, lodash, html2canvas, react-leaflet, react-markdown, canvas-confetti, @hello-pangea/dnd, sonner, react-hot-toast have zero src imports and never bundle — but they bloat the dependency graph the Base44 wrapper builds/audits, CI install time, and supply-chain surface. Delete src/components/ui/chart.jsx and ui/sonner.jsx (unused shadcn scaffolding) in the same PR so sonner's only importer is gone and recharts is unambiguously isolated to the lazy Progress chunk. Keep the Radix toast stack.

### Delete two 1.2MB unused brand PNGs from the bundle
- **Effort:** S · **Impact:** medium
- **Files:** `public/brand/recompone-mark-master.png` · `public/brand/recompone-logo-primary.png` · `tests/security/android-release.test.js`
- public/brand/recompone-mark-master.png (1.17MB) and recompone-logo-primary.png (1.19MB) are copied into dist/ (and the Play AAB) but have no runtime reference in src or index.html — og:image points at an absolute external URL. Removing them (and updating the android-release.test.js dimension check) strips ~2.36MB of install/download size with zero runtime effect. Add an optimized <100KB SVG later if an in-app logo is needed.

### Add safe-area-inset-top to the offline banner, toast viewport, and Coach height
- **Effort:** S · **Impact:** medium
- **Files:** `src/components/OfflineBanner.jsx` · `src/components/ui/toast.jsx` · `src/pages/Coach.jsx`
- The app is edge-to-edge (viewport-fit=cover) but OfflineBanner (fixed top-0, OfflineBanner.jsx:21) and the toast viewport (toast.jsx:15-22, bottom anchor only >=640px) skip inset-top, so on notched Android they draw under the status bar and clip critical transient messages. Coach.jsx:177 also uses a hardcoded h-[calc(100dvh-8.5rem)] that ignores the insets AppLayout honors, pushing the composer under the tab bar on large-notch devices. Add pt-[env(safe-area-inset-top)] to the two overlays and derive the Coach height from the same insets.

### Guard Best Move against missing nutrition data
- **Effort:** S · **Impact:** medium
- **Files:** `src/lib/fitness/bestMove.js`
- deriveBestMove treats unlogged adherence as perfect via `?? 1` (bestMove.js:110,130,150), so a user with 14+ weight-only days falls through to a confident 'Hold targets steady' card (bestMove.js:170-186) while the weekly engine correctly returns keep_collecting_data for the same input (adjustments.js:51-53). Add an explicit missing-data guard that returns a 'start logging your intake' card. This is the headline card on the landing tab telling exactly the wrong population they're on track.

### Native-feel polish bundle: tap-highlight, active-tab affordance, nav labels
- **Effort:** S · **Impact:** medium
- **Files:** `src/index.css` · `src/components/AppLayout.jsx` · `src/lib/routeMetadata.js`
- Three cheap tells that the app is a WebView. Add -webkit-tap-highlight-color:transparent (index.css:152-165 sets other chrome resets but not this) to kill the flashing tap rectangle. Give the active bottom-nav tab a non-color affordance (filled icon / indicator bar) since active vs inactive is only teal #12836f vs muted green #61706a (AppLayout.jsx:87-91) — invisible in sunlight. Unify tab labels 'Fuel'/'Train' with their page h1s 'Nutrition'/'Training' and route metadata so wayfinding is consistent.

## Initiatives (Waves 1–3)

### Phase 1

#### Split the eager 13-collection load into critical + deferred with react-query caching
- **Theme:** performance · **Effort:** L · **Impact:** high · **Subagent-deployable:** no — human-led
- **Goal:** Let Today paint on the critical set instead of blocking on the slowest of 13 parallel queries, and stop re-downloading everything on every pull-to-refresh.
- **Approach:** loadAll (RecompContext.jsx:172-186) fires one Promise.all of 13 base44.entities.*.list calls and RequireOnboarding (:665) shows a full-screen spinner until all resolve. Split into a critical set (UserProfile, UserPreferences, CurrentStrategy, recent DailyLog) that unblocks first paint and a deferred/per-tab set. Route domain fetches through the already-mounted react-query provider (App.jsx:102-117, query-client.js) for stale-while-revalidate caching instead of wholesale refetch. Tighten the -date limits (trends only look back 14-28 days but DailyLog fetches 500).
- **Risk:** Central data layer touched by every page; ordering/gating bugs can white-screen the app. Needs careful product decision on what is truly 'critical' and staged rollout with the existing e2e suite.

#### Break up the unmemoized mega-context to stop the global re-render cascade
- **Theme:** performance · **Effort:** L · **Impact:** high · **Subagent-deployable:** no — human-led
- **Goal:** Stop every weight/food/habit/workout write from synchronously re-rendering all kept-alive tab pages.
- **Approach:** The context value is a 30+ key object literal rebuilt every render (RecompContext.jsx:609) and passed to Provider with no useMemo (:654), so all 24 useRecomp() consumers re-render on any state change; AppLayout keeps every visited tab mounted via hidden divs (AppLayout.jsx:53-57), amplifying the cost. Split stable actions (already useCallback'd) into their own context and data into per-domain contexts or a selector store (useSyncExternalStore / the react-query cache). Fold in the six redundant state-shadowing refs (RecompContext.jsx:109-135) whose mirroring effects are already superseded by the custom setters. Memoizing the value alone barely helps because its deps span every slice.
- **Risk:** Highest-blast-radius refactor in the codebase; a missed consumer causes stale UI. Pair with the data-layer split above and lean on the fitness/e2e tests.

#### Android hardware-Back overlay/back-intent stack
- **Theme:** mobile · **Effort:** L · **Impact:** high · **Subagent-deployable:** yes
- **Goal:** Make system Back dismiss the open scanner / dialog / sheet instead of exiting the app or jumping pages underneath it.
- **Approach:** window.handleAndroidBack (AndroidBackHandler.jsx:10-26) only reasons about the router and returns false on a tab root, so pressing Back with the fixed-inset BarcodeScanner open on /nutrition (a tab root) kills the app; Radix dialogs only close on Escape, which a WebView never dispatches for Back. Add a back-intent stack (context that overlays register a close handler with, or push a history state on open and pop on Back); handleAndroidBack consults it FIRST and returns true when it handles the top handler. Wire BarcodeScanner/FoodPhotoScan and Radix Dialog/Sheet onOpenChange through it.
- **Risk:** Correct code is achievable from a well-known pattern, but true verification requires the Base44 WebView on a device/emulator, which CI cannot exercise.

#### Resolve the Play release blocker: over-broad AAB permissions
- **Theme:** security · **Effort:** L · **Impact:** high · **Subagent-deployable:** no — human-led
- **Goal:** Ship an AAB that only requests CAMERA (+INTERNET) so the Health & Fitness listing passes review.
- **Approach:** The Base44/Wix-wrapped AAB declares location/contacts/calendar/microphone/phone/broad-storage/device-audio and marks location+Bluetooth as required (docs/android-play-release.md:100-114), while the app only needs CAMERA for the barcode scanner. Base44 says generated permissions are not editable in-repo, so this is primarily a support escalation: send Base44 the package/version/failing-permission list and re-inspect their least-privilege rebuild. In-repo, make verify:android:aab (which inspectAab only runs when AAB_PATH is set, verify-android-release.mjs:363) a MANDATORY pre-upload gate, and add an assertion that CAMERA is present so a regenerated bundle can't silently drop the scanner.
- **Risk:** The core fix depends on Base44 support turnaround and is outside the repo; the in-repo CI gating is small but cannot by itself produce a compliant bundle.

### Phase 2

#### Offline-first: precached app shell + IndexedDB write outbox
- **Theme:** mobile · **Effort:** L · **Impact:** high · **Subagent-deployable:** no — human-led
- **Goal:** Survive signal loss mid-log: serve a cached shell and queue writes for replay on reconnect instead of dropping entries.
- **Approach:** There is no service worker, precache, or write queue anywhere (grep confirms); the only handling is OfflineBanner watching navigator.onLine and warning 'changes are not saved.' Add a VitePWA/workbox precached shell and an IndexedDB outbox that captures entity writes offline and flushes on reconnect. Must be validated against the Base44 managed wrapper — if a SW is forbidden at its origin, document and escalate rather than ship broken.
- **Risk:** Whether a SW can register at the Base44 wrapper origin is unverifiable from the repo; wrong assumptions could break the managed build. Prototype behind a check against the wrapper before committing.

#### Replace framer-motion with CSS transitions
- **Theme:** performance · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Drop ~39KB gz off the app shell every cold session and respect the OS reduce-motion setting app-wide.
- **Approach:** framer-motion's only use is one AnimatePresence opacity+translateX transition on non-tab routes (AppLayout.jsx:3,58-70); it lands ~39KB gz / ~117KB parse in the shell chunk loaded on every authenticated session. Replace with a GPU-composited CSS keyframe keyed on route, then npm rm framer-motion. Replicating AnimatePresence's exit animation in pure CSS is the fiddly part (React unmounts immediately), hence M not S. (The global `prefers-reduced-motion` accessibility fix is tracked separately as a Wave 0 quick win — it is independent of this migration and also covers MacroBar, ProgressRing, and PullToRefresh.)
- **Risk:** Losing the exit animation slightly changes route-transition feel; acceptable and reduced-motion-friendly.

#### Fix Progress O(n^2) trend/projection recompute and gate it while hidden
- **Theme:** performance · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Stop a heavy-user's Progress page from running ~250k main-thread ops on every daily-log write, even while the tab is hidden.
- **Approach:** chartData (Progress.jsx:33-43) calls calculateMovingAverage (trends.js:88-95) which re-filters the whole array per point (O(n^2)) then a second O(n^2) ma.find (:42); the projection memo re-runs dedupeLogsByDate multiple times (projections.js:77 and inside variance/confidence/trend helpers). Both depend on [logs] and Progress stays mounted via keep-alive, so they recompute on every optimistic+confirmed write. Dedupe once and pass the sorted array down, rewrite the moving average as an O(n) sliding window, replace ma.find with a date-keyed Map, and gate the heavy memos on an isActive prop. Well-bounded and unit-testable.
- **Risk:** Low; pure computation with existing projection tests as a guardrail.

#### Collapse the write path to a single round-trip
- **Theme:** performance · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Halve perceived save latency and radio wake on every log and habit tap over cellular.
- **Approach:** Each write does a scoped read then an upsert as two sequential awaits: upsertDailyLog does DailyLog.filter({date},...,10) (RecompContext.jsx:334) then invoke (:339); upsertHabitEntry does the same (:407 then :418). The extra read feeds client-side conflict/dedup resolution but doubles write latency (data volume is negligible, <=10 rows — this is a latency, not payload, fix). Move conflict resolution server-side into upsertTrackingRecord (it already returns the authoritative record), or skip the client read when the local copy is trusted, so each write is one round-trip.
- **Risk:** Touches the shared server function's merge semantics; needs a reconcile test to avoid regressing dedup correctness.

#### Today screen redesign: one hero, consolidated logging, IA cleanup
- **Theme:** ux · **Effort:** XL · **Impact:** high · **Subagent-deployable:** no — human-led
- **Goal:** Restore primacy to the single 'Best Move' value prop and cut Today from ~9 stacked, partly-duplicated cards to a scannable hierarchy.
- **Approach:** Today opens with BestMoveCard (Today.jsx:53) immediately followed by the co-equal RecompSignalHero (:55) — a second confidence-scored card reusing the identical 'High/Building/Early' vocabulary and its own 120px ring. Below them ~9 cards stack with real duplication: macro bars appear on Today and Nutrition, 'Latest read' is duplicated between Today.jsx:117 and Progress.jsx:131. Logging is also fragmented: QuickLogCard and QuickLogSheet both hold weight + workout_completed, and four separate Today controls open the sheet. Promote BestMoveCard to sole hero, demote RecompSignalHero to a compact strip or move it to Progress, drop the duplicated 'Latest read', and pick ONE canonical logging surface. This is the single highest-value place for a dedicated UI-design subagent pass — but it needs founder direction on what the one hero is.
- **Risk:** Product-judgment heavy; a redesign that removes RecompSignalHero must not orphan the strengthTrend signal it surfaces. Requires founder sign-off on IA before build.

#### Enforce 44px touch targets in shared UI primitives
- **Theme:** mobile · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Make every dialog/sheet dismiss and default control a comfortable thumb target.
- **Approach:** Radix Dialog and Sheet close buttons wrap only a 16px X with no padding in the screen corner (dialog.jsx:45-49, sheet.jsx:59-63); Button/Input default below 44px (h-9=36px, sm h-8=32px, input h-9). Give DialogClose/SheetClose a padded 44px hit area (p-2 -m-2 min-h-11 min-w-11, keep the 16px icon), bump the Button icon/sm/default sizes, and add a convention so control primitives never render below 44px on touch. Many call sites already override to min-h-11, so scope is the shared primitives.
- **Risk:** Bumping default control sizes can shift dense layouts; verify the tighter cards (Nutrition quick-add row) still fit.

### Phase 3

#### Recommendation-engine correctness fixes
- **Theme:** correctness · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Remove three logic defects that make Today and the weekly review disagree or ignore logged signals.
- **Approach:** Thread a single referenceDate from runWeeklyCheckIn into both analyzeTrends (defaults to today) and countConsecutiveFlatWeeks (defaults to last weigh-in) so the check-in stops mixing reference frames (recalculate.js:27,31; trends.js:100,117). Treat recovery as known when any of sleep/energy/soreness is logged so soreness-only users trigger fatigue protection (trends.js:159-165). Make the duplicate-record tie-break consistent between client (updated_date, RecompContext.jsx:56-60) and server (created_date, trackingRecordDomain.js:141-161). Each fix is small and ships with a targeted unit test.
- **Risk:** Low; localized pure-logic changes with clear test cases.

#### Add regression tests for the four untested fitness modules
- **Theme:** maintainability · **Effort:** L · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Bring nutritionScoring, strengthTrend, trainingAnalysis, adaptiveGoalEngine under the CI test:fitness gate.
- **Approach:** nutritionScoring (Nutrition.jsx:159) and strengthTrend (RecompSignalHero.jsx:20) are user-facing yet untested. Add tests for nutritionScoring thresholds/guards, strengthTrend MIN_SPAN_DAYS/window filtering, summarizeStrengthProgress 1RM fallback, and adaptiveGoalEngine confidence tiers — plus fix its estimateObservedTdee middle-index double-count (adaptiveGoalEngine.js:56-57) with a linear-series slope assertion. Note adaptiveGoalEngine/summarizeTrainingLoad are exported but not wired into any page today, so prioritize the two live modules.
- **Risk:** Low; pure additive test work, ideal for autonomous execution.

#### Backend & web hardening: rate limits, waitlist limiter, CSP
- **Theme:** security · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Cap paid-inference abuse, stop unconsented waitlist enrolment, and confirm framed-origin protection.
- **Approach:** coachReply invokes InvokeLLM on every authenticated POST with no throttle (entry.ts:127) while cheaper siblings do throttle — add per-user rate limiting mirroring reportAiContent (10/hour), ideally backed by a Base44 shared store not per-instance memory. The waitlist limiter keys on client-controlled forwarded IP headers in an in-memory Map (joinWaitlist/entry.ts:16-43), trivially bypassed — move it to a gateway/shared store or add CAPTCHA and treat IP headers as untrusted. Separately, confirm the deployed Base44 origin returns CSP frame-ancestors + X-Frame-Options (index.html ships none) and add a response-header assertion to verify:android:live.
- **Risk:** The cross-instance limiter and CSP verification depend on Base44 platform capabilities that may need a shared store or support input; the CSP exploitability is web-only and unverifiable from the repo.

#### Accessibility pass: heading hierarchy, aria labels, ring semantics, history windowing
- **Theme:** ux · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Make screen-reader navigation and the densest lists usable without touching the visual design.
- **Approach:** Today has one h1 and one h2 (BestMoveCard); every other section header is a styled div (Today.jsx:82,99,117; RecompSignalHero.jsx:83; HabitsCard.jsx:76) — give each a real h2/h3 styled to match so TalkBack users can skim by heading. Interpolate the habit name into stepper aria-labels (HabitsCard.jsx:135,145 are bare 'Decrease'/'Increase') and give ConfidenceRing/ProgressRing role=img with value+max labels. Cap SessionHistory's unwindowed render (SessionHistory.jsx:61-120) for heavy users. All additive, no visual change.
- **Risk:** Low; purely additive semantics and a bounded-DOM cap.

#### Design-system type-token unification for dynamic type
- **Theme:** ux · **Effort:** M · **Impact:** medium · **Subagent-deployable:** yes
- **Goal:** Let the app's pervasive metadata/eyebrow text scale with the Android system font setting.
- **Approach:** text-[10px] appears 33 times across 14 files as the primary eyebrow/chip/unit style (BestMoveCard.jsx:28,32; More.jsx identity pills; RecompSignalHero labels); Tailwind text-[10px] compiles to an absolute px size that (unlike rem-based text-xs) does not respond to root font-size. Replace the ad-hoc scale with a rem-based label token (~0.75rem, min 11-12px). Best done as one mechanical design-system pass alongside the touch-target and active-tab work.
- **Risk:** Real-device scaling also depends on the Base44 WebView textZoom config (unverified); the rem migration is correct regardless but confirm on device.

#### Cache-stable vendor chunk via manualChunks
- **Theme:** performance · **Effort:** M · **Impact:** low · **Subagent-deployable:** yes
- **Goal:** Keep the framework bytes cached across app updates on flaky cellular.
- **Approach:** vite.config.js declares no build.rollupOptions; the single hashed entry chunk (393.82KB raw / 129.37KB gz: React, react-dom, react-router-dom v7, react-query, @base44/sdk) is busted by any app-code change, forcing a full re-download. Add manualChunks isolating a stable react-vendor group (and optionally base44). No first-install byte reduction — purely warm-start/update behavior — so lowest priority.
- **Risk:** Mis-grouping can accidentally split shared code and add requests; verify chunk graph after.

#### Private-file & localStorage deletion hygiene before enabling scan flags
- **Theme:** security · **Effort:** M · **Impact:** low · **Subagent-deployable:** yes
- **Goal:** Ensure body/food photos and cached AI results are truly purgeable before the scan features ship.
- **Approach:** createPrivateAnalysisUrl uploads each scan image and returns a fileUri that callers discard (BodyCompositionScan.jsx:88-93, FoodPhotoScan.jsx:120-123); no code deletes it and deleteAccount purges only entities/User. BodyCompositionScan also caches the body-fat estimate unencrypted in localStorage (:129), cleared only by same-device in-app deletion, not logout. Track every fileUri and delete after InvokeLLM returns (plus in deleteAccount), and move the scan cache to sessionStorage or clear it on logout. Both scan flags are OFF by default, so this is latent — keep them off until Base44 confirms a delete-file API.
- **Risk:** Blocked on whether Base44 exposes a private-file delete API; if not, the mitigation is to keep the flags off.

## Delegating to subagents

- Coding subagent: convert BarcodeScanner + FoodPhotoScan (Nutrition.jsx:17-18) and BodyCompositionScan (Progress.jsx:11) to React.lazy + Suspense behind their existing state/flag gates; verify with a production build diff of the Nutrition and Progress chunks.
- Coding subagent: add the optimistic write to upsertHabitEntry (RecompContext.jsx:401-438) mirroring upsertDailyLog, with rollback-on-error, and an e2e test that the habit ring moves before the network resolves.
- Coding subagent: dependency + asset cleanup PR — npm rm the 11 unused deps, delete ui/chart.jsx and ui/sonner.jsx, remove the two 1.2MB brand PNGs, update android-release.test.js; confirm build still green.
- Coding subagent: rewrite calculateMovingAverage as an O(n) sliding window, replace ma.find with a date-keyed Map, dedupe logs once, and gate the Progress memos on isActive (Progress.jsx:33-52, trends.js:88); guard with the existing projection tests.
- Coding subagent: correctness batch — thread referenceDate through runWeeklyCheckIn, make recovery_label honor soreness-only, unify the duplicate-record tie-break, and fix estimateObservedTdee's middle-index overlap, each with a unit test.
- Coding subagent: write the missing test suites for nutritionScoring, strengthTrend, summarizeStrengthProgress, and adaptiveGoalEngine under tests/fitness.
- Coding subagent: accessibility pass — real h2/h3 section headings, habit-name-interpolated stepper aria-labels, role=img on the rings, and a windowing cap on SessionHistory; purely additive, no visual diff.
- Coding subagent: design-system unification — replace text-[10px] with a rem label token, pad DialogClose/SheetClose to 44px, add the active-tab affordance and tap-highlight reset.
- Coding subagent: add per-user rate limiting to coachReply mirroring reportAiContent, and harden the waitlist limiter off client-controlled IP headers.
- UI-design subagent (needs founder brief first): redesign the Today screen around a single Best Move hero with one canonical logging surface, producing 2-3 IA options before implementation.

## Reliability blind spots (completeness critic)

The roadmap is unusually thorough on bundle, render-performance, mobile-webview, correctness, and backend abuse — those dimensions are well covered and correctly prioritized. Its gaps cluster in one theme the audit never opened: production reliability/observability. It never examined ErrorBoundary.jsx, AuthContext.jsx, base44Client.js, or Onboarding.jsx, and it never raises crash reporting or analytics — even though the code deliberately disables Base44's tracker (vite.config.js:16) and swallows crashes to console (ErrorBoundary.jsx:14-16). For a consumer app about to ship to Google Play, shipping blind to crashes and funnel drop-off is a higher-priority hole than much of the proposed Phase 3. Two sequencing corrections follow from this: (1) add route-level error boundaries and chunk-load-retry BEFORE the Wave-1 high-blast-radius data/context refactors that themselves risk white-screening; (2) instrument/audit the onboarding funnel before spending an XL redesigning the Today screen it gates. Minor miscall: reduced-motion is an S Wave-0 win the roadmap defers into a Phase-2 M initiative. None of this contradicts the roadmap's existing findings — it fills the reliability/observability blind spot around them."

### Observability — crash reporting & product analytics (whole risk class skipped)
- Neither the audit nor the roadmap ever examined ErrorBoundary.jsx or raised production visibility. ErrorBoundary.jsx:14-16 swallows every crash into console.error with no reporter; grep finds zero event/telemetry code in src (no logEvent/trackEvent/telemetry); and vite.config.js:16 sets Base44's built-in analyticsTracker:false with nothing replacing it. Privacy.jsx:68 even tells users 'de-identified analytics may be used,' which the code contradicts. A consumer app shipping to Play with no crash reports and no funnel metrics is flying blind — this outranks much of the roadmap's Phase 3, and it is the biggest single omission.
- **Action:** Wire componentDidCatch to a lightweight crash reporter (or Base44 logging), add minimal daily-loop + onboarding funnel events, and reconcile the Privacy copy with reality. Do it alongside the Play release, not after — you cannot triage post-launch crashes you cannot see.

### Error-isolation sequencing vs. the high-blast-radius refactors
- App.jsx:103 is the ONLY ErrorBoundary, wrapping the whole Router; there are no per-route/per-tab boundaries. Because AppLayout keep-alive mounts every visited tab, a render throw in any one tab unmounts the entire app to a full-screen 'Something went wrong,' whose only recovery is window.location.reload() → a full 13-collection cold start (ErrorBoundary.jsx:18-21). The roadmap's two riskiest Wave-1 items (mega-context split, eager-load split) explicitly warn they can 'white-screen the app,' yet no initiative adds the per-route isolation that would contain such regressions.
- **Action:** Add route-level ErrorBoundaries (with in-place reset, not full reload) as a Wave-0 safety net BEFORE the substrate refactors — cheap, and it de-risks the two scariest initiatives on the plan.

### Auth/session layer never examined; no mid-session 401 recovery
- The audit deep-dived RecompContext but skipped auth entirely. AuthContext.jsx:96-119 checks the user once on mount, and base44Client.js adds only a login-redirect binding — no 401/403 response interceptor. When a token expires during a multi-week daily-driver session, every write 401s into a destructive toast with no re-auth prompt. Combined with the already-flagged missing offline write-outbox, the two together mean daily-log loss after a visible write failure — with no re-auth prompt or retry — on expiry, not just a bad UX moment.
- **Action:** Add a global 401 handler that triggers re-auth/refresh, and fold it into the offline/write-resilience initiative rather than leaving the whole auth layer unaudited.

### First-run onboarding funnel unexamined (retention substrate under the Today redesign)
- Onboarding.jsx is a 336-line multi-step gated flow that decides whether users ever reach the Today screen the roadmap spends an XL redesigning — yet no finding covers its length, validation, drop-off, or error states. With analytics disabled (gap #1) the team cannot even measure where first-run users abandon. Redesigning Today before auditing/instrumenting the funnel that feeds it is an altitude inversion.
- **Action:** Add an onboarding UX + completion-instrumentation pass ahead of (or paired with) the Today redesign so redesign effort targets a screen users actually reach.

### No chunk-load-error recovery for a publish-often delivery model
- 25 React.lazy routes (App.jsx:16-44) with no vite:preloadError/ChunkLoadError handling anywhere (grep: none). Given the documented loop (push → Base44 Builder → user republishes), returning users on a stale index.html will request dead chunk hashes; today that surfaces as the root ErrorBoundary's white-screen-reload instead of a graceful retry. The manualChunks initiative addresses cache efficiency but not stale-chunk recovery — a more likely failure than several Phase-3 items given release cadence.
- **Action:** Add a preloadError/import-retry handler (retry once, then a single hard reload) — an S-effort item that belongs in Wave 0, not omitted.

### prefers-reduced-motion mis-sequenced and effort-miscalled
- The roadmap buries reduced-motion inside the Phase-2 M 'framer-motion→CSS' initiative, but the verified finding itself states effort is 'closer to S than M,' and the win is independent of the framer-motion removal (it also covers MacroBar/ProgressRing/PullToRefresh CSS motion). Coupling a cheap, systemic accessibility fix to an M refactor needlessly delays it by a whole wave.
- **Action:** Split out a standalone global @media(prefers-reduced-motion) block + MotionConfig into the Wave-0 quick wins; leave the framer-motion→CSS swap as its own separate Phase-2 task.

---

## Appendix — all verified findings by dimension

### bundle-build-deps (8)

- **[high/S] Fuel tab eagerly bundles the @zxing barcode scanner (~110KB gz) that only mounts on tap** — BarcodeScanner is statically imported at Nutrition.jsx:17 but only rendered behind {showScanner && ...} at Nutrition.jsx:226-231. It imports BrowserMultiFormatReader from @zxing/browser (BarcodeScanner.jsx:2), pulling @zxing/library too. Nutrition (Fuel) is a lazy route-level chunk loaded on first tab visit, so every user pays the decoder's parse/eval just to log food manually.
  - Fix: const BarcodeScanner = React.lazy(() => import('@/components/nutrition/BarcodeScanner')) and wrap the {showScanner && ...} block in <Suspense>. @zxing then loads only on tap. Fold the flag-gated FoodPhotoScan into the same Suspense.
  - Files: `src/pages/Nutrition.jsx` · `src/components/nutrition/BarcodeScanner.jsx`
- **[low/S] Flag-OFF FoodPhotoScan is statically bundled into the Fuel chunk** — FoodPhotoScan is statically imported at Nutrition.jsx:18 but only rendered behind {featureFlags.foodPhotoScan && showPhotoScan && ...} at Nutrition.jsx:233, and foodPhotoScan defaults OFF (featureFlags.js:9, VITE_ENABLE_FOOD_PHOTO_SCAN unset). Its JSX + prompt/schema strings parse on every Fuel-tab visit despite being unreachable in the shipped build.
  - Fix: React.lazy it behind the same flag+state gate, folded into the BarcodeScanner Suspense. With the flag OFF the dynamic chunk is never fetched in production.
  - Files: `src/pages/Nutrition.jsx` · `src/lib/featureFlags.js` · `src/components/nutrition/FoodPhotoScan.jsx`
  - Verdict: partial
- **[low/S] Flag-OFF BodyCompositionScan is statically bundled into the Progress chunk** — BodyCompositionScan is statically imported at Progress.jsx:11 but only rendered behind {featureFlags.bodyCompositionScan && <BodyCompositionScan />} at Progress.jsx:160, and the flag defaults OFF (featureFlags.js:14). It does NOT use three.js — it calls base44.integrations.Core.InvokeLLM with photos (BodyCompositionScan.jsx:118).
  - Fix: React.lazy it behind the flag+state gate so the disabled feature ships nothing.
  - Files: `src/pages/Progress.jsx` · `src/lib/featureFlags.js` · `src/components/progress/BodyCompositionScan.jsx`
- **[medium/M] framer-motion (~39KB gz) loaded on the app shell for a trivial fade/slide transition** — AppLayout (the tab shell rendered for every authenticated session) imports motion/AnimatePresence from framer-motion (AppLayout.jsx:3). The sole usage is one AnimatePresence opacity+translateX transition on non-tab-root pages (AppLayout.jsx:58-70, duration 0.2s). It is the only framer-motion import in all of src.
  - Fix: Replace the motion.div with a CSS keyframe/transition (opacity + translateX, prefers-reduced-motion aware) keyed on route, then remove framer-motion from package.json:62. Note: replicating AnimatePresence exit animation in pure CSS is non-trivial (React unmounts immediately), hence effort M is fair.
  - Files: `src/components/AppLayout.jsx`
- **[low/S] Eleven declared dependencies are never imported (largest: three, jspdf, moment, lodash)** — Zero src imports of three (pkg:83), jspdf (65), moment (68), lodash (66), html2canvas (63), react-leaflet (75, transitive leaflet), react-markdown (76), canvas-confetti (56), @hello-pangea/dnd (24), sonner (80, imported only by the orphaned ui/sonner.jsx), react-hot-toast (74, only in a code comment). None ship in the JS bundle (Rollup only bundles imported modules), so runtime cost is zero; the cost is install size, Base44 AAB build inputs, and supply-chain surface.
  - Fix: npm rm three jspdf moment lodash html2canvas react-leaflet react-markdown canvas-confetti @hello-pangea/dnd sonner react-hot-toast in one PR (delete ui/sonner.jsx alongside — see orphaned-files finding — so sonner's only importer is gone). Keep the Radix toast stack wired via App.jsx:2.
  - Files: `package.json`
- **[low/S] Orphaned UI files import heavy libs (recharts, sonner) but are never used** — ui/chart.jsx does `import * as RechartsPrimitive from 'recharts'` (chart.jsx:3) and ui/sonner.jsx imports sonner (sonner.jsx:3), but no file in src imports either. They are shadcn scaffolding. They do not ship, but they keep sonner looking 'used' and obscure that recharts is used only by Progress.
  - Fix: Delete src/components/ui/chart.jsx and src/components/ui/sonner.jsx, which makes the sonner dep removal unambiguous and leaves recharts imported only from the Progress route.
  - Files: `src/components/ui/chart.jsx` · `src/components/ui/sonner.jsx`
- **[low/S] Two 1.2MB brand PNGs ship in the app bundle but are never loaded by the app** — public/brand/recompone-mark-master.png (1,169,981 B) and recompone-logo-primary.png (1,191,745 B) are copied into dist/ (and thus the Play AAB) but have no runtime reference in src or index.html. recompone-logo-primary is referenced only by a build-time dimension check (android-release.test.js:86). index.html's og:image/twitter:image (lines 19,26) point at an absolute fitnesstrackerapps.com URL, so the WebView never loads any brand PNG.
  - Fix: Remove recompone-mark-master.png and recompone-logo-primary.png from public/brand (update android-release.test.js accordingly). If an in-app logo is needed, add an optimized SVG/<100KB asset and import it so Vite fingerprints it. Keep /icons/* PWA icons.
  - Files: `public/brand/recompone-mark-master.png` · `public/brand/recompone-logo-primary.png` · `index.html`
- **[low/M] No manualChunks/rollupOptions — entry chunk is framework-heavy and re-downloads on every app update** — vite.config.js declares no build.rollupOptions.output.manualChunks (no build key at all). Route-level React.lazy (App.jsx) already splits pages well, so heavy libs do not leak into startup. The residual issue is the single hashed entry chunk index-*.js at 393.82 kB raw / 129.37 kB gz (React + react-dom + react-router-dom v7 + @tanstack/react-query + @base44/sdk) — largely irreducible, but any app-code change busts the whole file and forces a full re-download.
  - Fix: Add manualChunks isolating stable vendor code (e.g. a react-vendor group: react, react-dom, react-router-dom; optionally a base44 group). No byte reduction, but keeps the framework chunk cache-stable across releases. Lower priority than the @zxing and framer-motion wins.
  - Files: `vite.config.js` · `src/App.jsx`

### runtime-react-arch (8)

- **[high/L] Entire app gated behind eager fetch of 13 full collections before first paint** — loadAll() (RecompContext.jsx:168-223) fetches 13 entities in one Promise.all (parallel, not a waterfall). RequireOnboarding (RecompContext.jsx:665-673) renders a full-screen spinner while `loading` is true, and `loading` stays true until every one of the 13 lists resolves, so Today cannot paint until strength history, foods, recipes, templates, decision ledger and check-ins have all downloaded. Domain data does NOT flow through react-query, so every reload()/pull-to-refresh re-downloads all 13 collections from scratch with no caching.
  - Fix: Split into a critical set (UserProfile, UserPreferences, CurrentStrategy, recent DailyLog) that unblocks Today, and a deferred set loaded lazily per tab. Route domain fetches through the already-mounted react-query cache so tab data is cached/stale-while-revalidate instead of re-fetched wholesale. Reduce the -date limits (trends only look back 14-28 days).
  - Files: `src/lib/RecompContext.jsx:168` · `src/lib/RecompContext.jsx:172` · `src/lib/RecompContext.jsx:665`
- **[high/L] Single mega-context with unmemoized value re-renders every consumer on any state change, amplified by tab keep-alive** — The context value is a plain object literal rebuilt on every provider render (RecompContext.jsx:609-652) and passed straight to Ctx.Provider (:654) with NO useMemo, so its identity changes on every provider render and all useRecomp() consumers re-render regardless of which slice they read. AppLayout keeps every visited tab root mounted via hidden divs (AppLayout.jsx:25, 53-57), so once Today/Nutrition/Training/Progress/More have been opened, one optimistic daily-log write triggers multiple provider renders (optimistic setLogsCurrent :325, confirmed setLogsCurrent :348, setProfile :364) each re-rendering every mounted page.
  - Fix: Split the stable action/dispatch functions (already useCallback'd) into their own context, and split data into per-domain contexts or a selector store (useSyncExternalStore / react-query cache) so a logs change does not re-render habit- or training-only components. Memoizing the value alone barely helps because its deps span every slice.
  - Files: `src/lib/RecompContext.jsx:609` · `src/lib/RecompContext.jsx:654` · `src/components/AppLayout.jsx:53` · `src/components/AppLayout.jsx:25`
- **[high/S] Habit +/- taps have no optimistic update and block on two sequential network calls** — upsertHabitEntry (RecompContext.jsx:401-438) awaits a remote HabitEntry.filter (:407) and then the upsertTrackingRecord invoke (:418) BEFORE calling setHabitEntriesCurrent (:427). There is no optimistic write, unlike upsertDailyLog which sets state immediately at :325. So the ProgressRing / streak / counter in HabitsCard does not move until both network calls return. enqueueByKey serializes taps per habit:date key (:404, :77-90), so rapid + taps on a count habit (e.g. Water) queue and each still does filter+invoke sequentially.
  - Fix: Mirror upsertDailyLog: compute the optimistic entry from habitEntriesRef and setHabitEntriesCurrent immediately, then reconcile/rollback after the round-trip. Instant feedback plus the existing queue collapses redundant server writes.
  - Files: `src/lib/RecompContext.jsx:401` · `src/lib/RecompContext.jsx:407` · `src/lib/RecompContext.jsx:427` · `src/components/today/HabitsCard.jsx:61`
- **[medium/M] Progress page re-runs O(n^2) moving-average and multi-pass projection on every logs change, even while hidden** — chartData (Progress.jsx:33-43) calls calculateMovingAverage (trends.js:88-95) which re-filters the whole array via logsInCalendarWindow for every point — O(n^2) — then does a second O(n^2) pass via `ma.find` inside weights.map (:42). The projection memo (Progress.jsx:52) calls generateWeightProjection which re-runs dedupeLogsByDate multiple times (projections.js:77, and again inside calculateWeightVariance:36, calculateProjectionConfidence:45, calculateWeightTrend:23). Both memos depend on [logs] and Progress stays mounted (kept-alive by AppLayout), so they recompute on every optimistic+confirmed daily-log write even while hidden.
  - Fix: Dedupe logs once and pass the sorted array down; rewrite calculateMovingAverage as an O(n) sliding window; replace `ma.find` with a Map keyed by date. Gate the heavy memos on an isActive prop so they don't recompute while the page is hidden, or compute the trend once in context.
  - Files: `src/pages/Progress.jsx:33` · `src/pages/Progress.jsx:42` · `src/pages/Progress.jsx:52` · `src/lib/fitness/trends.js:88` · `src/lib/fitness/projections.js:76`
- **[medium/M] Every write issues an extra scoped read before the upsert (two sequential round-trips), but it is a bounded filter, not a full-collection read** — upsertDailyLog does DailyLog.filter({ date }, '-created_date', 10) (:334) then invoke('upsertTrackingRecord') (:339) — two sequential awaited round-trips per save. upsertHabitEntry does the same: HabitEntry.filter({ habit_id, date }, '-created_date', 10) (:407) then invoke (:418). The extra read exists for conflict/dedup resolution (feeds `existing` via newestByKey) but doubles write-path latency.
  - Fix: Move the conflict-resolution read server-side into upsertTrackingRecord (it already returns the authoritative record), or skip the client filter when the local copy is trusted, so each write is a single round-trip.
  - Files: `src/lib/RecompContext.jsx:334` · `src/lib/RecompContext.jsx:339` · `src/lib/RecompContext.jsx:407` · `src/lib/RecompContext.jsx:418`
  - Verdict: partial
- **[low/S] Best-move and per-render derived values on Today are not memoized** — Today.jsx rebuilds the `consumed` object (:30-36), the `liftingDaysThisWeek` Set from filtering all sessions (:38-42), and calls deriveBestMove (:43) on every render. Today is a context consumer (:25) so it re-renders on every context change, running these on unrelated log actions. None are wrapped in useMemo.
  - Fix: Wrap bestMove in useMemo keyed on [preferences, signal, strategy, todayLog, trend] and liftingDaysThisWeek on [sessions]; ideally lift bestMove/trend into shared context memos.
  - Files: `src/pages/Today.jsx:30` · `src/pages/Today.jsx:38` · `src/pages/Today.jsx:43`
  - Verdict: partial
- **[low/M] Six state-shadowing refs kept in sync by redundant effects** — profileRef/preferencesRef/strategyRef/logsRef/sessionsRef/habitEntriesRef (:109-114) each shadow a useState slice and are mirrored by six useEffects (:118-135). The custom setters setLogsCurrent (:137-143), setSessionsCurrent (:145-151) and setHabitEntriesCurrent (:160-166) already write their ref synchronously, making the matching effects (:127-135) redundant. profileRef/preferencesRef/strategyRef are updated by direct assignment in some paths (loadAll :192-194, completeOnboarding :246/:254/:264, updateProfile :272) AND by effect — two sources of truth that can desync.
  - Fix: Update each ref only inside its custom setter (drop the mirroring effects), or collapse to a single stateRef holding the whole snapshot, removing six post-render effects and a desync class.
  - Files: `src/lib/RecompContext.jsx:109` · `src/lib/RecompContext.jsx:118` · `src/lib/RecompContext.jsx:137`
- **[low/M] History lists render without windowing** — SessionHistory (SessionHistory.jsx:43-51, 61-120) groups and renders every session (loadAll pulls up to 200, RecompContext.jsx:177) by day with nested per-exercise set summaries and no virtualization; a power user hits a large DOM on a secondary page. The food library is correctly capped to 12 (Nutrition.jsx:158) and HabitsCard's entriesByHabit is memoized (HabitsCard.jsx:52-59), so the issue is isolated to history views (sessions, decision ledger).
  - Fix: Cap the initial render for SessionHistory and the decision-ledger timeline (e.g. last 20 days with a 'show more') or use lightweight windowing. Not urgent — these are non-landing pages.
  - Files: `src/components/training/SessionHistory.jsx:61` · `src/lib/RecompContext.jsx:177`

### mobile-android-webview (6)

- **[high/L] Android hardware Back never dismisses state-driven overlays; can exit the app with a modal open** — window.handleAndroidBack only reasons about the router and has no awareness of the app's state-driven overlays (full-screen BarcodeScanner, Radix Dialogs/Sheets). On a tab root it returns false so the Base44 wrapper exits the app; on a subroute it navigate(-1) away underneath the open overlay.
  - Fix: Add a back-intent/overlay stack (context that overlays register a close handler with, or push a history state on open and pop on Back). handleAndroidBack should consult it FIRST and invoke the top handler returning true before any route logic; wire BarcodeScanner/FoodPhotoScan and the Radix Dialog/Sheet onOpenChange through it.
  - Files: `src/components/AndroidBackHandler.jsx` · `src/lib/tabNavigation.js` · `src/components/nutrition/BarcodeScanner.jsx` · `src/pages/Nutrition.jsx` · `src/pages/Coach.jsx`
- **[high/L] No offline support: no service worker, no cached shell, no write queue for a flaky-network app** — Confirmed: there is no service worker, no PWA/precache, and no write outbox anywhere. Manifest is display:standalone. The only offline handling is OfflineBanner, which watches navigator.onLine and shows 'changes are not saved.' Two impact claims are NOT verifiable from the repo and are slightly overstated: (a) 'cold launch offline = blank app' depends on whether Base44's AAB bundles assets locally vs. loads a remote origin — not determinable from this codebase; (b) mid-session writes are not truly 'silent' — failures surface a destructive toast and the banner pre-warns the user not to log while offline.
  - Fix: Add a precached app shell (VitePWA/workbox, verified against the Base44 wrapper build) and an IndexedDB write outbox that flushes on reconnect instead of dropping entity writes. If the managed wrapper forbids a SW at its origin, document/escalate. The banner still over-promises by implying 'not saved' is the whole story.
  - Files: `src/components/OfflineBanner.jsx` · `vite.config.js` · `public/manifest.json` · `src/main.jsx`
  - Verdict: partial
- **[medium/S] Fixed top overlays (offline banner, toast viewport) ignore safe-area-inset-top and render under the status bar/notch** — The app is edge-to-edge (viewport-fit=cover) and pads tab bar/main/ChildTopBar with env(safe-area-*), but the two always-top overlays skip safe-area-inset-top, so on notched/edge-to-edge Android they draw under the status bar / camera cutout.
  - Fix: Add pt-[env(safe-area-inset-top)] (or top-[env(safe-area-inset-top)]) to OfflineBanner's fixed container and to the toast viewport so top-anchored transient UI clears the status bar/notch.
  - Files: `src/components/OfflineBanner.jsx` · `src/components/ui/toast.jsx` · `index.html`
- **[medium/S] Coach chat height uses a hardcoded 8.5rem offset that doesn't track safe-area-inset-top** — Coach sizes its column at h-[calc(100dvh-8.5rem)] inside AppLayout's main, which adds pt-[calc(env(safe-area-inset-top)+1rem)] and pb-28. Because the chat offset is a fixed 8.5rem that ignores the safe-area insets the layout does honor, total content extends past 100dvh by ~(safe-area-inset-top - 0.5rem), pushing the composer + 'not medical advice' footer under the fixed bottom tab bar on large-notch / gesture-nav devices.
  - Fix: Derive the height from the same insets, e.g. h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))], or let the chat column flex within main instead of a viewport-relative magic number.
  - Files: `src/pages/Coach.jsx` · `src/components/AppLayout.jsx`
- **[medium/M] Sub-44px touch targets in shared UI primitives (dialog/sheet close X ~16px; default button/input 32-36px)** — The Radix Dialog and Sheet close buttons wrap only a 16px X with no padding/min-size in the screen corner, so the hit area is ~16px on every dialog/sheet. Button and Input primitives default below 44px (h-9=36px, sm h-8=32px, icon h-9 w-9). Many call sites override with min-h-11, but the shared primitives ship under the touch minimum.
  - Fix: Give DialogClose/SheetClose a padded 44px hit area (e.g. p-2 -m-2 min-h-11 min-w-11 keeping the 16px icon). Consider bumping Button icon/sm/default and add a convention so control primitives never render below 44px on touch.
  - Files: `src/components/ui/dialog.jsx` · `src/components/ui/sheet.jsx` · `src/components/ui/button.jsx` · `src/components/ui/input.jsx`
- **[low/S] No -webkit-tap-highlight-color reset, so taps flash the default WebView highlight** — The chrome-element block disables selection and touch-callout but never sets -webkit-tap-highlight-color: transparent, so tapping links/buttons in the Android WebView shows the default translucent tap rectangle — a small 'this is a web page' tell.
  - Fix: Add -webkit-tap-highlight-color: transparent (on html or the chrome-element selector block) and rely on existing active/hover styles for feedback.
  - Files: `src/index.css`

### ux-visual-a11y (8)

- **[high/XL] Today screen dilutes the "one Best Move" value prop with two co-equal heroes + duplicated data** — Today opens with BestMoveCard (Today.jsx:53) immediately followed by RecompSignalHero (Today.jsx:55), a second heavy confidence-scored card. Both carry the identical confidence vocabulary. Below them ~9 cards stack, several redundant.
  - Fix: Promote BestMoveCard to sole hero; demote RecompSignalHero to a compact strip or move it toward Progress. Collapse duplicate calorie/macro surfaces into one and drop the 'Latest read' block from Today since it also lives on Progress. Highest-value single place for a dedicated Today-redesign pass.
  - Files: `src/pages/Today.jsx` · `src/components/today/RecompSignalHero.jsx` · `src/pages/Progress.jsx`
- **[medium/M] No prefers-reduced-motion handling anywhere (framer-motion + CSS transitions)** — Repo-wide grep for prefers-reduced-motion / useReducedMotion / MotionConfig returns zero. AppLayout slides x-translate + opacity on non-tab route changes via framer-motion, which does not auto-respect the OS setting. CSS motion (MacroBar width, ProgressRing stroke, chevrons, PullToRefresh) is unconditional.
  - Fix: Add a global @media (prefers-reduced-motion: reduce) block in index.css and wrap the app in framer-motion <MotionConfig reducedMotion="user"> (or gate the AppLayout slide with useReducedMotion). Cheap and systemic — effort is closer to S than M.
  - Files: `src/components/AppLayout.jsx` · `src/components/common/MacroBar.jsx` · `src/components/common/ProgressRing.jsx` · `src/index.css`
- **[medium/M] No heading hierarchy below the page h1 — section titles are plain divs** — Today has an h1 and exactly one h2 (BestMoveCard). Every other section header is a styled div, so screen-reader users navigating by heading land on h1, jump to the single h2, and cannot reach the rest of the day's sections. Pattern repeats on Nutrition/Progress.
  - Fix: Give each card section a real h2/h3 styled to match the current div, exposing a navigable outline. Purely additive, no visual change.
  - Files: `src/pages/Today.jsx` · `src/components/today/RecompSignalHero.jsx` · `src/components/today/HabitsCard.jsx` · `src/components/today/QuickLogCard.jsx`
- **[medium/M] Fragmented daily-logging model: two overlapping log surfaces + 4 triggers** — QuickLogCard is an inline card logging weight + workout_completed; QuickLogSheet is a bottom sheet logging a superset including weight and workout_completed, so both fields exist in two surfaces. Four separate controls on Today open the sheet, giving two mental models for 'log today' and two weight entry points.
  - Fix: Pick one canonical logging surface — either fold QuickLogCard's weight/workout into the sheet and make the card a single launcher, or keep the inline card as the fast path and remove weight/workout from the sheet.
  - Files: `src/components/today/QuickLogCard.jsx` · `src/components/today/QuickLogSheet.jsx` · `src/pages/Today.jsx`
- **[medium/M] Pervasive hardcoded 10px type ignores OS font-scaling (dynamic type)** — text-[10px] appears 33 times across src and is the app's primary eyebrow/metadata style (uppercase + tracking-wider + font-mono + muted-foreground). Tailwind text-[10px] compiles to an absolute font-size:10px which, unlike rem-based text-xs, does not respond to the root font-size.
  - Fix: Replace the ad-hoc 10px scale with a rem-based label token (~0.75rem) so metadata scales with OS setting, and bump the smallest label to 11-12px. Best handled in a design-system unification pass.
  - Files: `src/components/today/BestMoveCard.jsx` · `src/pages/More.jsx` · `src/index.css`
  - Verdict: partial
- **[low/S] Navigation label inconsistency: tabs 'Fuel'/'Train' vs pages 'Nutrition'/'Training' vs metadata** — Tab bar labels sections 'Fuel'/'Train' but destination h1s say 'Nutrition'/'Training', and route metadata is split (/nutrition title 'Fuel', /training title 'Training'). More links 'Meal templates' and 'Grocery list' both to bare /nutrition and 'Manage habits' to /today with no scroll target, unlike 'Custom targets' which deep-links.
  - Fix: Choose one name per section for tab, h1, and metadata. Add anchors/scroll targets for the More deep-links as already done for targets.
  - Files: `src/components/AppLayout.jsx` · `src/pages/Nutrition.jsx` · `src/pages/Training.jsx` · `src/lib/routeMetadata.js` · `src/pages/More.jsx`
- **[low/S] Active tab is indicated by hue only (teal vs muted), no shape/weight/indicator** — Bottom-nav active state changes only text color (text-teal vs text-muted-foreground), same icon/weight, no underline/pill/filled icon. In light mode teal #12836f and muted-foreground #61706a are both dark desaturated greens, so the selected tab differs only by a subtle hue shift. aria-current is present, so this is a visual-only gap.
  - Fix: Add a non-color active affordance: filled/duotone icon, a top indicator bar, or bolder weight, in addition to teal.
  - Files: `src/components/AppLayout.jsx`
- **[low/S] Generic labels on repeated icon buttons; decorative rings lack semantics** — Habit stepper +/- buttons are labeled just 'Decrease'/'Increase' with no habit name, so with several counter-habits a screen-reader user hears repeated 'Increase' with no way to tell which habit each pair controls. ConfidenceRing and ProgressRing render their value visually with no role=img/aria-label packaging value+max+meaning.
  - Fix: Include the habit name in stepper aria-labels (e.g. 'Increase water'), and give the rings role="img" with an aria-label conveying value + max + meaning. Small localized edits.
  - Files: `src/components/today/HabitsCard.jsx` · `src/components/common/ConfidenceRing.jsx` · `src/components/common/ProgressRing.jsx`

### correctness-quality (7)

- **[medium/S] Best Move gives a confident "Hold targets steady" with zero nutrition data, contradicting the weekly engine** — deriveBestMove treats missing adherence as perfect adherence, so a user with weight logs but no food/step logs falls through to the terminal hold-steady card, while the weekly engine correctly returns keep_collecting_data for the same input.
  - Fix: Add an explicit missing-data guard before the adherence gates: if calorie_adherence (and/or protein/step) is null, return a collect-data / log-your-intake card instead of falling through. Do not use `?? 1` to stand in for unlogged data.
  - Files: `src/lib/fitness/bestMove.js` · `src/lib/fitness/adjustments.js` · `src/lib/fitness/adherence.js` · `src/lib/fitness/trends.js`
- **[medium/S] Weekly check-in analyzes the trend as-of today but detects plateaus as-of the last weigh-in (inconsistent reference frames)** — runWeeklyCheckIn passes no referenceDate; analyzeTrends defaults to today while countConsecutiveFlatWeeks defaults to the last weigh-in, so decideWeeklyAdjustment combines a today-anchored rate with a weigh-in-anchored flat-week count.
  - Fix: Thread a single explicit referenceDate (e.g. todayStr()) from runCheckIn, or default it once at the top of runWeeklyCheckIn, into both analyzeTrends and countConsecutiveFlatWeeks.
  - Files: `src/lib/RecompContext.jsx` · `src/lib/fitness/recalculate.js` · `src/lib/fitness/trends.js`
- **[medium/S] Soreness is silently discarded as a recovery signal when it is the only recovery field logged** — recovery_label short-circuits to "unknown" whenever sleep and energy are both null, ignoring soreness, so a user who logs only high soreness never triggers recovery protection.
  - Fix: Treat recovery as known when any of sleep, energy, OR soreness is logged, and let a high standalone soreness average push recovery toward "poor". Add a soreness-only unit test.
  - Files: `src/lib/fitness/trends.js`
- **[medium/L] Zero test coverage for four recommendation-math modules (adaptiveGoalEngine, nutritionScoring, strengthTrend, trainingAnalysis)** — The four modules have no unit tests under the CI test:fitness gate, but the finding's impact justification overstates the case for two of them.
  - Fix: Add regression tests for nutritionScoring (calories=0 guard, protein/fiber/energy-density branches, label thresholds), strengthTrend (MIN_SPAN_DAYS=10 and 28-day window filtering, null-when-insufficient), summarizeStrengthProgress (estimated_1rm fallback to estimateOneRepMax), and adaptiveGoalEngine (confidence tiers, observed_tdee>1000 guard, ±175 clamp) — noting the last is not yet wired into the UI.
  - Files: `src/lib/fitness/adaptiveGoalEngine.js` · `src/lib/fitness/nutritionScoring.js` · `src/lib/fitness/strengthTrend.js` · `src/lib/fitness/trainingAnalysis.js`
  - Verdict: partial
- **[low/M] Client and server disagree on which duplicate record wins: updated_date (client) vs created_date (server)** — For duplicate rows on one date, the client resolves field conflicts by updated_date while the server resolves by created_date, so a briefly-displayed value can flip after the next server reconcile.
  - Fix: Make the tie-break consistent — have the server's compareRecords/merge honor `updated_date ?? created_date`, or have the client dedupe by created_date only. Add a reconcile test for an updated older-created row vs a newer-created untouched row.
  - Files: `base44/shared/trackingRecordDomain.js` · `src/lib/RecompContext.jsx` · `src/lib/fitness/trends.js`
- **[low/S] estimateObservedTdee double-counts the middle weigh-in for odd sample counts, biasing observed TDEE** — For odd sample counts, firstWeights and lastWeights share the middle index, dampening (lastAvg-firstAvg) and pulling the derived weekly rate toward zero.
  - Fix: Use non-overlapping halves (cap each slice at floor(len/2) or guard the index ranges) so no sample appears in both. Add a test asserting a clean linear 7-point series recovers the true slope.
  - Files: `src/lib/fitness/adaptiveGoalEngine.js`
- **[low/S] Hardcoded 250/240 lb milestones and a 250 lb bodyweight default leaked from a test persona** — generateWeightProjection hardcodes milestones [250, 240, goalWeight??230] and defaults bodyWeight to 250, both nonsensical for lighter users; milestones are currently returned but never rendered.
  - Fix: Derive milestones from the user's actual current weight and goal, and make the bodyWeight fallback come from profile weight (or return null-confidence when truly unknown) instead of literal 250.
  - Files: `src/lib/fitness/projections.js`

### security-privacy-release (8)

- **[high/L] Base44-generated AAB requests unused sensitive permissions — Play health-app rejection risk** — The latest Base44/Wix-wrapped AAB declares location, contacts, calendar, microphone, phone-call, legacy broad-storage and device-audio permissions and marks location+Bluetooth hardware as required, while RecompOne only genuinely needs CAMERA for the barcode scanner. For a Health & Fitness app Google requires unused permissions to be removed, so the current artifact fails review and Base44 says generated-package permissions are not editable in-repo.
  - Fix: Do not upload the current AAB. Keep the existing gate (forbiddenAndroidPermissions + forbiddenRequiredAndroidFeatures) and note CI's default `verify:android` does NOT inspect the AAB — the block only fires when someone runs `verify:android:aab` with AAB_PATH+bundletool, so make that step mandatory before any upload. Send Base44 support the package/version/failing-permission list and re-run the AAB inspection on their regenerated least-privilege bundle.
  - Files: `docs/android-play-release.md` · `android/play-release.json` · `scripts/verify-android-release.mjs`
- **[medium/M] Uploaded food/body-composition photos are never deleted — account deletion does not truly purge them** — createPrivateAnalysisUrl uploads each scan image and returns a fileUri, but no code path anywhere deletes it, and deleteAccount purges only entities/User, not stored private files. Technically accurate. Severity is overstated: (1) both scan features are flag-OFF by default so no photos are uploaded in production today, and (2) contrary to the finding's claim that the privacy copy promises deletion of these files, Privacy.jsx explicitly discloses a retention carve-out for 'files submitted for optional AI analysis' remaining temporarily in provider backups/security logs.
  - Fix: Track every fileUri from UploadPrivateFile and delete it after InvokeLLM returns, plus delete outstanding fileUris in deleteAccount. If Base44 exposes no delete-file API, keep both scan flags off and get Base44 to document guaranteed private-file deletion before enabling. The Data Safety declaration and Privacy retention language are already reasonably aligned.
  - Files: `src/lib/analysisImages.js` · `base44/functions/deleteAccount/entry.ts` · `src/pages/Privacy.jsx` · `src/lib/featureFlags.js`
  - Verdict: partial
  - Founder decision (August 2026): accept this platform limitation for a disclosed, deploy-time body-composition test. Source default remains OFF; the scan is server-entitlement-gated, uses short-lived signed links, and the limitation is disclosed before upload and in Privacy. Revisit immediate deletion when Base44 exposes a supported API.
- **[medium/M] No frame-ancestors/CSP protection in the app shell; framed health-data exfiltration is unverified** — The repo code facts are all confirmed: index.html ships no CSP, no CSP is set anywhere in src/ or public/, frame-ancestors is unenforceable via <meta> anyway, and the live verifier checks manifests/assetlinks/policy pages but never asserts any frame/CSP response header. However the actual exploitability is deployment-dependent and unverified from the repo — the production Base44 origin may or may not send a frame-ancestors HTTP header, which we cannot see here — and by the finding's own admission it does not affect the shipped AAB WebView (which is not framed). That makes 'high' an overstatement for a web-only, unverified, defense-in-depth gap.
  - Fix: Confirm the deployed Base44 origin returns Content-Security-Policy frame-ancestors limited to required editor origins (plus X-Frame-Options). Add a response-header assertion to verify:android:live so a permissive deployment fails, and add a top-frame-busting guard as defense-in-depth. The underlying Base44 SDK frame-forwarding claim originates from the repo's own audit doc and could not be independently confirmed in code here.
  - Files: `index.html` · `docs/security-audit.md` · `scripts/verify-android-release.mjs`
  - Verdict: partial
- **[medium/M] coachReply has no per-user rate limiting on its LLM invocation** — coachReply calls InvokeLLM on every authenticated POST guarded only by a 24KB content-length cap, input validation, high-risk classification and an onboarding gate — there is no throttle. The cheaper non-LLM siblings do throttle (reportAiContent 10/hour, joinWaitlist 5/min), so an authenticated user can loop coach requests and drive unbounded paid-inference cost.
  - Fix: Add per-user (user.id-keyed) rate limiting to coachReply — a short-window cap plus a daily ceiling — mirroring reportAiContent, ideally backed by a Base44 shared/gateway limiter rather than per-instance memory so it survives horizontal scaling.
  - Files: `base44/functions/coachReply/entry.ts` · `base44/functions/reportAiContent/entry.ts` · `base44/functions/joinWaitlist/entry.ts`
- **[medium/M] Public waitlist limiter is trivially bypassable and allows unconsented email enrolment** — isRateLimited keys its bucket on client-controlled forwarded IP headers and stores buckets in per-instance memory, so an attacker rotating headers or hitting different instances defeats the 5/min cap; registerEmail seeds arbitrary third-party emails into WaitlistEntry, deduping per-email but never verifying ownership/consent.
  - Fix: Move the limiter and normalized-email idempotency to a Base44 gateway/shared store (or add a CAPTCHA) so it is per-actor and cross-instance, and treat forwarded IP headers as untrusted. The identical new/existing response already avoids email enumeration.
  - Files: `base44/functions/joinWaitlist/entry.ts` · `docs/security-audit.md`
- **[low/M] Coach prompt-injection surface: client-supplied message and history are interpolated into the LLM prompt** — buildCoachPrompt embeds request.message and the full client-controlled request.history directly into the transcript sent to InvokeLLM. Layered mitigations already exist and are reasonable, and blast radius is limited to the same user's own reply, so this is residual defense-in-depth.
  - Fix: Keep the layered defenses; strengthen the output filter over time (the regex patterns are evadable) and consider clearly delimiting the untrusted transcript block from instructions. No structural change required.
  - Files: `base44/shared/coachDomain.js` · `src/pages/Coach.jsx`
- **[low/S] Body-composition AI result cached unencrypted in localStorage, purged only on same-device in-app deletion** — BodyCompositionScan writes the body-fat %, category, lean-mass estimate and summary to localStorage under recompiq_bf_scan_${userId}. It is cleared only by the in-app deleteAccount flow on that specific device; a shared device, a second install, or the server-side /delete-account workflow leaves the estimate readable, and it is not cleared on logout. Feature is flag-OFF by default so latent.
  - Fix: Prefer sessionStorage or in-memory state for the scan result, or clear the key on logout as well as deletion. At minimum document this on-device cache in the deletion copy so Data Safety stays accurate.
  - Files: `src/components/progress/BodyCompositionScan.jsx` · `src/pages/Profile.jsx`
  - Resolution: body-composition results now use `sessionStorage`; the legacy `localStorage` write was removed.
- **[low/S] Release verifier does not assert the expected CAMERA permission; social images depend on an external domain** — CAMERA sits in reviewAndroidPermissions, a list the verifier never checks — it only enforces requiredAndroidPermissions (INTERNET) and the forbidden list. Barcode scanning genuinely needs live camera, so an AAB that silently drops CAMERA would break the scanner without failing verification. Separately, og:image/twitter:image point at https://fitnesstrackerapps.com, a third-party origin, so social previews break if that host changes.
  - Fix: Have the verifier assert CAMERA is present (or explicitly justified) so barcode can't ship broken, and either self-host the social preview image on the production origin or accept the external dependency knowingly.
  - Files: `android/play-release.json` · `scripts/verify-android-release.mjs` · `index.html`
