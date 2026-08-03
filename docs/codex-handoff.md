# RecompOne — Handoff to Codex

_Status snapshot + how to keep shipping. Read this first, then `docs/improvement-plan.md` for the full audit and per-item detail._

Every change lands as a GitHub PR against `main`; merging auto-syncs to Base44. Keep that loop.

---

## 1. Where things stand

### Shipped (merged to `main`)
| PR | What it did |
|----|-------------|
| #29 | **Wave 0** — cut mobile bundle + daily-loop latency (optimistic habit taps, lazy `@zxing`/FoodPhotoScan/BodyCompositionScan, removed 11 dead deps + 2 orphaned UI files), committed `docs/improvement-plan.md`. |
| #30 | **Today redesign** — Recomp Signal as the single hero, one canonical logging surface (`QuickLogSheet`), cut duplicated cards. Content/hierarchy only. |
| #31 | **Wave 1 harness + first context split** — the render oracle + context-contract test, plus extracting the actions context out of the mega-context. |
| #32 | **Wave 1** — extracted the habits domain + added write→optimistic→render interaction coverage. |
| #33 | **Wave 1** — split stable reference data from live/derived data. `RecompContext` is now four contexts: Actions / Habits / Ref / Live. |

### In flight
- **PR #34 — observability + route resilience** (this session). Crash reporting + minimal funnel analytics (both **off by default**), per-route error boundary with in-place reset, and dynamic-import retry + one guarded hard-reload for stale chunks after a republish. Under CI/CodeRabbit review at handoff. **Don't duplicate this work.**

### Decided, don't relitigate
- **No font / typography changes.** The current type feels better than the mockups; the Today redesign was explicitly content/hierarchy only. Leave the type scale alone unless the founder reopens it. (The rem type-token task below is about *dynamic-type scaling*, not restyling — keep it visually neutral.)
- **Keep both brand PNGs.** `recompone-logo-primary.png` is a validated Play-listing asset; `recompone-mark-master.png` is the brand master. The plan's "delete PNGs" quick win is superseded.
- **Play permissions escalation** is drafted and ready to send: `docs/play-permissions-escalation.md`. This is a Base44 **support** action (the AAB permissions aren't editable in-repo), not code.

---

## 2. The validated workflow — keep using it

Wave 1 proved out an **oracle-first loop** that let high-blast-radius refactors land without a human eyeballing every render. Reuse it for anything that touches shared state, data flow, or routing:

1. **Build the oracle before the change.** For a refactor, the test that proves you didn't break it must exist and pass *first*, on the current code.
2. **Refactor.**
3. **The oracle re-verifies.** If it can't tell a broken version from a correct one, the oracle is too weak — strengthen it before trusting the refactor.

Two oracles already exist and must stay green:
- **`tests/contract/recomp-context-consumers.test.js`** — static analysis that every `useRecomp*()` destructure reads a key the matching provider actually supplies. This is what catches a consumer left pointing at the wrong context after a split. If you split a context further, update `HOOK_PROVIDERS` and the provider-wiring assertions.
- **`tests/e2e/authenticated-smoke.spec.js`** — boots the real app signed-in against fixtures and asserts every tab renders its `h1` with **zero** uncaught page errors, plus the write→optimistic→render loop (habit increment, daily-log save). This is the net under a dropped consumer or a white-screened tab.

**Negative-validate your oracle at least once** (inject the bug it's meant to catch, confirm it fails) — we did this for both and it caught two real bugs during Wave 1.

### Run everything locally
```bash
npm run lint            # eslint --quiet
npm run typecheck       # tsc -p ./jsconfig.json
npm run test:fitness    # domain math
npm run test:security   # includes observability.test.js from #34
npm run test:contract   # context consumer/provider contract
npm run build           # confirms code-splitting + bundle sizes
npm run verify:android  # release-config checks
```

**E2E needs a Chromium override in this environment** (the pinned Playwright wants a browser revision that isn't installed). Use a throwaway config — **never commit it**:
```js
// pw.local.config.mjs
import base from "./playwright.config.js";
export default {
  ...base,
  projects: [{
    name: "chromium",
    use: { ...base.projects[0].use, launchOptions: {
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    }},
  }],
};
```
```bash
npx playwright test --config pw.local.config.mjs --grep-invert @deployed --reporter=line
rm -f pw.local.config.mjs
```

### Merge / CI rules (branch protection)
- Squash-merge only.
- Required checks must be green: `verify` (lint, typecheck, test:fitness/security/contract, verify:android, build, test:e2e) + CodeRabbit + CodeQL "Analyze JavaScript and TypeScript".
- **All review threads must be resolved** before merge — address or reply to every CodeRabbit comment.
- Feature flags stay **off by default** and gate on an explicit env var; anything touching sensitive data (photos, health metrics, telemetry) must not collect until a deploy opts in (Play Data Safety).

---

## 3. Next steps — recommended order

Grouped by risk and dependency. Full per-item detail (files, line refs, approach, risk) is in `docs/improvement-plan.md`.

### A. Low-risk parallel batch — subagent-deployable, each its own PR
These are well-scoped, unit-testable, and independent. Fan them out.
- **Progress O(n²) fix** — rewrite `calculateMovingAverage` as an O(n) sliding window, replace `ma.find` with a date-keyed Map, dedupe logs once, gate heavy memos on `isActive`. Guarded by existing projection tests.
- **Recommendation-engine correctness batch** — thread one `referenceDate` through `runWeeklyCheckIn` → `analyzeTrends`/`countConsecutiveFlatWeeks`; make recovery honor soreness-only logging; unify the duplicate-record tie-break (client `updated_date` vs server `created_date`); fix `estimateObservedTdee` middle-index double-count. One unit test each.
- **Missing fitness test suites** — `nutritionScoring`, `strengthTrend`, `summarizeStrengthProgress`, `adaptiveGoalEngine` under `tests/fitness`. Prioritize the two live modules (`nutritionScoring`, `strengthTrend`).
- **Accessibility pass** — real `h2`/`h3` section headings, habit-name-interpolated stepper aria-labels, `role="img"` + value/max on the rings, windowing cap on `SessionHistory`. Purely additive, no visual diff.
- **`prefers-reduced-motion`** — standalone global `@media` block + `MotionConfig` (covers MacroBar/ProgressRing/PullToRefresh). This is an S-effort win; **do NOT wait on the framer-motion swap** below.
- **44px touch targets** — pad `DialogClose`/`SheetClose` to a 44px hit area, bump `Button`/`Input` default sizes in the shared primitives. Verify dense rows (Nutrition quick-add) still fit.
- **Type-token unification** — replace the 33× ad-hoc `text-[10px]` with a rem-based label token (~0.75rem, min 11–12px) so metadata scales with the Android system font. Visually neutral — **not** a restyle.
- **`manualChunks` vendor split** — isolate a stable `react-vendor` group so framework bytes stay cached across app updates. Low priority.
- **Backend hardening** — per-user rate limit on `coachReply` (mirror `reportAiContent`'s 10/hr), move the waitlist limiter off client-controlled IP headers, confirm CSP `frame-ancestors` on the deployed origin. Some of this depends on a Base44 shared store.

### B. framer-motion → CSS transitions (M, subagent-deployable)
Replace the one `AnimatePresence` route transition in `AppLayout` with a GPU-composited CSS keyframe, then `npm rm framer-motion` (~39KB gz off every session). Independent of A's reduced-motion item.

### C. Human-led substrate — now de-risked by #34
- **Data-layer split** — break the eager 13-collection `Promise.all` into a **critical** set (UserProfile, UserPreferences, CurrentStrategy, recent DailyLog) that unblocks Today and a **deferred/per-tab** set; route domain fetches through the mounted react-query cache for stale-while-revalidate; tighten the `-date` limits (trends look back 14–28 days but DailyLog fetches 500). **The render + contract oracles and the route error boundaries from #34 are exactly the safety net this needs — build/extend the oracle first, then refactor.**
- **Global 401 / re-auth handler** — `base44Client` has no 401/403 interceptor, so a mid-session token expiry turns every write into a destructive toast with no re-auth. Add a global handler that triggers refresh/re-auth. Fold into the write-resilience work below.

### D. Device- or platform-gated — confirm the constraint first
- **Android hardware-Back overlay stack** — a back-intent stack so system Back dismisses the open scanner/dialog/sheet instead of exiting the app. Code is a known pattern, but real verification needs the Base44 WebView on a device/emulator (CI can't exercise it).
- **Offline-first** — precached shell + IndexedDB write outbox for flaky-network logging. **Blocked on whether a service worker can register at the Base44 wrapper origin** — prototype against the wrapper before committing; escalate if forbidden.
- **Private-file / localStorage deletion hygiene** — track every scan `fileUri` and delete after inference + in `deleteAccount`; move the body-fat cache off unencrypted `localStorage`. **Blocked on a Base44 delete-file API** — until confirmed, keep both scan flags OFF (they already are).

### E. Ops follow-through (not code)
- **Turn on the telemetry from #34 deliberately.** It ships off. To actually see crashes/funnel, set `VITE_ENABLE_TELEMETRY=true` **and** `VITE_TELEMETRY_ENDPOINT` in the Base44 build env, stand up an endpoint to receive the beacons, and **update Play Data Safety** to match before enabling. Then use the `signed_in` / `onboarding_complete` events to measure onboarding drop-off (the funnel the plan flags as unmeasured).
- **Send the Play permissions escalation** (`docs/play-permissions-escalation.md`) to Base44 support and make `verify:android:aab` a mandatory pre-upload gate.

---

## 4. Guardrails checklist (per PR)
- [ ] Branch off latest `main`; PR into `main`; squash merge.
- [ ] For state/data/routing changes: oracle exists and passed on old code first, still green after.
- [ ] `lint`, `typecheck`, `test:fitness`, `test:security`, `test:contract`, `build`, `verify:android`, e2e all green locally.
- [ ] No font/typography restyle. No new default-on flag. No PII/health data collected without a deploy-time opt-in.
- [ ] Every CodeRabbit thread resolved or answered.
- [ ] If it can only be verified on a device or depends on a Base44 platform capability, say so in the PR and don't claim it's proven.
