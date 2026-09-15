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
| #110–#153 | **CI recovery, dependency triage and two gaps closed.** `main` had been red for 18 commits; #127 restored it and cleared what CI could then see (Fuel-tab meal-planner discoverability, a complete ARIA tabs pattern, per-user LLM quotas, `no-store` across all 22 functions, one SDK pin, a leaked error message, quota messages that actually reach users). #136 deleted 30 orphaned `ui/` components and 27 unreferenced dependencies (71 → 44 declared; bundle byte-identical). #137 fixed the CodeQL pin pair. #138/#147 stopped Dependabot managing the five packages Expo pins itself. #146 made a red `main` open a tracked issue. **#151 added decoder coverage for the barcode scanner** — read it before bumping `@zxing`; #142/#144 were closed on its evidence. #152 replaced six deprecated `lucide-react` alias imports. **#153 gated `analyzeFoodPhoto` behind the premium bundle** (`food_photo`), checked before quota, signed URL and inference. |

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

### Merge / CI rules
- Squash-merge only.
- Green before merge: `verify` (lint, typecheck, test:fitness/security/contract, verify:android, build, test:e2e), CodeQL, and "Analyze JavaScript and TypeScript".
- **Read the CodeQL check, not just `verify`.** Two Dependabot PRs (#132, #135) each had a green `verify` while CodeQL failed with a configuration error, because they bumped `codeql-action/init` and `codeql-action/analyze` separately and those must move together. Merging either on a green `verify` would have put CodeQL red on `main`. "Green CI" is several facts, not one.
- CodeRabbit **does not** gate merges. It posts on every PR that the repository "does not receive automatic reviews because it has fewer than 10 stars", so it never reports a review; `mergeable_state` on a green PR is `clean` without it. An earlier version of this doc listed it as a required check, which was wrong — do not wait on it. Its "Trigger review" checkbox requests a review manually if you want one.
- **`main` is protected, and "Require linear history" is what blocked the Base44 Builder.** Resolved on 2026-09-15. Recorded because the cause was not obvious and this section twice said something wrong about it.

  The rule is **classic branch protection** (Settings → Branches), not a ruleset — the Rulesets tab is empty, and a personal-account repo cannot have org rulesets. Looking only at Rulesets shows nothing and wastes time.

  `Require linear history` rejects any push that adds a merge commit. The Builder's sync reconciles its own state against `main` and produces exactly that, so its push was refused. Base44 renders it as *"A branch rule or a missing permission on this repository blocked the push."* — one string covering several unrelated failures, which is why the raw GitHub error is worth more than the paraphrase.

  **Why it began when it did.** The rule appears to predate the incident but was dormant: while the Builder was the only writer to `main`, its pushes were fast-forwards, which are already linear. Once pull requests started landing (#127 onward), `main` carried commits the Builder had not authored, its sync had to merge, and the merge commit hit the rule. Squash merges kept working throughout because a squash has one parent. So a long-standing setting started failing because *someone else* began committing — worth remembering before concluding a rule is new.

  **`Require status checks to pass` also blocks direct pushes**, not just merges: a freshly pushed commit has no completed checks, so it is refused. That setting and a directly-pushing Builder are mutually exclusive. Enabling it while trying to unblock the Builder simply swaps one rejection for another.

  **The resolution that worked:** unchecked `Require linear history`, left `Require status checks` unchecked. The Builder then pushed `435056a` and `8d1c538`, and CI passed on the result (run #455). `Require conversation resolution` and `Do not allow bypassing the above settings` stayed on and affect neither case.

  **Watch the timestamps.** Those commits carry author dates of 13:38 but only landed around 14:15 — a commit's author date is when the Builder created it locally, not when the push succeeded. Use the CI run's `created_at`, or the push event, to tell when a commit actually arrived. Reading author dates as push times produced a wrong conclusion here.

  **If the gate is wanted back**, the only configuration that has both a gated `main` and a working Builder is to point the Builder at a non-default branch. The repository half is built: `.github/workflows/base44-builder-pr.yml` opens a pull request into `main` on any push to `base44-builder`, and that branch is in `ci.yml`'s `push.branches`. **Both halves are required** — a pull request opened with `GITHUB_TOKEN` does not start a workflow run, so without the push trigger those PRs carry no checks at all. The workflow is verified working (it ran on the branch's creation and correctly opened nothing, there being no diff). Its limit: a push-triggered run tests the branch tip, not the merge with `main`, so it does not prove integration against a `main` that has since moved; a PAT or App token in place of `GITHUB_TOKEN` restores real merge testing. Whether the Base44 dashboard exposes a target-branch setting is still **unverified** — `base44/config.jsonc` carries only a name and build commands.

- **Treat this section as a log, not an authority.** Base44's own assistant reads this file and quotes it back as the documented diagnosis, so a stale claim here is repeated to the founder as fact — which happened on 2026-09-15, when text written fourteen minutes earlier was cited after it had already stopped being true. Two prior versions were wrong: one asserted "pushes to `main` are not gated" (inferred from the 18-commit red streak without ever checking the protection flag), and the next blamed the block on protection in general while missing which setting did it. Before acting on anything here, check the repository: `list_branches` for the protection boolean, the Settings → Branches screen for which boxes are ticked, and `list_commits` on `main` for whether the Builder has actually pushed.

- **Branch protection cannot be read or changed from the GitHub MCP toolset.** `list_branches` exposes only `protected: true|false` — not the rule's contents, its bypass list, or its history. Diagnosing a push rejection from that boolean alone is guesswork; ask for the Settings → Branches screen instead.

- **Why an ungated `main` is less dangerous than it was.** Ungated Builder pushes are how `main` sat red for 18 consecutive commits (`c438328`..`fbc3cdb`) across four days, visible only in the Actions tab. `ci.yml` now opens a tracked issue titled "CI is failing on main" on a red push and closes it when `main` goes green, so a red `main` announces itself. Still a smoke alarm rather than a lock — but the silent-failure mode that made ungated pushes costly is the part that has been fixed.

- **Dependabot cannot be driven by comment from an API client.** `@dependabot rebase`, `recreate` and `ignore` posted through the GitHub API are stored with characters injected into the mention — the comment appears, the call returns success, and the command never fires. #143 sat unchanged for 30 minutes on two such requests before this was spotted. If a Dependabot PR needs a rebase, either use GitHub's own "Update branch" (`update_pull_request_branch`, which refuses on a real conflict) or carry the change on your own branch and close the original as superseded, as #150 did for #143.
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
