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
| #34 | **Observability + route resilience** — privacy-gated telemetry (off by default), route error recovery, and stale-chunk retry. |
| #35–#42 | **Low-risk audit batch** — Progress O(n²), engine correctness, missing fitness suites, accessibility, reduced motion, 44px targets, scalable type token, and stable React vendor chunk. |
| #43–#44 | **Backend/release hardening** — shared AI Coach quota and live `frame-ancestors` verification. |
| #45 | **Premium entitlement foundation** — admin-owned, server-authorized bundle/add-on access with tester support and fail-closed UI. |
| #46 | **Adaptive meal planning** — seven-day target-aware plan and grocery list. |
| #47 | **Adaptive training blocks** — equipment-, history-, and recovery-aware 4–6 week programming. |
| #48 | **Weekly Autopilot Review** — five-signal scorecard with one prioritized next move. |
| #49 | **Visual Progress Check** — Premium on-device comparison with no upload or biometric estimate. |
| #50 | **Premium testing + launch runbook** — tester provisioning, route matrix, production cutover, and billing guardrails. |
| #51 | **AI body-composition range** — Premium-gated private uploads, server authorization, bounded educational results, and accepted deletion-limit disclosures. |
| #52 | **Hero Premium positioning** — public beta messaging for adaptive meal plans, training blocks, Weekly Autopilot, and visual progress tools. |
| #53 | **Base44 release gate** — server-controlled body-scan opt-in with a matching backend enforcement check and no frontend secret exposure. |

### In flight
- None. Start every new change from the latest `main`; do not reuse any merged branch.

### Decided, don't relitigate
- **No font / typography changes.** The current type feels better than the mockups; the Today redesign was explicitly content/hierarchy only. Leave the type scale alone unless the founder reopens it. (The rem type-token task below is about *dynamic-type scaling*, not restyling — keep it visually neutral.)
- **Keep both brand PNGs.** `recompone-logo-primary.png` is a validated Play-listing asset; `recompone-mark-master.png` is the brand master. The plan's "delete PNGs" quick win is superseded.
- **Play permissions escalation** is drafted and ready to send: `docs/play-permissions-escalation.md`. This is a Base44 **support** action (the AAB permissions aren't editable in-repo), not code.
- **Premium testing/launch behavior** is documented in `docs/premium-testing-and-launch.md`. Do not create a client-side billing bypass. The founder approved a deploy-time opt-in for the AI body-composition range despite Base44's current private-file deletion limitation; keep the source flag off by default, use the Base44 Secret `ENABLE_BODY_COMPOSITION_SCAN=true` for the hosted release, and preserve the in-flow/privacy disclosures.

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

### A. Low-risk parallel batch — complete
PRs #35–#44 shipped the Progress optimization, engine correctness fixes, missing fitness suites, accessibility pass, reduced motion, touch targets, scalable metadata token, vendor split, shared Coach quota, and live frame-protection verification.

One audit follow-up remains: move the waitlist limiter away from client-controlled forwarding headers if Base44 exposes a trustworthy shared request identity/store. Treat that as platform-dependent; do not claim an in-memory map is a distributed rate limiter.

### B. framer-motion → CSS transitions (M, subagent-deployable)
Replace the one `AnimatePresence` route transition in `AppLayout` with a GPU-composited CSS keyframe, then `npm rm framer-motion` (~39KB gz off every session). Independent of A's reduced-motion item.

### C. Human-led substrate — now de-risked by #34
- **Data-layer split** — break the eager 13-collection `Promise.all` into a **critical** set (UserProfile, UserPreferences, CurrentStrategy, recent DailyLog) that unblocks Today and a **deferred/per-tab** set; route domain fetches through the mounted react-query cache for stale-while-revalidate; tighten the `-date` limits (trends look back 14–28 days but DailyLog fetches 500). **The render + contract oracles and the route error boundaries from #34 are exactly the safety net this needs — build/extend the oracle first, then refactor.**
- **Global 401 / re-auth handler** — `base44Client` has no 401/403 interceptor, so a mid-session token expiry turns every write into a destructive toast with no re-auth. Add a global handler that triggers refresh/re-auth. Fold into the write-resilience work below.

### D. Device- or platform-gated — confirm the constraint first
- **Android hardware-Back overlay stack** — a back-intent stack so system Back dismisses the open scanner/dialog/sheet instead of exiting the app. Code is a known pattern, but real verification needs the Base44 WebView on a device/emulator (CI can't exercise it).
- **Offline-first** — precached shell + IndexedDB write outbox for flaky-network logging. **Blocked on whether a service worker can register at the Base44 wrapper origin** — prototype against the wrapper before committing; escalate if forbidden.
- **Private-file deletion hygiene** — Base44 still exposes no documented delete-file API. The body-composition result moved from `localStorage` to `sessionStorage`, and the founder explicitly accepted the remaining private-file retention limitation for deploy-opt-in testing. Keep the source flag OFF by default, retain the disclosure, and add immediate deletion when Base44 exposes a supported API.
- **Google Play Billing bridge** — the Premium entitlement domain and tester workflow are shipped, but Base44 does not currently document a supported native Play Billing bridge. Do not mint `source: google_play` entitlements from an unverified browser callback. Follow `docs/premium-testing-and-launch.md` and get founder approval before starting device/license-tester work.

### E. Ops follow-through (not code)
- **Turn on the telemetry from #34 deliberately.** It ships off. To actually see crashes/funnel, set `VITE_ENABLE_TELEMETRY=true` **and** `VITE_TELEMETRY_ENDPOINT` in the Base44 build env, stand up an endpoint to receive the beacons, and **update Play Data Safety** to match before enabling. Then use the `signed_in` / `onboarding_complete` events to measure onboarding drop-off (the funnel the plan flags as unmeasured).
- **Send the Play permissions escalation** (`docs/play-permissions-escalation.md`) to Base44 support and make `verify:android:aab` a mandatory pre-upload gate.
- **Premium internal testing** — provision the tester's Base44 User ID using `docs/premium-testing-and-launch.md`, exercise all four routes, and revoke tester records during the production cutover.

---

## 4. Guardrails checklist (per PR)
- [ ] Branch off latest `main`; PR into `main`; squash merge.
- [ ] For state/data/routing changes: oracle exists and passed on old code first, still green after.
- [ ] `lint`, `typecheck`, `test:fitness`, `test:security`, `test:contract`, `build`, `verify:android`, e2e all green locally.
- [ ] No font/typography restyle. No new default-on flag. No PII/health data collected without a deploy-time opt-in.
- [ ] Every CodeRabbit thread resolved or answered.
- [ ] If it can only be verified on a device or depends on a Base44 platform capability, say so in the PR and don't claim it's proven.
