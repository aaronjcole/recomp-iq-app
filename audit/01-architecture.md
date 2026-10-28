# 01 — Architecture Map
Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

Sources: verified dossiers A-frontend (finding IDs `FE-*`), B-backend (`BE-*`) and C-deps (`DEP-*`), the orchestrator tooling digest (cited as `tooling/<file>`, i.e. `/tmp/claude-0/-home-user-recomp-iq-app/363ad519-3bee-54f6-bf9e-e120665568ef/scratchpad/tooling/<file>`), and writer checks (`W-*`, listed in §1.2). Tags: **VERIFIED** = cited lines opened, or tool/command output; **SUSPECTED** = inference, runtime or Base44-platform behaviour, or not fully traced. All line numbers are at 1093787. Cross-references to `B44-*` IDs point at [03 — Base44 coupling](03-base44-coupling.md); summary and Top 10 in [00](00-summary.md).

---

## 1. Summary

- **CI on `main` has been red on every push from #531 (2026-10-21) to #547 (2026-10-23, head 1093787). Every test, build and e2e step after the failing step is skipped** (BE-05 / DEP-02, High). The gate that fails, `expo-doctor`, compares against live Expo API data, so an upstream Expo patch turned main red with no repo change. Two more failures sit underneath it: the whole Playwright suite cannot load since the Vite 8 upgrade removed `esbuild` (DEP-01, High), and the Expo patch PR #196 fails its own dependency test (DEP-24, Medium).
- **Nothing reviews or gates `main`.** Since 2026-09-15 there were 13 Builder and 11 owner direct commits against 11 PR merges. The branch rule requires no status checks, and the Builder→PR workflow has never fired. Vite 6→8, and a Builder merge that re-added 2 packages a reviewed PR had removed, both landed this way (BE-04 / DEP-03, DEP-V1). Backend publishes are manual dashboard actions, and git does not record what is live (BE-08).
- **The 2,595-line backend is never executed, type-checked or linted** (BE-03, High). The 25 functions pin `@base44/sdk@0.8.48` while the frontend runs 0.8.57, and the two APIs differ. A Builder commit called `count()`, which 0.8.48 lacks, and broke the quota path of all four AI features on main for ~4.5 h (BE-V1, BE-21 / DEP-20).
- **The frontend data layer is one 1,947-line file.** `src/lib/RecompContext.jsx` holds all 71 direct entity calls, 37 actions and client-orchestrated multi-entity writes that use compensating deletes instead of transactions (FE-19). Its 4-context split does not isolate re-renders (FE-01). react-query is wired app-wide but used by one 404-page query (FE-09 / DEP-10).
- **Frontend static checks are nominal.** ESLint has 6 active rules and skips `src/lib` (78 files, 10,013 LOC) (FE-04). 29 files, App.jsx and the router shell among them, are never type-checked (FE-05).
- **Two High backend/product defects:** the referral rewards ("free month", "30% off") are advertised and never granted (BE-01), and hard-coded app-wide daily AI ceilings let ~25 free accounts switch the coach off for everyone (BE-02).
- **Dependencies:** knip and depcheck agree on 3 unused prod deps (`@hookform/resolvers`, `@radix-ui/react-accordion`, `cmdk`) and knip on 9 dead files. React, Tailwind, ESLint, recharts, framer-motion, date-fns and lucide-react are each a major behind. Open Dependabot PR #177 (Tailwind 4) breaks the production build (DEP-04). Root `npm audit` finds 0. expo-ios has 4 high / 5 low, all in Expo CLI/build tooling (DEP-15).
- **Base44 SDK analytics is on by default and the app never turns it off.** Every page sends events tagged with user id and session, plus a 60 s heartbeat, to `/api/apps/<id>/analytics/track/batch` (W-01, same issue as B44-01).

### 1.1 Top findings

| ID | Claim | Sev | Tag | § |
|---|---|---|---|---|
| BE-05 / DEP-02 | CI red on every main push #531-#547; all test/build/e2e steps skipped; expo-doctor is non-hermetic | High | **VERIFIED** (GitHub API) | 9 |
| DEP-01 | Playwright e2e cannot load any spec: `esbuild` imported, not installed since Vite 8 | High | **VERIFIED** | 9 |
| BE-04 / DEP-03 | Unreviewed direct pushes to `main` (Builder + owner), including payment, paid-inference and toolchain-major changes | High | **VERIFIED** (history, branch rule) | 9 |
| BE-03 | No `entry.ts` is ever executed, type-checked or linted; test fakes diverge from the pinned SDK | High | **VERIFIED** | 9 |
| BE-01 | Referral rewards advertised, never granted | High | **VERIFIED** (code) / **SUSPECTED** (no manual process) | 7 |
| BE-02 | App-wide daily AI ceilings (coach 500/day for all users) | High | **VERIFIED** | 7 |
| W-01 | Base44 SDK analytics on in production, user-identified | High | **VERIFIED** (code) / **SUSPECTED** (compliance effect) | 8 |
| BE-V1 / BE-21 / DEP-20 | Backend SDK 0.8.48 (25 inline pins, invisible to Dependabot) lacks `count()`; caused a quota outage on main | Medium | **VERIFIED** | 7 |
| DEP-24 | expo-ios test needs unlisted `xcode`@3; PR #196 (xcode 4) fails CI on it | Medium | **VERIFIED** | 9 |
| FE-01 | RecompContext 4-context split does not isolate re-renders | Medium | **VERIFIED** / **SUSPECTED** (jank) | 5 |
| FE-02 | RouteErrorBoundary wraps the whole authenticated tree | Medium | **VERIFIED** | 4 |
| FE-03 | Stale-chunk reload guard cleared at boot → reload loop | Medium | **VERIFIED** (trace) | 3 |
| FE-04 | ESLint: 6 active rules, src/lib unlinted | Medium | **VERIFIED** | 9 |
| FE-07 | Visiting legal pages tears down RecompProvider (~20 API calls, lost recovery markers) | Medium | **VERIFIED** / **SUSPECTED** (divergence) | 4 |
| FE-12 | Unscoped workout-in-progress key leaks across accounts | Medium | **VERIFIED** | 5 |
| FE-V1 | Transient boot failure routes signed-in users to /login | Medium | **VERIFIED** (trace) | 5 |
| BE-06 / BE-07 | Google Play path unwired and incomplete; Apple sandbox fail-open while allowlist unset | Medium | **VERIFIED** code / **SUSPECTED** prod config | 7 |
| BE-08 / BE-09 / BE-10 | Manual untracked deploys; OFF search-as-you-type unthrottled; e2e on dev server with mocked backend | Medium | mixed | 7-9 |
| DEP-04 / DEP-08 / DEP-14 | PR #177 breaks build; framer-motion 36 kB gz for 3 animations; majors behind with no plan | Medium | **VERIFIED** | 10 |

### 1.2 Dossier conflicts resolved, and writer checks

| # | Conflict / check | Resolution | How confirmed | Tag |
|---|---|---|---|---|
| 1 | Failing CI runs. The tooling README says "every push since at least #536 … failing step expo-doctor". B says #531-#547 all failed and #536 failed at Typecheck. C lists #529 green, #531 doctor, #533-#539 Typecheck, #540-#547 doctor | C's per-run step check is used. B agrees with it. The README is imprecise about #533-#539 | `gh api …/actions/runs/<id>/jobs` (C, B) | **VERIFIED** |
| 2 | Branch protection. B (BE-04) did not query it and tagged it SUSPECTED. C queried it | `main` reports `"protected": true` with `required_status_checks {checks: [], contexts: [], enforcement_level: "off"}`. No check gates main, and history shows direct pushes by owner and Builder. audit/03 originally called main "unprotected" (corrected in QA); the precise state is "protected, nothing required" | `gh api repos/aaronjcole/recomp-iq-app/branches/main` (C, DEP-03) | **VERIFIED** |
| 3 | Severity of the backend SDK pin: BE-21 Medium, DEP-20 Low | **Medium**, merged as BE-21 / DEP-20. BE-V1 shows the drift already shipped a bug | BE-V1 evidence | **VERIFIED** |
| 4 | Direct pushes appear in both BE-04 and DEP-03 | Merged as **BE-04 / DEP-03** (High). DEP-V1, the Builder merge reverting a reviewed PR, stays separate | — | — |
| 5 | react-query appears in both FE-09 and DEP-10 | Merged as **FE-09 / DEP-10** (Low) | — | — |
| 6 | Unused deps appear in both FE-20 and DEP-05 | Merged as **FE-20 / DEP-05** (Low): files, deps, test pins, dead flag | — | — |
| 7 | Orphan entities: A §5.1 says SUSPECTED, B (BE-13) says VERIFIED | No writer in the repo: **VERIFIED**. A writer outside the repo (dashboard, integration): **SUSPECTED** | `rg CoachConversation\|WaitlistEntry` (B) | **VERIFIED** / **SUSPECTED** |
| 8 | Browser entity call count: A says 71, audit/03 says 79 | Both right. 71 literal `base44.entities.<Name>.<op>` calls, all in RecompContext.jsx, plus 8 more through an injected `entities` param (planSettings.js, sessionEdit.js). This doc uses 71 direct | Writer re-ran `rg -no "base44\.entities\.[A-Za-z]+\.[a-zA-Z]+" src` → 71, 1 file | **VERIFIED** |
| 9 | BE-28 (visual-edit agent in prod), removed by B's verifier | Not reported. A independently found 0 visual-edit tags in the built `dist/index.html` | A §2; B "Removed" table | **VERIFIED** |
| W-01 | SDK analytics default (not in A/B/C) | On by default, and not overridden by the app. See W-01 in §8 | Writer opened src/api/base44Client.js:1-27, node_modules/@base44/sdk/dist/client.js:59,208-214, modules/analytics.js:1-356, utils/common.js:7, src/pages/Privacy.jsx:70-80 | **VERIFIED** |
| W-02 | Re-counts | 25 × `npm:@base44/sdk@0.8.48`. 25 `functions.invoke(` sites, 22 distinct names. 25 function dirs, 25 entity files, 34 shared modules. `useQuery` only at PageNotFound.jsx:3,10. All match the dossiers | `rg`, `ls` (writer) | **VERIFIED** |
| W-03 | Files opened for §2/§3/§9 | package.json:1-72, vite.config.js:1-41, src/main.jsx:1-19, src/App.jsx:60-174, expo-ios/{index.ts, App.tsx, package.json, app.json, eas.json}, base44/config.jsonc:1-9, android/play-release.json:5-12, .github/workflows/ci.yml:1-80, tooling/build.txt | writer | **VERIFIED** |

---

## 2. Directory structure

### 2.1 Top level

| Path | Files | LOC | Role | Evidence | Tag |
|---|---|---|---|---|---|
| `src/` | 234 (158 .jsx, 75 .js, 1 .css) | 32,445 | React 18 + Vite 8 SPA (web, iOS WebView, Android wrapper) | `find`/`wc` (A §1) | **VERIFIED** |
| `base44/functions/<name>/entry.ts` | 25 | 2,595 | Deno HTTP handlers, deployed by name, invoked by string | tooling/loc-by-dir.txt | **VERIFIED** |
| `base44/shared/` | 34 | 6,608 | Plain-JS domain modules; 14 are also bundled into the frontend | tooling/loc-by-dir.txt; B §4 | **VERIFIED** |
| `base44/entities/*.jsonc` | 25 | 2,645 | Entity schemas + RLS | tooling/loc-by-dir.txt | **VERIFIED** |
| `base44/config.jsonc`, `auth/config.jsonc`, `connectors/gmail.jsonc` | 3 | — | Platform build, auth providers, unused Gmail connector (BE-11) | B §1 | **VERIFIED** |
| `expo-ios/` | 18 (excl. node_modules) | src 8 files / 1,189 | Expo SDK 57 iOS WebView shell with StoreKit and speech bridges | `find expo-ios -not -path '*/node_modules/*'` (writer); tooling/loc-by-dir.txt | **VERIFIED** |
| `android/` | 1 | — | `play-release.json`, the contract for a Base44-built Android WebView wrapper (`"expectedWrapperType": "base44-webview"`, :12; `webOrigin` :7) | android/play-release.json:5-12 (writer) | **VERIFIED** |
| `tests/` | 149 (137 code) | 22,155 | contract 3, e2e 34 specs + 4 support/fixture files, fitness 35, security 63, fixtures/apple-jws 10 | `find tests` (writer); tooling/loc-by-dir.txt | **VERIFIED** |
| `scripts/` | 3 | — | verify-android-release.mjs (456), resolve-chromium.mjs (180), lib/android-release-checks.mjs | B §6 | **VERIFIED** |
| `docs/` | 24 | — | 16 top-level .md, features/ (3), play-store/ (5) | `ls docs` (writer) | **VERIFIED** |
| `public/` | 12 | — | manifest.json, robots.txt, sitemap.xml, auth/native-return.html, brand/ (4 PNGs, 0.5-1.2 MB each), icons/ (4; the maskable icon is byte-identical to the 512 icon) | tooling/README.md; A §2 | **VERIFIED** |
| `.github/` | 4 | 383 | ci.yml (153), codeql.yml (39), base44-builder-pr.yml (111), dependabot.yml (80) | `wc -l` (writer) | **VERIFIED** |
| root config | — | — | package.json, vite.config.js, tailwind.config.js, postcss.config.js, eslint.config.js, jsconfig.json, components.json, playwright.config.js, index.html, AGENTS.md, CLAUDE.md, README.md | `ls` (writer) | **VERIFIED** |

Largest source files (tooling/loc-top.txt): src/lib/RecompContext.jsx 1,947 · base44/shared/adaptiveMealPlanDomain.js 994 · src/components/training/WorkoutTracker.jsx 880 · src/lib/seo/tipsData.js 812 · src/pages/Nutrition.jsx 773 · src/pages/Profile.jsx 622. **VERIFIED**

### 2.2 `src/` (A §1, **VERIFIED** by `find`/`wc -l`)

| Dir | Files (direct / recursive) | LOC (direct / recursive) | Purpose |
|---|---|---|---|
| `src/` | 3 / 234 | 371 / 32,445 | `main.jsx` (19), `App.jsx` (174, router + providers), `index.css` (178, Tailwind + CSS tokens) |
| `src/api` | 1 | 27 | `base44Client.js`: SDK `createClient`, plus wrappers on `loginWithProvider`/`redirectToLogin` that set the anti-injection marker (`:17-27`) |
| `src/hooks` | 2 | 47 | `use-mobile.jsx` (used by ui/adaptive-select.jsx:3, pages/Progress.jsx:22), `use-size.jsx` (dead, knip) |
| `src/lib` | 52 / 78 | 5,834 / 10,013 | Contexts (Auth, Recomp, Premium, LoggingDate, Theme), data helpers (planCache, foodNutritionSync, sessionEdit, planSettings, nutritionReport*), native bridges, telemetry, routing helpers (tabNavigation, androidBack, routeMetadata, lazyWithRetry) |
| `src/lib/fitness` | 22 | 2,333 | Pure domain math; `trends.js`, `adjustments.js`, `adherence.js` are 3-line re-exports of `base44/shared/fitness*` |
| `src/lib/seo` | 4 | 1,846 | Static SEO content + `publicRouteInventory.js` (16 tips, 16 comparisons, 20 locations, 64 canonical paths) |
| `src/pages` | 29 / 39 | 7,417 / 8,819 | Route screens |
| `src/pages/seo` | 10 | 1,402 | Public SEO pages (calculators, learn, tips, compare, locations) |
| `src/components` | 19 / 111 | 866 / 13,168 | App shell: AppLayout, ProtectedRoute, ErrorBoundary, RouteErrorBoundary, AndroidBackHandler, OfflineBanner, RouteAccessibility, ScrollToTop, AuthLayout, LegalShell, PublicHome |
| `src/components/nutrition` | 15 | 3,118 | Food diary, composer, search, barcode/photo scan, recipes, grocery, templates |
| `src/components/training` | 8 | 2,289 | WorkoutTracker (880), session builder/edit/history, plateau alert |
| `src/components/today` | 17 | 1,771 | Today cards; `RatingDrawer`, `StreakBanner` dead |
| `src/components/ui` | 19 | 1,533 | shadcn/ui (new-york, JSX) primitives + toast |
| `src/components/progress` | 8 | 1,136 | Charts (recharts), photos (IndexedDB), body-comp scan, nutrition report |
| `src/components/onboarding` | 10 | 1,001 | 8 `Step*.jsx` (4 dead: StepAbout, StepActivity, StepCoaching, StepWelcome) + Fields.jsx + constants.js |
| `src/components/common`, `more`, `premium`, `seo`, `hero`, `coach` | 7 / 2 / 2 / 2 / 1 / 1 | 430 / 439 / 269 / 190 / 91 / 35 | Rings and bars (`SignalStat` dead); CheckInSheet + WeeklyCheckInReview (v2); PremiumPaywall + badge; SeoShell (JSON-LD via `createElement("script")`, SeoShell.jsx:57-59); device mockup; coach teaser |

Cross-boundary: **21** `src` files import **14** distinct `base44/shared/*` modules by relative path (25 import statements), e.g. src/lib/RecompContext.jsx:17-24. No LLM prompt text from those modules reaches the bundle (`grep` of the build chunks for "You are RecompOne", "COACH_SAFETY" and similar → 0 files). **VERIFIED** (A §1)

### 2.3 `expo-ios/` (writer, **VERIFIED** by `find` + `wc -l`)

index.ts (5) → App.tsx (20) → src/RecompOneWebView.tsx (502). Bridges and protocols: bridgeProtocol.ts 165, injectedBridge.ts 97, nativeAuth.ts 107, speechCapture.ts 171, injectedSpeechBridge.ts 53, speechProtocol.ts 52, nativeSpeech.ts 42. Tests: tests/speechCapture.test.ts 249, tests/dependencySecurity.test.ts 50. Config: app.json, eas.json, tsconfig.json, package.json, package-lock.json (6,206), README.md. There is no Android Expo project: `app.json:7-9` lists `"platforms": ["ios"]`.

---

## 3. Entry points & build

### 3.1 Entry points

| Entry | What it does | Evidence | Tag |
|---|---|---|---|
| `index.html` | Static meta/OG/JSON-LD for `https://fitnesstrackerapps.com/`; an inline theme bootstrap reads `localStorage["recomp-theme"]`; mounts `/src/main.jsx` | index.html:13,21 (canonical/og:url), :67-83 (theme script, `var t = localStorage.getItem("recomp-theme");` :70), :87 (module entry) | **VERIFIED** |
| `src/main.jsx` | `markChunksLoaded()`, `installChunkErrorRecovery()`, `initTelemetry()`, `trackEvent('app_open')`, then `ReactDOM.createRoot(...).render(<App />)`. No `StrictMode` | src/main.jsx:10-19 | **VERIFIED** |
| `src/App.jsx` provider order | `ThemeProvider` > `AuthProvider` > `QueryClientProvider` > `PremiumAccessProvider` > `ErrorBoundary` > `BrowserRouter` > [RouteAccessibility, ScrollToTop, AndroidBackHandler, OfflineBanner, `div#app-content` > `RouteErrorBoundary` > `Suspense(AppSplash)` > `AuthenticatedApp`]. `Toaster` sits outside the ErrorBoundary and the Router | src/App.jsx:144-171 | **VERIFIED** |
| Per-route providers | `RecompGate` (lazy, App.jsx:61-63) mounts `RecompProvider key={user?.id ?? "signed-out"}` for protected routes only. `AppLayout` mounts `LoggingDateProvider`. `PremiumAccessProvider` remounts its inner provider per user | src/lib/RecompContext.jsx:1908-1915; src/components/AppLayout.jsx:57; src/lib/PremiumAccessContext.jsx:44-47 | **VERIFIED** |
| `public/manifest.json` | PWA: `start_url "/"`, `display standalone`, 3 icons (the maskable one is byte-identical to the 512 `any` icon) | public/manifest.json:6-31; `cmp` | **VERIFIED** |
| `public/auth/native-return.html` | iOS-only OAuth return page: reads `?access_token` and `?next`, scrubs history, `location.replace("recompone://auth?...")` | public/auth/native-return.html:29-45 | **VERIFIED** (code); device handling **SUSPECTED** |
| iOS shell | `registerRootComponent(App)` (expo-ios/index.ts:1-5) → `<RecompOneWebView />` (App.tsx:9-17), which loads `APP_ORIGIN = "https://recomp-iq.base44.app"` (bridgeProtocol.ts:4; `source={{ uri: APP_ORIGIN }}` RecompOneWebView.tsx:407). This is not the canonical web host, so localStorage/IndexedDB are per origin. Bundle id `com.base6a68bb922bf88da5ec767da3.app`, scheme `recompone` (app.json:11,14). EAS profiles development/preview/production (eas.json) | files as cited | **VERIFIED** |
| Android | No source in the repo. The Base44 WebView wrapper is described by android/play-release.json:5-12 (same package id, `webOrigin` `https://recomp-iq.base44.app`). The web side detects it by UA `WixBrandedLiteApp` or `window.wixMobileNativeBridge` (src/lib/nativeStoreShell.js:1-16) | files as cited | **VERIFIED** (contract); wrapper behaviour **SUSPECTED** |
| Backend | 25 `export default async function(req…)` handlers, invoked as HTTP POST by name; `appleStoreNotification` is an inbound webhook. None is scheduled in the repo | B §1, §3 | **VERIFIED**; dashboard automations **SUSPECTED** |
| Base44 site build | `installCommand "npm install"`, `buildCommand "npm run build"`, `serveCommand "npm run dev"`, `outputDirectory "./dist"` | base44/config.jsonc:4-7 | **VERIFIED** (config); platform use **SUSPECTED** |

Production HTML from `@base44/vite-plugin` 1.0.47: only `analyticsTracker` is a production-mode injection (node_modules/@base44/vite-plugin/dist/html-injections-plugin.js:47-88), and vite.config.js:23 disables it. The others are dev-only (`:262-290`), and the built dist/index.html has 0 visual-edit tags. **VERIFIED** (A §2). This is separate from the SDK's own analytics module, which is on (W-01).

### 3.2 Build configuration and output

| Item | Finding | Evidence | Tag |
|---|---|---|---|
| vite.config.js | Base44 plugin (`legacySDKImports` only if `BASE44_LEGACY_SDK_IMPORTS=true`, `hmrNotifier`, `navigationNotifier`, `analyticsTracker: false`, `visualEditAgent: true`) + React. `manualChunks(id)` moves only react, react-dom, react-router(-dom) and scheduler into `react-vendor` | vite.config.js:7-10,15-25,35-37 | **VERIFIED** |
| Build output | `vite build` OK: 3,599 modules, 155 assets, 2.8 MB JS raw. Largest: Progress 453.7 kB (122.4 kB gz, recharts), BarcodeScanner 446.4 kB (118.9 kB gz, zxing), react-vendor 179.1 kB, base44Client 135 kB (axios + socket.io), proxy 109.5 kB (framer-motion), RecompContext 77.7 kB, index 73 kB. Warning: `VITE_BASE44_APP_ID is not set` | tooling/build.txt:1-7 and chunk list | **VERIFIED** |
| Initial load | Entry `index` 73.2 kB + react-vendor 179.1 + base44Client 135.0 + utils 27.2 + AuthContext 11.4 + 3 tiny chunks = **428,018 B raw / 140,829 B gz**, plus 57 kB CSS (11 kB gz) | A §7 (re-measured from dist/index.html script + modulepreload list) | **VERIFIED** |
| tailwind.config.js | CommonJS (`module.exports`, `require`) in a `"type": "module"` package (package.json:5); works only because Tailwind 3 loads it through jiti. Dead config: accordion keyframes/animation (:90-103), `sidebar` colour tokens (:69-78), and their 16 CSS vars (src/index.css:42-49,95-102) | tailwind.config.js:2,106 | **VERIFIED** |
| postcss.config.js | tailwindcss + autoprefixer. Fine | — | **VERIFIED** |
| jsconfig.json | Type-check scope is broken (FE-05) | jsconfig.json:19-20 | **VERIFIED** |
| eslint.config.js | 6 active rules, src/lib ignored (FE-04) | eslint.config.js:9-14,37-58 | **VERIFIED** |
| components.json | shadcn new-york, `tsx:false`, aliases match jsconfig paths. Fine | — | **VERIFIED** |
| base44/config.jsonc | `npm install`, not `npm ci` (BE-12) | base44/config.jsonc:4 | **VERIFIED** |

### FE-03 The stale-chunk reload guard is cleared at boot, so a persistent chunk failure reload-loops
- Tag: **VERIFIED** (code trace); **SUSPECTED** (trigger frequency)
- Severity: Medium
- Evidence: src/main.jsx:10 calls `markChunksLoaded()` unconditionally before any lazy chunk loads, which removes `recompone_chunk_reloaded` (src/lib/lazyWithRetry.js:41-47). `hardReloadOnce` depends on that key surviving the reload (lazyWithRetry.js:29-30), and the in-memory guard (:13,27,35) resets on reload. Trace: a lazy chunk fails 3× (`retries: 2`, :51) → set key → reload → main.jsx clears the key → the chunk fails again → reload, indefinitely. The `vite:preloadError` path (:55-58) loops the same way. The tests only check that the calls exist (tests/security/observability.test.js:152-154,176-182).
- Impact: Any persistent lazy-chunk failure while index.html and the entry chunk still load (broken deploy, CDN fault, a stale cached index.html pointing at deleted hashes) gives an endless reload loop instead of the error card.
- Fix: Clear the guard only after the first lazy route resolves, or store a timestamp and refuse a second reload within N seconds. Effort: <1h

### FE-16 Every route, public SEO pages included, waits on the Base44 API before first paint, with no request timeout
- Tag: **VERIFIED**
- Severity: Low
- Evidence: App.jsx:75-80 renders `AppSplash` until `isLoadingPublicSettings || isLoadingAuth`. AuthContext awaits public settings (:43), then `auth.me` only if a token exists (:47-48). A failed request ends the wait (:55-87). A hanging one does not: the SDK's `createAxiosClient` sets no `timeout` (node_modules/@base44/sdk/dist/utils/axios-client.js:118-126). `appPublicSettings` is stored (:44) and never read.
- Impact: Calculators, tips and the landing page (the indexable surface) cannot render until the Base44 API answers. A stalled backend shows the splash indefinitely, crawlers included.
- Fix: Render public routes without waiting on auth, block only the protected subtree, and add a timeout to the public-settings call. Effort: <1d

### FE-22 app-params wipes `history.state` on every load
- Tag: **VERIFIED** (code); **SUSPECTED** (user-visible effect)
- Severity: Low
- Evidence: src/lib/app-params.js:18 `window.history.replaceState({}, document.title, nextUrl);` runs unconditionally (:92) at module load (`export const appParams = getAppParams();`, :122), before BrowserRouter mounts. It drops React Router's `{usr,key,idx}`, and AndroidBackHandler reads `window.history.state?.idx` (AndroidBackHandler.jsx:13).
- Impact: After any reload on a sub-screen, the chunk-recovery reload included, Back goes to the tab root instead of the previous screen.
- Fix: Call `replaceState` only when a bootstrap param was removed, and preserve `history.state`. Effort: <1h

### FE-23 Bundle composition: framework split only, and socket.io ships for one screen
- Tag: **VERIFIED** (sizes, chunk contents); **SUSPECTED** (preloadError coverage of the inner lazies)
- Severity: Info
- Evidence: vite.config.js:35-37 splits only the framework. The base44Client chunk (135 kB) contains axios + socket.io, and realtime is used by one hook (nutritionReportHook.js:25). The inner `lazy()` calls for BarcodeScanner/FoodPhotoScan (Nutrition.jsx:31-32) and BodyCompositionScan (Progress.jsx:38) bypass `lazyWithRetry`; only the global `vite:preloadError` hook covers them (lazyWithRetry.js:55-58).
- Impact: Acceptable for a WebView app. recharts (DEP-12) and zxing (DEP-13) dominate, and every SDK release changes the 135 kB chunk.
- Fix: Optional: give recharts its own vendor chunk, and use `lazyWithRetry` for the inner lazies. Effort: <1h

### BE-12 The Base44 site build uses `npm install`, not `npm ci`
- Tag: **VERIFIED** (config); **SUSPECTED** (that the platform honours it as written)
- Severity: Low
- Evidence: base44/config.jsonc:4 `"installCommand": "npm install"`. CI uses `npm ci` (.github/workflows/ci.yml:35).
- Impact: Whenever package.json and the lockfile disagree, a production build can resolve versions CI never tested.
- Fix: `"installCommand": "npm ci"`. Effort: <1h

---

## 4. Routing table

All routes live in `src/App.jsx`; there are no other `<Routes>` (`grep -rn "<Routes" src` → App.jsx:85 only). Every page element is `lazyWithRetry` (App.jsx:21-66), except `RootRedirect`, `<Navigate>` and `ProtectedRoute` (static import, :11). Guard chain for protected routes: `ProtectedRoute` (:107, unauthenticated → `<Navigate to="/login">`) → `RecompGate` (:108) → `RequireOnboarding` (:110, not onboarded → `/onboarding`) → `AppLayout` (:111, tab bar + keep-alive). Premium checks are made in-page (`usePremiumAccess().canAccess`), never at the router. **VERIFIED** (A §3.1; writer re-read App.jsx:60-139)

| Path | Component | Lazy | Guard | Layout | path:line | Tag |
|---|---|---|---|---|---|---|
| `/` | `RootRedirect` → `/today` (signed in) / `/login` (native shell) / `/coming-soon` (web) | no | public | none | App.jsx:68-72,86 | **VERIFIED** |
| `/hero` | Hero (beta access; `AppSplash` until auth is checked, Hero.jsx:55) | yes | public | own | App.jsx:45,87 | **VERIFIED** |
| `/coming-soon` | PublicHome → pages/ComingSoon | yes | public | own | App.jsx:46,88; PublicHome.jsx:1-4 | **VERIFIED** |
| `/privacy` `/terms` `/support` `/delete-account` | Privacy / Terms / Support / DeleteAccount | yes | public | LegalShell | App.jsx:47-50,89-92 | **VERIFIED** |
| `/tools/tdee-calculator` `/tools/macro-calculator` | seo/TdeeCalculator, seo/MacroCalculator | yes | public | SeoShell | App.jsx:51-52,93-94 | **VERIFIED** |
| `/learn` `/learn/body-recomposition-guide` | seo/LearnIndex, seo/RecompGuide | yes | public | SeoShell | App.jsx:53-54,95-96 | **VERIFIED** |
| `/locations` `/locations/:slug` | seo/LocationsIndex, seo/LocationPage (in-page "not found") | yes | public | SeoShell | App.jsx:55-56,97-98 | **VERIFIED** |
| `/tips` `/tips/:slug` | seo/TipsIndex, seo/TipArticle (in-page "not found") | yes | public | SeoShell | App.jsx:57-58,99-100 | **VERIFIED** |
| `/compare` `/compare/:slug` | seo/ComparisonsIndex, seo/ComparisonArticle | yes | public | SeoShell | App.jsx:59-60,101-102 | **VERIFIED** |
| `/login` `/register` `/forgot-password` `/reset-password` | Login / Register / ForgotPassword / ResetPassword | yes | public | AuthLayout | App.jsx:23-26,103-106 | **VERIFIED** |
| `/onboarding` | Onboarding (sends onboarded users to `/today` unless `?redo=1`, Onboarding.jsx:169) | yes | Protected + RecompGate (no RequireOnboarding) | none | App.jsx:27,109 | **VERIFIED** |
| `/today` | Today | yes | Protected + Gate + Onboarded | AppLayout (tab root, kept alive) | App.jsx:28,112 | **VERIFIED** |
| `/today/autopilot` | WeeklyAutopilot (premium `WEEKLY_AUTOPILOT`, :75) | yes | same + in-page premium | AppLayout | App.jsx:29,113 | **VERIFIED** |
| `/nutrition` | Nutrition (photo scan: premium `FOOD_PHOTO` + flag, :59,395) | yes | same | AppLayout (tab root) | App.jsx:30,114 | **VERIFIED** |
| `/nutrition/meal-plan` | AdaptiveMealPlan (premium `MEAL_PLANNING`, :65) | yes | same + premium | AppLayout | App.jsx:31,115 | **VERIFIED** |
| `/training` | Training | yes | same | AppLayout (tab root) | App.jsx:32,116 | **VERIFIED** |
| `/training/plan` | AdaptiveTrainingBlock (premium `TRAINING_PLANNING`, :55) | yes | same + premium | AppLayout | App.jsx:33,117 | **VERIFIED** |
| `/progress` | Progress (body comp: flag + `VISUAL_PROGRESS`, :255) | yes | same | AppLayout (tab root) | App.jsx:34,118 | **VERIFIED** |
| `/progress/visual-check` | VisualProgressCheck (premium `VISUAL_PROGRESS`, :101) | yes | same + premium | AppLayout | App.jsx:35,119 | **VERIFIED** |
| `/more` | More | yes | same | AppLayout (tab root) | App.jsx:36,120 | **VERIFIED** |
| `/more/plan` `/more/decisions` `/more/data` | Plan, DecisionHistory, YourData | yes | same | AppLayout | App.jsx:38-40,121-123 | **VERIFIED** |
| `/more/coach` | Coach | yes | same | AppLayout | App.jsx:41,124 | **VERIFIED** |
| `/more/coach/lifestyle` | LifestyleCoach (`LIFESTYLE_COACH_ENABLED = false`, base44/shared/lifestyleCoachDomain.js:16, + `canAccess("ai_lifestyle_coach")`, :204,208) | yes | same + premium + flag | AppLayout | App.jsx:42,125 | **VERIFIED** |
| `/more/profile` `/more/premium` `/more/referrals` | Profile, Premium, Referrals | yes | same | AppLayout | App.jsx:43-44,37,126-128 | **VERIFIED** |
| `/plan` `/decisions` `/coach` `/profile` | `<Navigate replace>` to `/more/*` (legacy deep links) | no | inside the protected chain | AppLayout | App.jsx:130-133 | **VERIFIED** |
| `*` | `lib/PageNotFound` (Base44 boilerplate, FE-10) | yes | public, top level (outside AppLayout) | own | App.jsx:21,138 | **VERIFIED** |

Totals: 44 `path=` entries: 21 public (including `/`), 1 onboarding, 17 app screens, 4 redirects, 1 catch-all. **VERIFIED** (counted App.jsx:86-138)

Other routing pieces (A §3.1, **VERIFIED**):
- Tabs: 5 roots in src/lib/tabNavigation.js:1-7. AppLayout keeps every visited tab root mounted and hides it with `className="hidden"` (AppLayout.jsx:25,60-64). Tab NavLinks use `replace` (:89), sub-routes animate with framer-motion (:65-79), and the bottom `<nav>` renders only on tab routes (:81-120). ScrollToTop.jsx:4 duplicates the root list.
- Android Back: `window.handleAndroidBack` is installed by src/components/AndroidBackHandler.jsx:10-27, with the policy in src/lib/androidBack.js:32-50. Nothing in the repo calls it; the caller is assumed to be the Base44 Android wrapper (**SUSPECTED**).
- 404: the top-level `*` only. Unknown SEO slugs render an in-page "not found" with `robots: "noindex,follow"` (src/lib/routeMetadata.js:176-188, executed).

Page files not reachable from the router: only `src/pages/OAuthConsent.jsx` (240 lines; FE-11). `ComingSoon.jsx` is reached through PublicHome.jsx:1-4; the other 37 page files are imported in App.jsx:21-60. **VERIFIED**

### FE-02 RouteErrorBoundary wraps the whole authenticated tree: any screen crash removes the tab bar and unmounts RecompProvider, and a crash in a hidden kept-alive tab blanks the visible one
- Tag: **VERIFIED** (code); **SUSPECTED** (how often users get stuck)
- Severity: Medium
- Evidence: src/components/RouteErrorBoundary.jsx:4-6 says it "leaves the shell (nav, offline banner, back handler) interactive". In fact App.jsx:158-162 wraps all of `AuthenticatedApp` in it, and that includes RecompGate, AppLayout and its `<nav>` (AppLayout.jsx:81-120). Only RouteAccessibility, ScrollToTop, AndroidBackHandler and OfflineBanner (App.jsx:153-156) survive. The resetKey is `location.pathname` (RouteErrorBoundary.jsx:10), and a hidden tab that throws does not change it. The fallback's one button, "Try again" (ErrorBoundary.jsx:36-40,57-66), remounts the subtree, i.e. 13 + 7 queries again (RecompContext.jsx:340-356,423-433), and drops the in-memory food recovery markers (:223-228). iOS has edge-swipe back (expo-ios/src/RecompOneWebView.tsx:436), but tab switches use `replace` (AppLayout.jsx:89), so a crash on a tab root reached at launch has no history.
- Impact: A deterministic render error on a tab root leaves an iOS user on a card with no navigation, whose retry re-throws; quitting is the only exit. Elsewhere, recovery costs a full data reload. docs/codex-handoff.md:19 (PR #34) announced the feature as "route error recovery".
- Fix: Put an inline ErrorBoundary around each kept-alive tab container and the animated outlet inside AppLayout (AppLayout.jsx:61-63,75), keyed per tab, and add a "Go to Today" link to the fallback. Effort: <1h

### FE-07 Leaving the protected subtree (Privacy/Terms/Support/Delete-account, 404) tears down RecompProvider: full reload, lost recovery markers, aborted writes
- Tag: **VERIFIED** (mechanism); **SUSPECTED** (data divergence under real timing)
- Severity: Medium
- Evidence: The public routes are siblings of the protected chain (App.jsx:89-92 vs :107-137). More (More.jsx:209-212), PremiumPaywall (:240-241) and YourData (:188) link to them. On unmount `providerActive=false` (RecompContext.jsx:236-239), and food recovery state lives only in refs (:223-228). An in-flight `logFoodEntries` that has passed `FoodLogEntry.create` (:1341) and then fails `assertFoodOwner` (:1345) lands in the catch at :1357, which rethrows with no compensation, no totals increment (:1348) and no recovery marker. Re-entry re-runs `loadInitial` (13 queries) and `loadHistory` (7) behind the full-screen spinner (:1919-1924).
- Impact: Reading the privacy policy from More costs ~20 API calls plus the keep-alive tab state. A meal logged a few hundred ms before such a navigation can leave a FoodLogEntry whose calories never reach the DailyLog totals.
- Fix: Hoist RecompGate above both public and protected routes for signed-in users, or persist recovery markers; do not treat unmount as "account changed". Effort: <1d

### FE-06 Three authenticated screens announce "Page not found" to screen readers and use it as the document title
- Tag: **VERIFIED** (executed `getRouteMetadata` for every literal App.jsx path)
- Severity: Low
- Evidence: src/lib/routeMetadata.js:14-168 has no entry for `/more/data`, `/more/referrals` or `/more/coach/lifestyle`, so `getRouteMetadata()` (:176-188) falls back to `NOT_FOUND_METADATA` (:170-174). RouteAccessibility sets `document.title` (:30) and the live region (:49-51). All 3 screens are linked from More (More.jsx:220,222,254). No test covers them.
- Impact: VoiceOver/TalkBack users hear "Page not found" on Your Data, Referrals and Lifestyle Coach.
- Fix: Add the 3 entries, plus a test that every literal `path=` has metadata. Effort: <1h

### FE-10 The 404 page is unmodified Base44 boilerplate
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/PageNotFound.jsx:23 hard-codes `bg-slate-50`/`text-slate-*`, ignoring the dark theme. :43-56 tells admins "This could mean that the AI hasn't implemented this page yet. Ask it to implement it in the chat." :10-20 makes its own `auth.me()` call through `useQuery` although AuthContext already holds `user`. It renders outside AppLayout (App.jsx:138), so a mistyped deep link also unmounts RecompProvider (FE-07).
- Impact: An off-brand white screen with builder-facing copy in a shipped store app, plus a redundant network call.
- Fix: A themed 404 that uses `useAuth()` and links home. Effort: <1h

### FE-11 `src/pages/OAuthConsent.jsx` is unreachable, and the Base44 Builder re-added it each time it was deleted
- Tag: **VERIFIED** (unreachable, history); **SUSPECTED** (future bot behaviour)
- Severity: Low
- Evidence: There is no route (App.jsx:85-139) and no import (`grep -rn OAuthConsent` → the file itself + docs/remediation-plan.md:121). Its comment at :7-8 points at `base44/mcp/config.json`, which does not exist. `git log --diff-filter=AD`: added cb39d78 (2026-08-04), deleted 1c99808 (2026-08-15), re-added 46ef650 by base44-builder[bot] (2026-08-26), deleted 921fa4f (2026-10-05), re-added 4336ca3 by base44-builder[bot] (2026-10-06).
- Impact: 240 lines of knip noise, which would call `/mcp/*` endpoints if anyone routed it. The remediation plan's "delete it" has been undone twice.
- Fix: Keep it, add it to a committed knip `ignore`, and document that the Builder owns it. Effort: <1h

### FE-13 Android Back on `/onboarding` can never exit the app
- Tag: **VERIFIED** (logic); **SUSPECTED** (that the wrapper calls `handleAndroidBack` as assumed)
- Severity: Low
- Evidence: `/onboarding` is in neither `PUBLIC_EXIT_PATHS` nor the tab roots (src/lib/androidBack.js:6-11,32-50). At idx 0, Back → `navigate("/")` push (:49) → RootRedirect `/today` → RequireOnboarding `/onboarding` at idx 1. The next Back → `navigate(-1)` → idx 0, and the cycle repeats, remounting RecompProvider each time (FE-07). tests/security/android-back.test.js has no onboarding case.
- Impact: A first-run user who wants to leave mid-onboarding is stuck cycling.
- Fix: Treat `/onboarding` at idx 0 as an exit path, and add a test. Effort: <1h

### FE-14 Android Back ignores open overlays (scanner, sheets, dialogs)
- Tag: **VERIFIED** (code); **SUSPECTED** (wrapper behaviour)
- Severity: Low
- Evidence: src/components/AndroidBackHandler.jsx:10-23 looks only at the route. On a tab root it returns `false` (exit), even with the full-screen BarcodeScanner open (Nutrition.jsx:705-707). No overlay pushes history or listens for popstate. docs/improvement-plan.md:88,283 records the same issue.
- Impact: Back closes the app instead of the camera or sheet.
- Fix: An overlay back-stack that `handleAndroidBack` consults first. Effort: <1d

### FE-V2 ProtectedRoute drops the requested deep link on the way to /login
- Tag: **VERIFIED**
- Severity: Low
- Evidence: App.jsx:107 `unauthenticatedElement={<Navigate to="/login" replace />}` passes no `returnTo`, although Login supports one (`safeReturnTo()`, Login.jsx:20,28; authReturnTo.js:11-29).
- Impact: A signed-out user who opens a shared or notification link lands on `/today` after sign-in.
- Fix: Navigate to `/login?returnTo=<pathname+search>`. Effort: <1h

### FE-25 SEO location pages emit `LocalBusiness` JSON-LD for 20 cities with no physical business
- Tag: **VERIFIED** (markup); **SUSPECTED** (search-policy consequence)
- Severity: Info
- Evidence: src/pages/seo/LocationPage.jsx:29-37 `"@type": "LocalBusiness"` with `addressLocality: loc.city`; 20 `LOCATION_SLUGS`. The support contact is a consumer Gmail address (src/lib/support.js:1).
- Impact: Possible structured-data manual action, and weak trust signals for a health app.
- Fix: Use `WebPage`/`Article` markup and a domain mailbox. Effort: <1h

---

## 5. State management

No Redux/Zustand. State is React contexts, one hand-rolled data provider, browser storage and URL params. **VERIFIED** (A §4)

### 5.1 Contexts

| Context | Provider (where) | State held | Consumers | Tag |
|---|---|---|---|---|
| ThemeContext | ThemeProvider, App.jsx:147 | `theme`, `preference` (system/light/dark, localStorage `recomp-theme`), `toggle`, `setTheme` (src/lib/useTheme.js:66-69) | `useTheme()`: 1 (More.jsx:134) | **VERIFIED** |
| AuthContext | AuthProvider, App.jsx:148 | `user`, `isAuthenticated`, `isLoadingAuth`, `isLoadingPublicSettings`, `authError`, `authChecked`, `appPublicSettings`; actions `logout`, `navigateToLogin`, `checkUserAuth`, `checkAppState` (src/lib/AuthContext.jsx:10-168). The value is an inline object, not memoized (:152-164) | `useAuth()`: 20 calls / 17 files | **VERIFIED** |
| PremiumAccessContext | PremiumAccessProvider, App.jsx:150 (inner keyed by user id, :44-47) | normalized `getPremiumAccess` result (`features`, `releaseFlags`, `products`, `sources`), `isLoading`, `isUnavailable`, `canAccess`, `refresh` (:49-102) | `usePremiumAccess()`: 9 files | **VERIFIED** |
| LoggingDateCtx | inside AppLayout (AppLayout.jsx:57) | `selectedDate` mirrored to `?date=` (src/lib/LoggingDateContext.jsx:19-60) | `useLoggingDate()`: 8 files | **VERIFIED** |
| ActionsCtx / HabitsCtx / RefCtx / Ctx | RecompProvider via RecompGate (RecompContext.jsx:1897-1915); context objects in src/lib/recompContexts.js | Actions: 37 callbacks (:1751-1830). Habits: `habits`, `habitEntries` (:1889-1895). Ref (16 keys): loading, loadError, profile, preferences, strategy, sessions, strengthLogs, checkIns, foods, foodLogEntries, recipes, decisionLedger, mealTemplates, onboarded, activeBlock, historyLoaded (:1834-1871). Live (8 keys): logs, todayLog, trend, signal, recompLevel, quests, boss, recompSignal (:1875-1887) | `useRecomp()` (merges Ref+Live+Actions, :113-119): 27 call sites / 27 files; `useRecompRef()` 11 files; `useRecompActions()` 13; `useRecompHabits()` 3 | **VERIFIED** |

### 5.2 `src/lib/RecompContext.jsx` (1,947 lines) by line range (A §4.2, **VERIFIED**, boundaries spot-checked)

| Lines | Responsibility |
|---|---|
| 1-82 | Imports (fitness lib + 4 `base44/shared` modules at :17-24), nutrition-increment helpers, `foodEntryPayload` field stripping |
| 84-119 | `useRecompActions`, `useRecompHabits`, `useRecompRef`, `useRecomp` (memoized merge) |
| 121-188 | Date helpers, check-in summary, `newestByKey`/`mergeDefined` dedupe, `enqueueByKey` per-key promise queues |
| 190-323 | Provider state (18 `useState`, :196-213), ~25 refs, owner guard `own()` → `ownedQuery` (:249) |
| 325-409 | `loadInitial`: 13 parallel entity queries (:340-356), optional `ensureDefaultHabits` (:385) |
| 411-486 | `loadHistory`: 7 parallel queries (:423-433), merge without overwrite, 3 retries (2 s/5 s/15 s, :37) |
| 488-551 | `ensureDateLoaded` (single day, 4 queries), `reload`, load effect on `userId` |
| 553-560 | Derived analytics memos |
| 562-725 | Plan/settings writes: `commitPlanSettings`, `completeOnboarding` (3 sequential upserts, :640-662), `updateProfile`, `updatePreferences`, `updateStrategy` (+ DecisionLedger, plan-cache invalidation) |
| 727-900 | `upsertDailyLog`: optimistic update, per-date queue, pre-read + `upsertTrackingRecord`, signed nutrition increments with replay/rollback |
| 902-991 | `upsertHabitEntry` (optimistic + rollback), habit CRUD |
| 993-1204 | Training: sessions, blocks, strength logs, compensating deletes, date-move side effects |
| 1206-1572 | Itemized food diary: owner assertions, recovery markers, alias chains for undo, log/update/delete/discard/repeat/restore, each a client-side two-phase write (FoodLogEntry + DailyLog totals) with compensation |
| 1574-1650 | Strength log, meal templates, recipes CRUD |
| 1652-1746 | Weekly check-in v1 (client-computed, writes WeeklyCheckIn + strategy) and v2 (`prepareCheckIn`, `decideCheckIn` → function) |
| 1748-1906 | Context value memos + nested providers |
| 1908-1947 | `RecompGate`, `RequireOnboarding` |

### 5.3 react-query
src/lib/query-client.js:4-11 sets `retry: 1` and `refetchOnWindowFocus: false` and leaves `staleTime` at 0. Usage: 1 `useQuery` (src/lib/PageNotFound.jsx:10), 0 `useMutation`, 0 `useQueryClient`/`invalidateQueries`/`setQueryData`. **VERIFIED** (A §4.3; writer re-ran `rg useQuery|useMutation src`). See FE-09 / DEP-10.

### 5.4 Browser storage keys (A §4.4, **VERIFIED** by `grep localStorage|sessionStorage|indexedDB src`)

| Key | Store | Per user? | Where | Cleared on sign-out? | Tag |
|---|---|---|---|---|---|
| `recomp-theme` | local | no (device pref) | index.html:70; useTheme.js:3,9,54 | no (fine) | **VERIFIED** |
| `base44_access_token`, `token` | local | n/a | app-params.js:24,33-34,67-68 | by SDK `logout` (**SUSPECTED**) | **VERIFIED** |
| `base44_app_id`, `base44_app_base_url`, `base44_functions_version`, `base44_from_url` | local | — | removed on every load, app-params.js:94-97 | — | **VERIFIED** |
| `base44_analytics_session_id` | local | n/a | SDK analytics (node_modules/@base44/sdk/dist/modules/analytics.js:7,345-348) | no (W-01) | **VERIFIED** (writer) |
| `recompiq_auth_redirect_pending` | session | n/a | app-params.js:4,35,47,59,113 | consumed on callback | **VERIFIED** |
| `recompone_chunk_reloaded` | session | n/a | lazyWithRetry.js:8,29-30,44 | — (FE-03) | **VERIFIED** |
| `recomp_pending_referral_code` | local | no | referralAttribution.js:3,15,29-32 | consumed on attribution | **VERIFIED** |
| `recompiq_mealplan_v1_<uid>`, `recompiq_groceries_v1_<uid>`, `recompiq_autopilot_v1_<uid>` | local | yes | planCache.js:9-55 | no (scoped); removed on account deletion (Profile.jsx:268) | **VERIFIED** |
| `recompiq_onboarding_v2:<uid>[:redo]`, legacy `recompiq_onboarding_v1` | local | yes | onboardingDraft.js:15-16,116-118, clear-all :179-180 | yes, signOutCore.js:14 | **VERIFIED** |
| `recomp_active_workout` | local | **no** | WorkoutTracker.jsx:41,66,78,84 | **no** (FE-12) | **VERIFIED** |
| `recomp-muted-plateaus` | local | **no** | PlateauAlertCard.jsx:7,11,19 | **no** (FE-12) | **VERIFIED** |
| `recompone_body_scan_<uid>` | session | yes | BodyCompositionScan.jsx:20-22,53,108,124 | no | **VERIFIED** |
| IndexedDB `recompiq_progress_photos` (store `photos`, index `userId`) | IDB | yes | progressPhotos.js:6-33 | no; deleted on account deletion (Profile.jsx:258) | **VERIFIED** |

URL state: `?date=` (LoggingDateContext.jsx:21,36-47), `?section=` on Progress (Progress.jsx:61-78), `?redo=1&step=` on Onboarding (Profile.jsx:244), `?returnTo=` on auth pages (authReturnTo.js:12), `?ref=` referral (referralAttribution.js:10-16). **VERIFIED**

### FE-01 The four-context split in RecompContext does not isolate re-renders: Actions changes on every daily-log write, and Ref carries the food diary
- Tag: **VERIFIED** (context identity churn, from deps); **SUSPECTED** (user-visible jank, not profiled)
- Severity: Medium
- Evidence: src/lib/RecompContext.jsx:1694 `}, [profile, strategy, preferences, logs, updateStrategy, historyLoaded]);` (runCheckIn) and :1713 (prepareCheckIn depends on `logs`, `checkIns`). The recipe actions at :1635/:1642/:1650 depend on `[recipes]`. All of these are in the `actionsValue` deps (:1822-1828), which contradicts the comments at :84-85 and :1748-1750 ("Actions are stable across data changes"). `refValue` includes `foodLogEntries` (:1845), although :1832 says reference data is "unchanged by a daily-log write". Every food log writes both FoodLogEntry (Ref) and DailyLog (Live). Of 27 `useRecomp()` call sites, only 5 read a single context. AppLayout keeps up to 5 tab roots mounted (AppLayout.jsx:25,60-64).
- Impact: One food log changes the identity of Ref, Live and Actions, so effectively every Recomp consumer in every visited tab re-renders. That is the cost the split (docs/codex-handoff.md:18, PR #33) was meant to remove.
- Fix: Read data from the existing refs inside runCheckIn/prepareCheckIn/recipe actions (deps `[]`), move `foodLogEntries` to its own context, and move the 5 single-context callers to the narrow hooks. Effort: <1d

### FE-09 / DEP-10 react-query is wired app-wide and sits in the entry chunk, used by one 404-page query
- Tag: **VERIFIED**
- Severity: Low
- Evidence: Provider at src/App.jsx:3,149 and src/lib/query-client.js:4-11. The only `useQuery` is src/lib/PageNotFound.jsx:3,10. `rg 'useQuery|useMutation|useQueryClient|useInfiniteQuery|useSuspenseQuery|queryClient\.' src` → only PageNotFound. The entry chunk `index-D2z4U5Kq.js` (loaded on every visit) carries 23.9 kB @tanstack/query-core + 0.3 kB @tanstack/react-query (C attribution). docs/improvement-plan.md:25 planned "react-query caching" for the RecompContext load; it was not done. Caching, dedupe and refetch are instead hand-built (`loadedDates`, queues, version counters, RecompContext.jsx:226-235).
- Impact: ~24 kB min on the critical path for one call AuthContext already answers. The hand-built replacement is where FE-01 and FE-07 come from.
- Fix: Either adopt react-query for the read paths, or delete the provider and the dependency and rewrite PageNotFound with `useAuth()`. Effort: <1h (remove) / >1d (adopt)

### FE-12 Unscoped workout-in-progress and plateau-mute keys survive sign-out and account deletion
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: src/components/training/WorkoutTracker.jsx:41 `const STORAGE_KEY = "recomp_active_workout";` is restored on mount via `useState(() => readStoredSession())` (:105, reader :64-74) with no user check. src/components/training/PlateauAlertCard.jsx:7 `"recomp-muted-plateaus"`. Sign-out clears only onboarding drafts (src/lib/signOutCore.js:13-20). The account-deletion cleanup (src/pages/Profile.jsx:265-270) does not list either key.
- Impact: On a shared device, account B opens Training and resumes account A's unfinished workout; saving it writes A's data into B's account.
- Fix: Scope both keys by user id, and clear the legacy unscoped keys in `signOutWith`. Effort: <1h

### FE-V1 A transient network or 5xx failure at boot is treated as "signed out", with no retry
- Tag: **VERIFIED** (code trace); **SUSPECTED** (frequency on mobile networks)
- Severity: Medium
- Evidence: src/lib/AuthContext.jsx:114-127: when `auth.me()` fails with anything other than 401/403, it sets `isAuthenticated=false`, `authChecked=true` and no `authError`. A public-settings failure (:77-86) also sets `isAuthenticated=false`. ProtectedRoute then renders `<Navigate to="/login" replace />` (App.jsx:107; ProtectedRoute.jsx:25-34). The retry effect fires only while `!authChecked` (ProtectedRoute.jsx:15-19). The token stays in localStorage (app-params.js:86).
- Impact: Opening the app on a flaky gym connection shows a signed-in user the login screen. It looks like a random logout.
- Fix: Keep a retryable "auth unknown" state on network/5xx failures (splash with Retry, or backoff) instead of routing to /login. Effort: <1d

### FE-21 AuthContext exposes dead API and deep-imports SDK internals
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/AuthContext.jsx:4 `import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';` is a non-public path. It resolves only because `@base44/sdk` 0.8.57 ships no `exports` map, and the declared range is `^0.8.57` (package.json:23). `logout`, `navigateToLogin`, `checkAppState` and `appPublicSettings` (:158-163) have 0 consumers. The value object is recreated every render (:152-164). The comment at src/lib/authReturnTo.js:17-18 is stale: app-params.js:91-100 now deletes the params it says are persisted.
- Impact: An SDK release that adds an `exports` map breaks boot. The unused `logout` invites a second logout path that skips `signOutWith` cleanup.
- Fix: Replace the deep import with a public SDK call or `fetch`, prune the unused fields, `useMemo` the value. Effort: <1h

### FE-24 Minor duplication and staleness
- Tag: **VERIFIED** (duplication); **SUSPECTED** (midnight staleness)
- Severity: Info
- Evidence: There are 4 local "today" helpers (RecompContext.jsx:121, loggingDateUtils.js:9, progressPhotos.js:10, WeeklyAutopilot.jsx:44) and 5 `daysAgoStr` copies (RecompContext.jsx:127, StreakDetailSheet.jsx:7, StreakBanner.jsx:6, CalorieAdherenceChart.jsx:50, WeightTrendChart.jsx:52). B adds 4 `localTodayKey()` copies (src/lib/fitness/gamification.js:6-10, projections.js:16-20, recalculate.js:10-14, base44/shared/fitnessTrends.js:36-40) and 4 `dayNumber()` copies with 2 behaviours. The `todayLog` memo depends only on `[logs]` (RecompContext.jsx:559). LifestyleCoach.jsx:208 uses the literal `"ai_lifestyle_coach"` instead of `PREMIUM_FEATURES.AI_LIFESTYLE_COACH` (base44/shared/premiumDomain.js:6). docs/improvement-plan.md cites RecompContext line numbers from a much shorter version.
- Impact: Drift risk only.
- Fix: One date util; reuse `ROOT_TAB_PATHS`; refresh the docs. Effort: <1h

---

## 6. Data layer

The browser talks to Base44 three ways: entity CRUD through the SDK (all literal calls in RecompContext.jsx), `base44.functions.invoke("<name>")` for 22 backend functions, and auth SDK calls. There is no `base44.integrations.*` in `src` (0 hits), and no legacy `@/entities`/`@/integrations` import (0 hits; `legacySDKImports` is off unless `BASE44_LEGACY_SDK_IMPORTS=true`, vite.config.js:18). **VERIFIED** (A §5.2)

### 6.1 Entity call map: `base44.entities.<Name>.<op>`

71 direct call sites, all in `src/lib/RecompContext.jsx` (writer re-ran `rg -no`: 71 hits, 1 file). Indirect use through a passed `entities` object: src/lib/planSettings.js:121,155,161,171,183 (get/updateMany on UserProfile, UserPreferences, CurrentStrategy), src/lib/sessionEdit.js:14-28 (StrengthLog filter/create/delete, ExerciseSession update), src/lib/nutritionReportData.js:21,55-56 (paged `filter` on DailyLog/FoodLogEntry), src/lib/nutritionReportHook.js:23-25 (realtime `subscribe`). **VERIFIED**

| Entity | Ops | Call sites (RecompContext.jsx unless noted) | Tag |
|---|---|---|---|
| UserProfile | filter, get, create, update | 341; 579; 642; 641, 674, 834; planSettings.js:121,155 | **VERIFIED** |
| UserPreferences | filter, get, create, update | 342; 580; 651; 650, 685; planSettings.js | **VERIFIED** |
| CurrentStrategy | filter, get, create, update | 343; 581, 698; 662; 661, 702; planSettings.js | **VERIFIED** |
| DailyLog | filter (writes via `upsertTrackingRecord`) | 344, 424, 497, 792; nutritionReportData.js:55; subscribe nutritionReportHook.js:23 | **VERIFIED** |
| ExerciseSession | filter, create, delete, update | 345, 425, 501; 994, 1044; 1067, 1134; sessionEdit.js:22 | **VERIFIED** |
| StrengthLog | filter, create, delete | 346, 426, 1130; 1046, 1575; 1065, 1133; sessionEdit.js:14-28 | **VERIFIED** |
| FoodItem | filter, create | 347; 1293 | **VERIFIED** |
| Recipe | filter, create, update, delete | 348; 1624; 1632, 1647; 1640 | **VERIFIED** |
| MealTemplate | filter, create | 349; 1583 | **VERIFIED** |
| Habit | filter, create, update | 350; 976; 982, 988 | **VERIFIED** |
| HabitEntry | filter (writes via `upsertTrackingRecord`) | 351, 429, 502, 924 | **VERIFIED** |
| TrainingBlock | filter, create, update | 352; 1004; 1002, 1031 | **VERIFIED** |
| FoodLogEntry | filter, create, update, delete | 354, 431, 499; 1341, 1479; 1402, 1431; 1367, 1457, 1518; nutritionReportData.js:56; subscribe | **VERIFIED** |
| WeeklyCheckIn | filter, create | 427; 1668 | **VERIFIED** |
| DecisionLedger | filter, create | 428; 603, 711 | **VERIFIED** |

10 of the 25 entities are never touched directly by the frontend: AiContentReport, AnalysisUpload, CoachConversation, CoachRequestUsage, LifestyleProfile, PremiumEntitlement, PushDevice, Referral, ReferralCode, WaitlistEntry. They appear only as export labels in src/pages/YourData.jsx:28-41. CoachConversation and WaitlistEntry have no writer anywhere in the repo (BE-13). **VERIFIED**

### 6.2 Function call map: `base44.functions.invoke('<name>')`

25 call sites, 22 distinct names, no non-literal invoke (writer re-ran). **VERIFIED**

| Function | Call site(s) | Tag |
|---|---|---|
| upsertTrackingRecord | RecompContext.jsx:802, 933; foodNutritionSync.js:26, 35 (`nutrition_operation_status` receipt) | **VERIFIED** |
| ensureDefaultHabits | RecompContext.jsx:385 | **VERIFIED** |
| decideWeeklyCheckIn | RecompContext.jsx:1721 (only when `VITE_ENABLE_WEEKLY_CHECK_IN_V2`) | **VERIFIED** |
| getPremiumAccess | PremiumAccessContext.jsx:70 | **VERIFIED** |
| exportAccountData | YourData.jsx:57 | **VERIFIED** |
| deleteAccount | Profile.jsx:255 | **VERIFIED** |
| getOrCreateReferralCode, getReferralStats | Referrals.jsx:19-20 | **VERIFIED** |
| recordReferralSignup | referralAttribution.js:31 (from AppLayout mount, AppLayout.jsx:52-54) | **VERIFIED** |
| coachReply, reportAiContent | Coach.jsx:166, 435 | **VERIFIED** |
| lifestyleCoachReply | LifestyleCoach.jsx:165 | **VERIFIED** |
| generateAdaptiveTrainingBlock | AdaptiveTrainingBlock.jsx:91 | **VERIFIED** |
| generateWeeklyAutopilot | WeeklyAutopilot.jsx:100 | **VERIFIED** |
| generateAdaptiveMealPlan, swapAdaptiveMeal | AdaptiveMealPlan.jsx:110, 146 | **VERIFIED** |
| searchFoods | FoodSearchCard.jsx:47 (debounced :44-62) | **VERIFIED** |
| barcodeLookup | BarcodeScanner.jsx:89 | **VERIFIED** |
| uploadAnalysisPhoto | analysisImages.js:36 (from FoodPhotoScan.jsx:124, BodyCompositionScan.jsx:97) | **VERIFIED** |
| analyzeFoodPhoto | FoodPhotoScan.jsx:131 | **VERIFIED** |
| analyzeBodyComposition | BodyCompositionScan.jsx:100 | **VERIFIED** |
| verifyApplePurchase | PremiumPaywall.jsx:47 | **VERIFIED** |
| *not called from src:* appleStoreNotification (App Store webhook), registerPushToken (no caller, BE-14), verifyGooglePlayPurchase (no Android billing client, BE-06) | `rg` → only the function dir, shared domain, tests, docs | **VERIFIED** (no caller); external callers **SUSPECTED** |

### 6.3 Auth SDK calls (**VERIFIED** `grep base44\.auth\.[a-zA-Z]+ src`)
`auth.me` (AuthContext.jsx:105, PageNotFound.jsx:14, Profile.jsx:252); `loginViaEmailPassword` (Login.jsx:27); `loginWithProvider` google/apple (Login.jsx:37,41; Register.jsx:77,81); `register`/`verifyOtp`/`setToken`/`resendOtp` (Register.jsx:38,51,53,66); `resetPasswordRequest` (ForgotPassword.jsx:19); `resetPassword` (ResetPassword.jsx:28); `redirectToLogin` (AuthContext.jsx:148, wrapped at base44Client.js:23-27); `logout` (signOutCore.js:16-18); `isAuthenticated` (dead OAuthConsent.jsx:49). Server-side auth config enables Microsoft and Facebook as well (base44/auth/config.jsonc:1-11), neither offered in the UI.

### 6.4 Caching, optimistic writes, offline, realtime (A §5.3, **VERIFIED**)
- `planCache.js` keeps per-user localStorage caches for meal plan, grocery checks and autopilot (:9-55), invalidated on strategy/settings changes (RecompContext.jsx:600,708). It is the only store for generated plans (FE-08).
- Optimistic writes with queues and rollback: `upsertDailyLog` (:756-900), `upsertHabitEntry` (:902-973), the food diary (:1315-1572, pending ids at :1330, recovery markers in refs :223-228). Nutrition increments carry `nutrition_operation_id`. On an ambiguous failure, `invokeFoodNutritionUpdate` requests a read-only receipt before it retries (src/lib/foodNutritionSync.js:22-53).
- Offline: `OfflineBanner` only shows a warning (src/components/OfflineBanner.jsx:4-25). No write queue, no service worker (`grep serviceWorker|workbox` → 0).
- Realtime: `entity.subscribe` on DailyLog/FoodLogEntry, only in nutritionReportHook.js:23-30 (socket.io in the SDK chunk).

### FE-08 Premium meal plans (swaps and AI-variety output included) and Weekly Autopilot reviews exist only in device localStorage
- Tag: **VERIFIED** (storage path); **SUSPECTED** (that deterministic regeneration reproduces the same plan)
- Severity: Low
- Evidence: Results are persisted only through `writePlanCache` (src/pages/AdaptiveMealPlan.jsx:120,176; src/pages/WeeklyAutopilot.jsx:106). `grep -nE "\.create\(|\.update\(|upsert|bulkCreate|updateMany"` on the generateAdaptiveMealPlan, generateWeeklyAutopilot and swapAdaptiveMeal entry.ts files → 0. No plan entity exists among the 25. The comment at planCache.js:2-3 ("the hosted account remains the source of truth") is false for these outputs. Only `ai_variety` mode reserves quota (generateAdaptiveMealPlan/entry.ts:121-126); the default is deterministic (AdaptiveMealPlan.jsx:73; entry.ts:114-116).
- Impact: Reinstalling, switching device or origin (web `fitnesstrackerapps.com` vs iOS `recomp-iq.base44.app`), storage eviction or any target change loses manual swaps and AI-variety plans. Regenerating AI variety spends quota again.
- Fix: Add a per-user plan entity written by the functions, with localStorage as a read-through cache. At minimum, fix the comment. Effort: >1d (~2 days)

### FE-15 The hidden Progress tab keeps a realtime subscription and refetches the full nutrition report on every log write and window focus
- Tag: **VERIFIED**
- Severity: Low
- Evidence: Progress keeps its section in local state while hidden (Progress.jsx:61), and NutritionReport renders when `section === "nutrition"` (:238-245). The hook subscribes to DailyLog/FoodLogEntry (nutritionReportHook.js:23-30), refetches on focus/visibility (:31-33), and its fetch effect depends on `logs` and `foodLogEntries` (:60). Each fetch pages both entities 250 rows at a time until an empty page (nutritionReportData.js:4,11-46).
- Impact: After one visit to Progress→Nutrition, every log write anywhere costs at least 4 extra list calls for a screen nobody is looking at.
- Fix: Gate the hook on `isActive` (Progress.jsx:60). Effort: <1h

### FE-17 Silent row caps on reference, current-week and history loads
- Tag: **VERIFIED** (caps); **SUSPECTED** (users hitting them)
- Severity: Medium (FoodItem/Recipe library caps) / Low (history caps), matching REL-15 in 05
- Evidence: Reference data: RecompContext.jsx:347 FoodItem 200, :348 Recipe 100, :349 MealTemplate 200, :350 Habit 200. Current week: :344 DailyLog 100, :346 StrengthLog 200, :351 HabitEntry 200, :354 FoodLogEntry 200. History: :424 DailyLog 500, :425 ExerciseSession 200, :426 StrengthLog 500, :429 HabitEntry 500, :431 FoodLogEntry 500, :427-428 WeeklyCheckIn/DecisionLedger 100. No pagination; `historyLoaded` is set true regardless (:471).
- Impact: Power users silently lose saved foods past 200 and older diary items (500 FoodLogEntry rows ≈ 3 weeks at 25/day), and trends drop old data.
- Fix: Paginate, as nutritionReportData.js already does, or surface the truncation. Effort: <1d

### FE-18 Each daily-log and habit write is two round trips (pre-read, then server upsert)
- Tag: **VERIFIED** (code); **SUSPECTED** (that the read is redundant)
- Severity: Low
- Evidence: RecompContext.jsx:792 `DailyLog.filter(...)` then :800-802 invoke; :924-928 `HabitEntry.filter` then :933 invoke. The read builds only `existing` for a merge (:794-797,807; :929-932). Still open from docs/improvement-plan.md:120.
- Impact: About double the latency per tap on the hottest write paths.
- Fix: Drop the pre-read and trust the server record. Effort: <1h

### FE-19 Multi-entity writes are orchestrated client-side without atomicity
- Tag: **VERIFIED**
- Severity: Low
- Evidence: Food entry creates are followed by a separate totals increment (RecompContext.jsx:1338-1348), with best-effort compensating deletes (:1363-1376). Session + N StrengthLogs + DailyLog marker (:1044-1057) use compensating deletes (:1064-1069). `saveTrainingBlock` swallows the archive failure (`.catch(() => undefined)`, :1002) and creates a new active block anyway (:1004-1011), which allows 2 `status:"active"` rows (TrainingBlock.jsonc:35 "only one active block" is not enforced).
- Impact: A network drop mid-sequence leaves partial state. The recovery UI covers the food case only.
- Fix: Move these flows into backend functions, as was done for `upsertTrackingRecord` and `decideWeeklyCheckIn`. Effort: >1d (~2-3 days)

### BE-25 The client coach contract restates server limits by hand, with no parity test; the reply-side limits already differ
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/coachContract.js:1-10 restates 1000/12/1200/9000/1800/500/128/2000, all matching the server today (coachDomain.js:11-14,36; aiReportDomain.js:15-17). `normalizeCoachReply` uses `.slice(0, 5)` and `boundedText(action, 400)` (:85-86), while the server uses `MAX_ACTIONS = 4` and `MAX_ACTION_LENGTH = 300` (coachDomain.js:37-38). Report categories are defined 3 times (coachContract.js:12-17, aiReportDomain.js:8-13, AiContentReport.jsonc:22-30). tests/security/coach-contract.test.js compares the client constants with nothing on the server.
- Impact: The reply-side difference is harmless (the server clips first). The next request-side change would make the client send requests the server rejects with 400.
- Fix: Import the constants from the pure coachDomain/aiReportDomain modules, as src/lib/fitness/* already does. Effort: <1h

### BE-26 The optimistic nutrition total on the client can exceed what the server stores
- Tag: **VERIFIED**
- Severity: Info
- Evidence: src/lib/RecompContext.jsx:43-44 claims it "Mirrors the server's increment rule … (floored at 0)", and :48 applies only `Math.max(0, …)`. The server applies `Math.min(incrementLimits[field], Math.max(0, base + amount))` (base44/shared/trackingRecordDomain.js:298; limits :134-139: calories 20000, protein 2000, carbs 3000, fat 2000).
- Impact: Past 20,000 kcal or the macro caps, the UI shows a total the server never saved, until the next refetch.
- Fix: Export the increment function from trackingRecordDomain and use it on the client. Effort: <1h

---

## 7. Backend (Base44 functions / entities / shared)

### 7.1 `base44/` structure (B §1)

| Item | Content | Used by code? | Tag |
|---|---|---|---|
| base44/config.jsonc:1-9 | Site build: `npm install`, `npm run build`, serve `npm run dev`, output `./dist` | Base44 platform build | **VERIFIED** |
| base44/auth/config.jsonc:1-11 | Username/password, Google, Microsoft, Facebook, Apple all `true`; `enableSSOLogin: false`; `googleOAuthMode: "default"` | platform | **VERIFIED** |
| base44/connectors/gmail.jsonc:1-7 | `gmail.send` + `email` scopes | **No code reference** since `joinWaitlist` was deleted in e7e92e0 (BE-11) | **VERIFIED** |
| base44/entities/*.jsonc | 25 schemas, all parse as JSON | §7.2 | **VERIFIED** |
| base44/functions/*/entry.ts | 25 Deno HTTP handlers; all pin `npm:@base44/sdk@0.8.48` on line 1; 3 also import `secrets` from `base44:runtime` | §7.3 | **VERIFIED** |
| base44/shared/*.js | 34 plain-JS modules; none imports `npm:`, `jsr:`, `base44:` or `https:`; no `Deno.` and no dynamic `import()` | §7.4 | **VERIFIED** |

### 7.2 Entities (25)

RLS patterns (B re-parsed every file): **U** (17 entities) = CRUD where `created_by_id == {{user.id}}` OR admin. **O** (AiContentReport, AnalysisUpload) = create/update/delete admin only, read by `data.owner_id` OR admin. **A** (CoachRequestUsage, PremiumEntitlement, PushDevice, Referral, ReferralCode, WaitlistEntry) = admin only; written by functions via `asServiceRole`. One field rule: `Habit.system_key` is read `true`, write admin (Habit.jsonc:20-27). **VERIFIED**

| Entity | Purpose | Key fields | RLS | Relations | Refs src / base44 / tests (files) | Tag |
|---|---|---|---|---|---|---|
| AiContentReport | user report of an AI reply | message_id, category[4], reported_content≤2000, status[4] | O (:59-87) | owner_id→User | 1 / 3 / 1 | **VERIFIED** |
| AnalysisUpload | proof the caller uploaded a private photo | file_uri≤2000, purpose[food_photo, body_composition] | O (:30-58) | owner_id→User | 1 / 5 / 3 | **VERIFIED** |
| CoachConversation | coach chat history | messages[], title, context_snapshot | U | none | 1 / 1 / 0 | **VERIFIED**. No writer (BE-13) |
| CoachRequestUsage | AI quota reservations | feature[4], request_id, requested_at | A (:47-68) | owner_id→User | 1 / 8 / 2 | **VERIFIED** |
| CurrentStrategy | active targets | calorie/protein/fat/carb, step/lifting/cardio targets, goal_type[9], manual_override | U | none (latest row wins) | 5 / 11 / 13 | **VERIFIED** |
| DailyLog | one day of metrics | date, weight, macros, steps, sleep, ratings, nutrition_operation_ids[] | U | none; "one per day" (:8) is description only | 5 / 7 / 29 | **VERIFIED** |
| DecisionLedger | audit of target changes | previous/new targets, reason, weekly_check_in_id | U | →WeeklyCheckIn | 2 / 2 / 7 | **VERIFIED** |
| ExerciseSession | workout with embedded sets | type[5], title, duration, sets[] | U | none | 4 / 5 / 9 | **VERIFIED** |
| FoodItem | per-user food library | source[5], source_id, macros, sodium_mg, tags | U | source_id = barcode/FDC id | 6 / 2 / 10 | **VERIFIED** |
| FoodLogEntry | itemized diary row | date, meal[5], quantity, macros, source[10] | U | source_food_id (untyped); repeated_from_id→FoodLogEntry | 5 / 1 / 17 | **VERIFIED** |
| Habit | habit definition | name, kind[check, count], system_key[3], target_value, archived | U + field rule | none | 4 / 5 / 10 | **VERIFIED** |
| HabitEntry | daily habit value | habit_id, date, value, done | U | →Habit | 2 / 4 / 6 | **VERIFIED** |
| LifestyleProfile | coach-extracted lifestyle context | schedule, meals, restrictions[], notes | U | none | 1 / 2 / 1 | **VERIFIED** (written only by kill-switched lifestyleCoachReply) |
| MealTemplate | saved meal | items[], totals, tags | U | none | 2 / 1 / 7 | **VERIFIED** |
| PremiumEntitlement | purchase authorization | product_id[6], source[tester, google_play, apple_store, admin], status[3], expires_at, external_transaction_id | A (:62-83) | owner_id→User | 1 / 7 / 8 | **VERIFIED** |
| PushDevice | push token store | token≤512, platform[ios, android], active | A | owner_id→User | 1 / 3 / 2 | **VERIFIED**. Only writer never invoked (BE-14) |
| Recipe | user recipe | title, servings, ingredients[], batch_nutrition, nutrition_basis enum `["batch"]` | U | none | 8 / 1 / 8 | **VERIFIED** |
| Referral | referrer→referee | code≤32, status[pending, converted, rewarded, void] | A (:55-76) | referrer_id, referee_id→User | 1 / 4 / 3 | **VERIFIED**. Nothing writes `converted`/`rewarded` (BE-01) |
| ReferralCode | shareable code | code 4-32 | A | owner_id→User | 1 / 4 / 0 | **VERIFIED** |
| StrengthLog | per-lift log | lift_name, weight, reps, sets, estimated_1rm | U | session_id→ExerciseSession | 5 / 2 / 6 | **VERIFIED** |
| TrainingBlock | persisted training plan | week_start, equipment[3], status[3], plan_json (no maxLength), completed_sessions | U | embeds session ids | 2 / 1 / 2 | **VERIFIED**. "Only one active block" (:35) not enforced |
| UserPreferences | tone, coaching prefs, safety_flags | tone[5], disliked_strategies[], safety_flags[] | U | none | 4 / 8 / 9 | **VERIFIED** |
| UserProfile | biometrics and goal | age, sex[3], height, weight, goal[9], activity[5], experience[3] | U | none | 4 / 7 / 14 | **VERIFIED** |
| WaitlistEntry | legacy pre-signup email capture | email, utm fields, hero_variant | A (:45-66) | keyed by email | 1 / 1 / 3 | **VERIFIED**. No writer since e7e92e0 (BE-13) |
| WeeklyCheckIn | weekly review (v1 + v2) | averages, recommendation_decision[11], period_key, status[5], user_decision[3] | U | none | 2 / 8 / 6 | **VERIFIED** |

Schema facts: 20 of 25 entities declare a free-form `description` string (maxLength 1000), apparently Builder boilerplate; whether anything writes it is **SUSPECTED** unused. Admins have full CRUD on all 17 U entities, which is documented as intentional (base44/shared/ownerScope.js:3-7), and code owner-scopes every query (`ownedQuery`, :20-23) (Info, **VERIFIED**). There is no uniqueness and no foreign key: duplicate DailyLogs are reconciled in code (trackingRecordPersistence.js:57-69), and ReferralCode is check-then-create (BE-24). **VERIFIED**

### 7.3 Functions (25)

U = user-scoped client, SR = `asServiceRole`. Gate = premium check via `loadPremiumAccessRecords` → `resolvePremiumAccess`. Q = `reserveFeatureRequest` quota. None is scheduled in the repo. **VERIFIED** (B §3)

| Function (lines) | Caller | Auth / gates | Entities R/W | External HTTP | Secrets/env | LLM | Tag |
|---|---|---|---|---|---|---|---|
| analyzeBodyComposition (179) | BodyCompositionScan.jsx:100 | auth.me; env kill switch :27-28,:76-78; Gate VISUAL_PROGRESS :97-101; safety_flags 409 :114-118; Q :122-127 | U R profile/prefs/strategy; SR R PremiumEntitlement, AnalysisUpload; SR RW CoachRequestUsage | Core.CreateFileSignedUrl ×3 (300 s) :151-160 | ENABLE_BODY_COMPOSITION_SCAN, PREMIUM_TESTER_EMAILS | InvokeLLM `gemini_3_flash` + 3 images :162-167 | **VERIFIED** |
| analyzeFoodPhoto (139) | FoodPhotoScan.jsx:131 | auth; Gate FOOD_PHOTO :72-78; Q :82-87; **no kill switch** | SR R PremiumEntitlement, AnalysisUpload; SR RW CoachRequestUsage | Core.CreateFileSignedUrl :115-118 | PREMIUM_TESTER_EMAILS | InvokeLLM `gemini_3_flash` :121-126 | **VERIFIED** |
| appleStoreNotification (87) | **webhook** (App Store Server Notifications V2) | no user auth; JWS + x5c verified :39-57 | SR R/U PremiumEntitlement :68-80 | none | APPLE_BUNDLE_ID (`secrets`) | no | **VERIFIED** |
| barcodeLookup (52) | BarcodeScanner.jsx:89 | auth; barcode regex :30 | none | OFF v2 product (8 s) :35-36 | none | no | **VERIFIED** |
| coachReply (169) | Coach.jsx:166 | auth; high-risk classifier :84-91; onboarding 409; safety_flags; Q free 5/20, paid 10/40 :118-135 | U R profile/prefs/strategy, DailyLog ≤200, ExerciseSession 5, WeeklyCheckIn 1; SR R PremiumEntitlement; SR RW CoachRequestUsage | none | PREMIUM_TESTER_EMAILS | InvokeLLM default + JSON schema :155-158 | **VERIFIED** |
| decideWeeklyCheckIn (58) | RecompContext.jsx:1721 (v2 flag only) | auth; **no server flag** | U R profile/prefs/DailyLog; U RW CurrentStrategy, WeeklyCheckIn, DecisionLedger | none | none | no | **VERIFIED** |
| deleteAccount (65) | Profile.jsx:255 | auth; `confirmation:"DELETE"` :30 | SR deleteMany across all 25 entities in 26 steps (accountDeletionDomain.js:25-62); SR `User.delete` :58 | none | none | no | **VERIFIED** |
| ensureDefaultHabits (47) | RecompContext.jsx:385 | auth; in-memory per-user queue :5-20 | U RW Habit, HabitEntry; SR Habit.system_key | none | none | no | **VERIFIED** |
| exportAccountData (35) | YourData.jsx:57 | auth | SR R every entity in the deletion plan; PushDevice.token redacted | none | none | no | **VERIFIED** |
| generateAdaptiveMealPlan (187) | AdaptiveMealPlan.jsx:110 | auth; Gate MEAL_PLANNING :85-89; safety_flags; Q only for `ai_variety` :121-138 | U R strategy/prefs/WeeklyCheckIn; SR R PremiumEntitlement; SR RW CoachRequestUsage | none | PREMIUM_TESTER_EMAILS | InvokeLLM `automatic` :148-157; deterministic fallback :159-162 | **VERIFIED** |
| generateAdaptiveTrainingBlock (116) | AdaptiveTrainingBlock.jsx:91 | auth; Gate TRAINING_PLANNING :74-78; safety_flags | U R profile/prefs/strategy/WeeklyCheckIn, ExerciseSession 100, StrengthLog 200; client writes TrainingBlock | none | PREMIUM_TESTER_EMAILS | no | **VERIFIED** |
| generateWeeklyAutopilot (114) | WeeklyAutopilot.jsx:100 | auth; Gate WEEKLY_AUTOPILOT :74-78 | U R profile/prefs/strategy/WeeklyCheckIn, DailyLog 30, ExerciseSession 50, Habit 100, HabitEntry 500 | none | PREMIUM_TESTER_EMAILS | no | **VERIFIED** |
| getOrCreateReferralCode (64) | Referrals.jsx:19 | auth | SR RW ReferralCode | none | none | no | **VERIFIED** |
| getPremiumAccess (56) | PremiumAccessContext.jsx:70 | auth | SR R PremiumEntitlement | none | ENABLE_BODY_COMPOSITION_SCAN, PREMIUM_TESTER_EMAILS | no | **VERIFIED** |
| getReferralStats (45) | Referrals.jsx:20 | auth | SR R ReferralCode, Referral (cap 100) | none | none | no | **VERIFIED** |
| lifestyleCoachReply (188) | LifestyleCoach.jsx:165 | auth; compile-time kill switch `LIFESTYLE_COACH_ENABLED = false` → 404 :71-74; Gate AI_LIFESTYLE_COACH; Q shared `coach` bucket 20/80 | U R profile/prefs/strategy, DailyLog 28, ExerciseSession 8, WeeklyCheckIn, LifestyleProfile; U W LifestyleProfile :167-171; SR RW CoachRequestUsage | none | PREMIUM_TESTER_EMAILS | InvokeLLM default :152-155 | **VERIFIED** |
| recordReferralSignup (78) | referralAttribution.js:31 | auth; 7-day account-age window | SR R ReferralCode; SR RW Referral (always `pending`) | none | none | no | **VERIFIED** |
| registerPushToken (77) | **none** | auth | SR RW PushDevice | none | none | no | **VERIFIED** orphan (BE-14) |
| reportAiContent (108) | Coach.jsx:435 | auth; hourly limit (insert-then-rank) | SR RW AiContentReport | none | none | no | **VERIFIED** |
| searchFoods (54) | FoodSearchCard.jsx:47 | auth; query ≥2 chars, truncated to 100 (:29-32) | none | OFF `cgi/search.pl` (8 s) :36 | none | no | **VERIFIED** |
| swapAdaptiveMeal (50) | AdaptiveMealPlan.jsx:146 | auth; Gate MEAL_PLANNING :25-28; only function with no method check; 401 → 500 (BE-V2) | SR R PremiumEntitlement | none | PREMIUM_TESTER_EMAILS | no | **VERIFIED** |
| uploadAnalysisPhoto (68) | analysisImages.js:36 | auth; type/size validated :55 | SR C AnalysisUpload :58 | Core.UploadPrivateFile :56 | none | no | **VERIFIED** |
| upsertTrackingRecord (85) | RecompContext.jsx:802,933; foodNutritionSync.js:26,35 | auth; in-memory per-key queue :10-25 | U RW DailyLog, HabitEntry; U R Habit | none | none | no | **VERIFIED** |
| verifyApplePurchase (237) | PremiumPaywall.jsx:47 | auth; appAccountToken must match user :191-194; sandbox decision :198-210 | SR RW PremiumEntitlement :215-230 | api.storekit.itunes.apple.com, sandbox on 404 :90-110 | APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_BUNDLE_ID, APPLE_PRIVATE_KEY, APPLE_SANDBOX_ALLOWED_USER_IDS | no | **VERIFIED** |
| verifyGooglePlayPurchase (237) | **none** (no Android billing client) | auth | SR RW PremiumEntitlement :219-227 | oauth2.googleapis.com/token :102-110; androidpublisher v3 :130-137 | PLAY_PACKAGE_NAME, GOOGLE_PLAY_SA_JSON | no | **VERIFIED** |

### 7.4 Shared modules (34)

Import graph inside base44/shared (no other edges; no shared module imports `../`, `npm:`, `jsr:` or `base44:`). **VERIFIED** (B §4)
```
accountExportDomain        -> accountDeletionDomain
applePurchaseDomain        -> appleJwsVerify
appleNotificationDomain    -> premiumDomain
entitlementAccess          -> premiumDomain
coachDomain                -> trackingRecordDomain, coachDayContext
lifestyleCoachDomain       -> coachDomain
defaultHabitsDomain        -> ownerScope
defaultHabitsProvisioning  -> defaultHabitsDomain, ownerScope
trackingRecordDomain       -> ownerScope
trackingRecordPersistence  -> trackingRecordDomain, httpUtils, ownerScope
fitnessTrends              -> fitnessAdherence
weeklyCheckInDomain        -> fitnessAdjustments, fitnessTrends
weeklyCheckInPersistence   -> weeklyCheckInDomain, ownerScope
(the other 21 modules import nothing)
```

| Class | Modules | Tag |
|---|---|---|
| Pure, no I/O (19) | adaptiveMealPlanDomain, adaptiveTrainingBlockDomain, aiReportDomain, appleNotificationDomain, applePurchaseDomain, bodyCompositionDomain, coachDayContext, coachDomain, defaultHabitsDomain, fitnessAdherence, fitnessAdjustments, fitnessTrends, foodPhotoDomain, lifestyleCoachDomain, ownerScope, premiumDomain, trackingRecordDomain, weeklyAutopilotDomain, weeklyCheckInDomain | **VERIFIED** |
| Injected entity accessor/client (11) | accountDeletionDomain, accountExportDomain, aiReportRateLimitDomain, analysisUploadDomain, coachRateLimitDomain, defaultHabitsProvisioning (`asServiceRole` :61,:65), entitlementAccess (`asServiceRole` :82), googlePlayPurchaseDomain, referralDomain, trackingRecordPersistence, weeklyCheckInPersistence | **VERIFIED** |
| Runtime globals | openFoodFacts (`fetch`, :58), appleJwsVerify and appleAppAccountToken (WebCrypto), coachRateLimitDomain (`crypto.randomUUID`, :204), httpUtils (`Response.json`, :11) | **VERIFIED** |
| Bundled into the frontend (14) | premiumDomain ×8 importers, ownerScope ×3, httpUtils ×2, weeklyCheckInDomain ×2, accountExportDomain, adaptiveMealPlanDomain (994 lines), appleAppAccountToken, coachDayContext, defaultHabitsDomain, fitnessAdherence/Adjustments/Trends (via src/lib/fitness re-exports), lifestyleCoachDomain, trackingRecordDomain | **VERIFIED** |
| Not imported by any function directly | coachDayContext, defaultHabitsDomain, fitnessAdherence, fitnessAdjustments, fitnessTrends; all reached transitively, none dead | **VERIFIED** |

Duplication src/lib ↔ base44/shared: src/lib/fitness/{adherence,adjustments,trends}.js are 3-line `export *` re-exports, not copies. src/lib/coachContract.js is hand-copied and partly diverged (BE-25). `roundNutrition` (RecompContext.jsx:39-41) is an identical copy of `roundTotal` (trackingRecordDomain.js:261-263). The nutrition increment rule has diverged (BE-26). **VERIFIED**

### BE-01 The referral rewards ("free month, banked" and "30% off") are advertised and never granted
- Tag: **VERIFIED** (no code path); **SUSPECTED** (that no manual admin process exists)
- Severity: High
- Evidence: src/pages/Referrals.jsx:77-78 "you earn a free month of premium — banked and ready to use", :156-157 "Friends who register with your link get 30% off their first month of premium", :160-162 "3. You earn a free month." The page is linked from More.jsx:220 ("Earn free months"). Referral.jsonc:27-36 defines `converted`/`rewarded`, but `rg -n "converted|rewarded" base44 src` finds only reads (getReferralStats/entry.ts:36-39; Referrals.jsx:69-70,131-138). The only Referral write is `status: "pending"` (base44/shared/referralDomain.js:114-119). `rg -i "30%|discount|promotionalOffer|offerCode"` finds only the copy. docs/deploy-1-5.md:43 already admits the 30% copy is unimplemented. A manual grant is possible (PremiumEntitlement `source` has `admin`, PremiumEntitlement.jsonc:27-35), but nothing does it or documents it.
- Impact: Referrers get nothing automatically and referees get no discount. The "Paid first month" and "Free months earned" counters (Referrals.jsx:131-139) stay 0. This is a broken customer promise and a possible consumer-protection exposure.
- Fix: Remove both claims from the copy now, or build the pipeline (store webhook → `converted`, time-boxed entitlement, StoreKit offer). Effort: <1h (copy) / >1d (~3-5 days, pipeline)

### BE-02 AI cost and availability ceiling: app-wide daily caps are small hard-coded constants
- Tag: **VERIFIED** (code); **SUSPECTED** (that signup is open in the dashboard)
- Severity: High
- Evidence: base44/shared/coachRateLimitDomain.js:61-66 `AI_FEATURE_DAILY_CEILINGS`: coach 500, meal_plan_ai_variety 200, body_composition 100, food_photo 800. The check at :242-253 reads up to `ceiling + 1` rows across all owners on each request and rejects with reason `"ceiling"`. The free coach quota is `{ hourly: 5, daily: 20 }` (:36-39). The comment at :32-33 says "signups are open", and base44/auth/config.jsonc:2-6 enables five sign-in methods. Added by Builder commit 5824d0b (2026-10-23). `quotaRetryAfterSeconds` returns "3600" for anything but "daily" (:162-164).
- Impact: 25 free accounts × 20 requests exhaust the coach for every user, paying users included, for a rolling 24 h, while clients are told to retry in 1 h.
- Fix: Make the ceilings env-configurable, give paid users a separate pool, and alert at 80%. Effort: <1d

### BE-V1 The pinned backend SDK lacks `entities.count()`, which the frontend SDK has; this caused the 2026-10-23 quota outage on main
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: In the `@base44/sdk@0.8.48` tarball (scratchpad), package/dist/modules/entities.js defines list (:58), filter (:71), get (:86), create (:90), update (:94), delete (:98), deleteMany (:102), bulkCreate (:106), importEntities (:118), and no `count`. The installed frontend 0.8.57 has `async count(query)` at dist/modules/entities.js:135. Builder commit 5824d0b added `await usage.count({ feature, requested_at: … })` to `reserveFeatureRequest`, plus a fake `count` in tests/security/coach-rate-limit.test.js. 1093787 replaced it with a bounded `filter` (coachRateLimitDomain.js:238-248), with the comment "the entity accessor bundled into the function runtime has no count method".
- Impact: From 12:19Z to 16:53Z on 2026-10-23, main held code under which every allowed coach, meal-plan AI, body-composition and food-photo request would throw after reserving quota (502). Whether that code was published is unknown (BE-08). The test fake hid it.
- Fix: Generate test fakes from the pinned SDK's method list, and fix BE-21. Effort: <1d

### BE-21 / DEP-20 Backend SDK pinned at 0.8.48 in 25 inline specifiers that Dependabot cannot see; frontend on 0.8.57
- Tag: **VERIFIED**
- Severity: Medium (B: Medium, C: Low; resolved to Medium, see §1.2 #3)
- Evidence: `rg -o "npm:@base44/sdk@[0-9.]+" base44/functions` → 25 × `0.8.48`, all at line 1 (e.g. base44/functions/coachReply/entry.ts:1). package.json:23 `"@base44/sdk": "^0.8.57"`, installed 0.8.57. .github/dependabot.yml:4-80 covers npm `/`, npm `/expo-ios` and github-actions only. `rg "@base44/sdk|0\.8\.48" tests scripts` → 0, so no parity test exists.
- Impact: 9 patch versions of skew, and backend SDK fixes never arrive unless someone edits 25 files. Code and fakes written against the newer API break on the backend (BE-V1).
- Fix: One version string via a Deno import map or a shared re-export, plus a test that the backend and frontend versions agree. Effort: <1d

### BE-06 The Google Play purchase path is unwired and incomplete
- Tag: **VERIFIED** (code); **SUSPECTED** (impact; nothing calls it today)
- Severity: Medium (High once Android billing ships)
- Evidence: No callers (§6.2). verifyGooglePlayPurchase/entry.ts:144 checks only `purchase.purchaseState === 0`. `rg -i "acknowledge|purchaseType|acknowledgementState|voided|rtdn" base44` → no Play hit, so the server never acknowledges a purchase or rejects a test purchase (client-side acknowledgement is also possible; no Android client exists). There is no RTDN or voided-purchases handler. The OAuth token is minted per call (:54-113), and neither fetch has an AbortSignal (:102,:135). The accepted product ids are the 6 internal ids (:12; premiumDomain.js:13-20), while iOS sells subscriptions (premiumDomain.js:24-26).
- Impact: Wired as-is, without client acknowledgement, Play auto-refunds purchases after ~3 days while Premium stays active. Refunds never revoke access, and license-tester purchases unlock Premium.
- Fix: Before any Android client calls it, add acknowledge, a `purchaseType` check, RTDN + voided-purchases polling, fetch timeouts and token caching. Effort: >1d (~2-3 days)

### BE-07 Apple sandbox purchases unlock Premium while the allowlist secret is unset
- Tag: **VERIFIED** (code); **SUSPECTED** (production secret state, who can install a sandbox build)
- Severity: Medium (Low if TestFlight stays internal)
- Evidence: base44/shared/premiumDomain.js:147 `if (allowlist.size === 0) return { allowed: true, sandbox: true, unconfigured: true };`. This is deliberate (comments at :130-133 and verifyApplePurchase/entry.ts:24-27); :203-207 only `console.warn`s. docs/deploy-1-5.md:39 lists setting the secret as a pre-launch to-do. The appAccountToken check (:191-194) still binds the purchase to the caller.
- Impact: Anyone who can run a sandbox/TestFlight build of this bundle id gets Premium on their real account for free, repeatably.
- Fix: Set the secret now (testers + App Review id), then fail closed when it is empty. Effort: <1h

### BE-17 Food photo AI and Weekly Check-In v2 have no server-side kill switch, unlike body composition
- Tag: **VERIFIED**
- Severity: Medium (B rated Low; Medium per 05 SEC-13: the Bundle grants `food_photo`, base44/shared/premiumDomain.js:42-49, and SEC-03 makes the Bundle free for testers)
- Evidence: analyzeBodyComposition/entry.ts:27-28,76-78 check `ENABLE_BODY_COMPOSITION_SCAN`. analyzeFoodPhoto/entry.ts:30-64 and decideWeeklyCheckIn/entry.ts:19-58 have no equivalent. The UI hides both behind build-time flags only (src/lib/featureFlags.js:11-13,39).
- Impact: Hiding the UI does not disable the endpoint. Any signed-in user can call the v2 apply path, which featureFlags.js:35-38 says has not passed its test matrix.
- Fix: Add `ENABLE_FOOD_PHOTO_SCAN` and `ENABLE_WEEKLY_CHECK_IN_V2` env checks. Effort: <1h

### BE-11 The Gmail connector requests `gmail.send` scope and nothing uses it
- Tag: **VERIFIED**
- Severity: Low
- Evidence: base44/connectors/gmail.jsonc:2-5 `"https://www.googleapis.com/auth/gmail.send"`. `rg -n -i "connectors|getAccessToken|SendEmail|gmail"` over src, base44, tests, scripts, expo-ios/src, index.html and public finds only the connector file and the support address string. Its last consumer, `joinWaitlist` (added ed9ab25), was deleted in e7e92e0 (2026-09-10).
- Impact: An OAuth grant to send mail as the connected account with no feature behind it; it may need disclosing in OAuth verification and Play Data Safety.
- Fix: Delete the file and revoke the connector in the dashboard. Effort: <1h

### BE-13 Two dead entities: CoachConversation (never written) and WaitlistEntry (no writer since the waitlist was removed)
- Tag: **VERIFIED** (no writer in repo); **SUSPECTED** (no writer outside the repo)
- Severity: Low
- Evidence: `rg -n "CoachConversation|WaitlistEntry"` outside docs/ finds no create or update. CoachConversation appears in base44/shared/accountDeletionDomain.js:39 and src/pages/YourData.jsx:32 only; coach history lives in memory (`useState([])`, src/pages/Coach.jsx:103). WaitlistEntry's last writer, `joinWaitlist`, was removed in e7e92e0; what remains is accountDeletionDomain.js:54-62, YourData.jsx:40 and tests pinning its RLS (tests/security/repository-policy.test.js:64-68).
- Impact: Two schemas to maintain and test, and the export UI lists a data category the app never stores.
- Fix: Drop CoachConversation. Keep WaitlistEntry only until existing rows are purged. Effort: <1h

### BE-14 Push is plumbing only: nothing sends, nothing registers, and the entity stays empty
- Tag: **VERIFIED**
- Severity: Low
- Evidence: registerPushToken/entry.ts:3-4 says it is "Called by the mobile app after obtaining an APNs/FCM token", but `rg registerPushToken` finds 0 callers in src/, expo-ios/, android/ and tests/. expo-ios/package.json:13-24 has no `expo-notifications`. `rg -i "apns|fcm\.googleapis|exp\.host|expo-server-sdk|sendPush|expo-notifications"` → only that comment and the PushDevice description. docs/features/reminders-and-integrations.md:7,30 agrees.
- Impact: An authenticated endpoint (deployed if published, **SUSPECTED**) stores device tokens for a feature that does not exist.
- Fix: Delete registerPushToken and PushDevice, or ship notifications. Effort: <1h

### BE-15 Store API calls have no timeouts, and Apple's prod→sandbox fallback doubles latency
- Tag: **VERIFIED**
- Severity: Low
- Evidence: verifyApplePurchase/entry.ts:101-110 calls `fetch(...)` without `signal`, in a loop over 2 hosts. verifyGooglePlayPurchase/entry.ts:102,135 does the same. By contrast, openFoodFacts.js:54-67 uses an 8 s AbortController (:5).
- Impact: A hanging Apple/Google endpoint holds the purchase request, and the client purchase sheet, until the platform's unknown function timeout.
- Fix: `AbortSignal.timeout(8000)` on each fetch. Effort: <1h

### BE-16 The unauthenticated Apple webhook reads an unbounded body and silently ignores bundle mismatches
- Tag: **VERIFIED**
- Severity: Low
- Evidence: appleStoreNotification/entry.ts:31 `raw = await req.text();` has no content-length cap (14 of 25 functions have one, e.g. coachReply/entry.ts:49-52). At :64-65, a missing or mismatched `APPLE_BUNDLE_ID` (appleNotificationDomain.js:31-37) returns `{ok:true}` with no log.
- Impact: Anonymous callers can push large bodies through the DER/JWS parser, and a mis-set bundle id stops all refund/expiry processing without a trace.
- Fix: Cap the body; `console.warn` when the target is null because of the bundle. Effort: <1h

### BE-18 Three functions rely on in-memory, per-isolate serialization
- Tag: **SUSPECTED** (depends on the Base44 isolate model)
- Severity: Low
- Evidence: upsertTrackingRecord/entry.ts:10-25 (`inFlightWrites`), ensureDefaultHabits/entry.ts:5-20 (`inFlightEnsures`), verifyGooglePlayPurchase/entry.ts:14-32; the comment at :14-16 of the last admits the queue holds within one instance only. Reconcile and rank-after-insert logic exists for DailyLog (trackingRecordPersistence.js:57-69), Play (googlePlayPurchaseDomain.js:1-13) and referrals (referralDomain.js:87-141), and default habits have a duplicate-merge path (defaultHabitsProvisioning.js:22-51).
- Impact: Concurrent requests on different isolates are not serialized; correctness rests on the reconcile paths.
- Fix: Document the queue as an optimisation and add a concurrent-duplicate test for ensureDefaultHabits. Effort: <1d

### BE-19 Account deletion removes AnalysisUpload rows but not the private files they point to
- Tag: **VERIFIED** (no file deletion in code); **SUSPECTED** (whether Base44 has a file-delete API)
- Severity: Medium (B rated Low; Medium per 03 §1.2 and 00 C7: physique photos are sensitive and B44-V1 lets any account create them)
- Evidence: accountDeletionDomain.js:46 deletes the rows. uploadAnalysisPhoto/entry.ts:56 stores blobs with `Core.UploadPrivateFile`. `rg -i "deletefile|DeletePrivateFile"` → 0. Profile.jsx:594-595 discloses provider retention. The delete dialog (Profile.jsx:589-597) says nothing about cancelling an active Apple subscription.
- Impact: Body and food photos outlive the account, and deleting users may keep being billed by Apple.
- Fix: Delete the files when the platform allows it, otherwise document retention; add "cancel your subscription" copy to the dialog. Effort: <1d

### BE-20 Mixed secret APIs: `Deno.env.get` vs `secrets.get` from `base44:runtime`
- Tag: **SUSPECTED** (platform behaviour)
- Severity: Low
- Evidence: `PREMIUM_TESTER_EMAILS` and `ENABLE_BODY_COMPOSITION_SCAN` use `Deno.env.get` (e.g. getPremiumAccess/entry.ts:5-6,46). The Apple and Play secrets use `import { secrets } from 'base44:runtime'` (appleStoreNotification/entry.ts:2, verifyApplePurchase/entry.ts:2, verifyGooglePlayPurchase/entry.ts:2).
- Impact: If the two stores are not mirrored, one family reads `undefined`. Every such read fails closed, so the result is a "feature mysteriously off" bug.
- Fix: One API across all functions. Effort: <1h

### BE-22 Helper duplication: `json` ×9, `statusOf` ×8, `safeErrorDetails` ×7, `ownedRecords` ×6 (2 variants), despite httpUtils.js
- Tag: **VERIFIED**
- Severity: Low
- Evidence: A local `json` identical to base44/shared/httpUtils.js:8-12 appears in analyzeBodyComposition:34, appleStoreNotification:16, generateAdaptiveMealPlan:28, generateAdaptiveTrainingBlock:19, generateWeeklyAutopilot:19, getPremiumAccess:12, registerPushToken:10, reportAiContent:14 and verifyGooglePlayPurchase:38. `ownedRecords` uses `ownedQuery()` in coachReply/entry.ts:27-33, but a raw `{ created_by_id: userId }` in analyzeBodyComposition:47, generateAdaptiveMealPlan:41, generateAdaptiveTrainingBlock:32, generateWeeklyAutopilot:32 and lifestyleCoachReply:34.
- Impact: Header and log-redaction changes must be made in 10 places. The raw variant bypasses the `requireOwnerId` guard (ownerScope.js:15-18), although `user.id` is always checked first.
- Fix: Import httpUtils everywhere; move `ownedRecords` into shared. Effort: <1h

### BE-24 `getOrCreateReferralCode` is check-then-create, uses `Math.random`, and can store an unchecked code
- Tag: **VERIFIED**
- Severity: Low
- Evidence: getOrCreateReferralCode/entry.ts:12 `Math.random()`; :36-43 the existence check; :45-54 the collision loop; :56-59 creates even when all 12 attempts collided (the last generated code, :53, is never checked). There is no rank-after-insert.
- Impact: Two parallel first loads (Referrals.jsx:19 fires on mount) can create 2 codes for one owner.
- Fix: `crypto.getRandomValues`, insert-then-rank, and fail when attempts run out. Effort: <1h

### BE-29 CoachRequestUsage pruning is per caller, and each request reads up to 501 cross-user rows
- Tag: **VERIFIED**
- Severity: Info
- Evidence: coachRateLimitDomain.js:197-200 prunes only `owner_id: ownerId`; :244-248 reads `ceiling + 1` rows across all owners per request.
- Impact: Inactive users' rows are never pruned (at most ~125 each, :27-54). Each AI request makes 4 entity round trips for quota, 5 when rejected.
- Fix: Prune globally by `requested_at`. Effort: <1h

### BE-30 Request-size guards are header-only and missing in 11 functions
- Tag: **VERIFIED**
- Severity: Info
- Evidence: The guards read `content-length` (e.g. coachReply/entry.ts:49-52). 14 functions have `MAX_REQUEST_BYTES|MAX_BODY_BYTES`. These 11 have none: appleStoreNotification, barcodeLookup, deleteAccount, ensureDefaultHabits, exportAccountData, getOrCreateReferralCode, getPremiumAccess, getReferralStats, registerPushToken, searchFoods, swapAdaptiveMeal.
- Impact: Chunked bodies without content-length skip the guard; the platform limit (unknown) is the real cap.
- Fix: A shared `readJsonBounded(req, max)` in httpUtils. Effort: <1h

### BE-V2 `swapAdaptiveMeal` answers unauthenticated and non-POST requests with 500
- Tag: **VERIFIED**
- Severity: Info
- Evidence: swapAdaptiveMeal/entry.ts:17-21 calls `base44.auth.me()` inside the single try block, and :46-48 maps every throw to `failure("The meal could not be swapped right now", 500)`. It has no `req.method` check; the other 24 functions all have one.
- Impact: Session expiry shows a generic failure instead of triggering re-auth.
- Fix: Standard 401 mapping and a 405 method check. Effort: <1h

---

## 8. External services / API calls (frontend + iOS shell + backend)

Browser sweep: `grep -rnE "fetch\(|XMLHttpRequest|axios|new WebSocket|sendBeacon|window\.open\("` over src, index.html and public returns only telemetry.js:82-85, AuthContext.jsx:4 (axios client) and the dead OAuthConsent.jsx:40,91. `src` has no `dangerouslySetInnerHTML`, `innerHTML`, `eval(` or `new Function(`. **VERIFIED** (A §6)

| # | Service | Side | Endpoint / mechanism | Caller (path:line) | Data / auth | Timeout / retry | Tag |
|---|---|---|---|---|---|---|---|
| 1 | Base44 app API | browser | same-origin `/api/...` via the SDK's axios (`serverUrl: ''`) | src/api/base44Client.js:6-13 | Bearer token + entity payloads (weight, food, sessions, photo URIs) | no axios timeout (FE-16) | **VERIFIED** |
| 2 | Base44 public settings | browser | `/api/apps/public/prod/public-settings/by-id/<appId>` | src/lib/AuthContext.jsx:33-43 | X-App-Id, token if present | none (FE-16) | **VERIFIED** |
| 3 | Base44 SDK analytics | browser | `POST /api/apps/<appId>/analytics/track/batch` (axios, or `sendBeacon` on hide) | node_modules/@base44/sdk/dist/client.js:208-214; modules/analytics.js:51,66 | event name, `page_url` (pathname), `user_id` via `auth.me()`, `session_id`, UTM/click-id params, 60 s heartbeat (W-01) | — | **VERIFIED** (writer) |
| 4 | Base44 realtime (socket.io in SDK) | browser | entity `subscribe` | src/lib/nutritionReportHook.js:23-30 | DailyLog/FoodLogEntry subscription | SDK internals **SUSPECTED** | **VERIFIED** |
| 5 | Base44 MCP consent | browser (dead) | `/api/apps/<id>/mcp/consent-info`, `/mcp/authorize-grant` | src/pages/OAuthConsent.jsx:40,91 | ctx handle, token | — | **VERIFIED** (never runs, FE-11) |
| 6 | Telemetry endpoint `VITE_TELEMETRY_ENDPOINT` | browser | `fetch` POST | src/lib/telemetry.js:10,78-95 | event name, allowlisted props (:18), path, appVersion; redacted errors | off unless `VITE_ENABLE_TELEMETRY=true` and an endpoint is set (:74-76; featureFlags.js:22) | **VERIFIED** |
| 7 | OAuth (Google, Apple) via Base44 redirect | browser | full-page redirect with `fromUrl` | Login.jsx:37,41; Register.jsx:77,81 | — | — | **VERIFIED** |
| 8 | Native IAP bridge `window.wixMobileNativeBridge` | browser ↔ shell | postMessage bridge, versioned (`BRIDGE_SOURCE`, `BRIDGE_VERSION = 1`) | PremiumPaywall.jsx:51,75,106,129; nativeIapBridge.js:45; injected by expo-ios/src/injectedBridge.ts:73-91 | productId, appAccountToken, transactionId | requestPurchase 5 min (injectedBridge.ts:10) | **VERIFIED** |
| 9 | Native speech bridge `window.recompOneSpeech` | browser ↔ shell | separate object, `version === 1`, top-frame + origin check | nativeSpeechBridge.js:26-44; expo-ios/src/injectedSpeechBridge.ts:7,12 | transcript only ("No persistence or backend calls", nativeSpeechBridge.js:46) | — | **VERIFIED** |
| 10 | Apple StoreKit | iOS shell | react-native-iap `initConnection`/`fetchProducts` (subs), `requestPurchase`, `getAvailablePurchases`, `finishTransaction` | expo-ios/src/RecompOneWebView.tsx:185-186, 278, 301, 320; product ids bridgeProtocol.ts:6-9 | Apple ID purchase | — | **VERIFIED** (writer) |
| 11 | ASWebAuthenticationSession (OAuth) | iOS shell | `WebBrowser.openAuthSessionAsync(sessionUrl, "recompone://auth")` | RecompOneWebView.tsx:352-358; nativeAuth.ts:21 | provider login; token returned via public/auth/native-return.html | — | **VERIFIED** (writer); device behaviour **SUSPECTED** |
| 12 | Off-origin links | iOS shell | `WebBrowser.openBrowserAsync(url)` for top-frame navigations outside `APP_ORIGIN` | RecompOneWebView.tsx:389-391 | — | — | **VERIFIED** (writer) |
| 13 | Apple speech recognition | iOS shell | `ExpoSpeechRecognition` native module | expo-ios/src/nativeSpeech.ts:8; app.json:24-27 ("Apple may process speech online") | microphone audio → Apple | — | **VERIFIED** (code); Apple processing **SUSPECTED** |
| 14 | `mailto:recompappsupport@gmail.com` | browser | mail client | src/lib/support.js:1-20 (used in Privacy, YourData, Premium, Support, DeleteAccount) | user-composed | — | **VERIFIED** |
| 15 | Google Play / App Store links | browser | navigation (env `VITE_GOOGLE_PLAY_URL`/`VITE_APP_STORE_URL`, host-pinned) | src/lib/storeLinks.js:23-31; ComingSoon.jsx:215-238; SeoAppCta.jsx:28-30 | none | — | **VERIFIED** |
| 16 | USDA FoodData Central | browser | attribution link only; catalog is static ("No API/key/network access is needed at runtime", genericFoodCatalog.js:5) | FoodEntryComposer.jsx:293; genericFoodCatalog.js:73 | none | — | **VERIFIED** |
| 17 | Open Food Facts product | backend | `https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=…`, UA `RecompOne/1.0 (+https://recomp-iq.base44.app)` | barcodeLookup/entry.ts:34-51; base44/shared/openFoodFacts.js:4-5,54-67 | barcode | 8 s AbortController, no retry/cache; 504 on abort | **VERIFIED** |
| 18 | Open Food Facts search | backend | `https://world.openfoodfacts.org/cgi/search.pl?search_terms=…&page_size=24` (legacy CGI, hard-coded) | searchFoods/entry.ts:35-37 | query ≤100 chars | 8 s, no retry, cache or rate limit (BE-09) | **VERIFIED** |
| 19 | Apple App Store Server API | backend | `api.storekit.itunes.apple.com/inApps/v1/transactions/{id}`, then sandbox on 404 | verifyApplePurchase/entry.ts:41-82,87-128 | ES256 JWT per call (APPLE_* secrets) | **no timeout** (BE-15) | **VERIFIED** |
| 20 | Apple JWS root of trust | backend (local crypto) | pinned Apple Root CA G3, leaf/WWDR OIDs, chain 2-3, validity at `signedDate`, no OCSP | base44/shared/appleJwsVerify.js:22-25,50-51,339-379 | — | n/a | **VERIFIED** |
| 21 | Apple Server Notifications V2 (inbound) | backend | `POST /functions/appleStoreNotification` | appleStoreNotification/entry.ts:6-14 | JWS-verified; APPLE_BUNDLE_ID | Apple retries on non-200 | **VERIFIED** code; App Store Connect config **SUSPECTED** |
| 22 | Google OAuth2 | backend | `https://oauth2.googleapis.com/token` (jwt-bearer, RS256 from SA JSON) | verifyGooglePlayPurchase/entry.ts:54-113 | GOOGLE_PLAY_SA_JSON | no timeout, token not cached | **VERIFIED** (no caller) |
| 23 | Google Play Developer API | backend | `androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/purchases/products/{id}/tokens/{token}` | verifyGooglePlayPurchase/entry.ts:130-150 | bearer from #22; PLAY_PACKAGE_NAME | no timeout | **VERIFIED** (no caller) |
| 24 | LLM via Base44 `Core.InvokeLLM` | backend | Base44 integration, provider not visible | coachReply:155 (default), lifestyleCoachReply:152 (default), analyzeFoodPhoto:121 (`gemini_3_flash`), analyzeBodyComposition:162 (`gemini_3_flash`), generateAdaptiveMealPlan:148 (`automatic`) | user context + images; quotas + ceilings (BE-02) | no timeout in code; only meal plan falls back | **VERIFIED** code; platform timeout **SUSPECTED** |
| 25 | Base44 file storage | backend | `Core.UploadPrivateFile` / `Core.CreateFileSignedUrl` (300 s) | uploadAnalysisPhoto:56; analyzeFoodPhoto:115-118; analyzeBodyComposition:151-160 | private photos; ownership via AnalysisUpload row | — | **VERIFIED** |
| 26 | Android wrapper (Base44/Wix) | Android | loads `webOrigin` `https://recomp-iq.base44.app`; calls `window.handleAndroidBack` (assumed) | android/play-release.json:7,12; AndroidBackHandler.jsx:10-27 | — | — | **VERIFIED** contract; behaviour **SUSPECTED** |
| — | Email | backend | **none.** Gmail connector declared, unused (BE-11) | base44/connectors/gmail.jsonc | — | — | **VERIFIED** |
| — | Push (APNs/FCM/Expo) | — | **none** (BE-14) | — | — | — | **VERIFIED** |

Device APIs, not network: `navigator.vibrate` (src/lib/haptics.js:27-30), camera via zxing (BarcodeScanner.jsx:3-4), IndexedDB photos (progressPhotos.js:6-33). **VERIFIED**

### W-01 Base44 SDK analytics runs in production and sends user-identified events plus a 60 s heartbeat (same issue as B44-01)
- Tag: **VERIFIED** (code: default on, not overridden); **SUSPECTED** (server-side retention, compliance effect)
- Severity: High
- Evidence: src/api/base44Client.js:6-13 calls `createClient({ appId, token, functionsVersion, serverUrl: '', requiresAuth: false, appBaseUrl })` with no `analytics` key. node_modules/@base44/sdk/dist/client.js:208-214 then sets `enabled: (… analytics?.enabled) ?? true`. modules/analytics.js:10 `enabled: true`, :14 `heartBeatInterval: 60 * 1000`, :51 ``trackBatchUrl = `${serverUrl}/api/apps/${appId}/analytics/track/batch` ``; `getSessionContext` (:277-291) attaches `user_id: user.id` from `auth.me()`; each event carries `page_url` (pathname) and `session_id` (stored as localStorage `base44_analytics_session_id`, :7,345-348). The module is disabled only on React Native (:44), detected as `!isNode && typeof document === "undefined"` (utils/common.js:7), and a WebView has `document`. vite.config.js:21-23 turns off only the plugin's `analyticsTracker`, with the comment "Keep authenticated page-view telemetry off until its collection, retention, and Play Data Safety disclosures are explicitly approved". src/pages/Privacy.jsx:76-77 promises only "Aggregated, de-identified analytics". `rg analytics src` → Privacy.jsx:77 only.
- Impact: Every web and WebView session sends page paths, the Base44 user id and a heartbeat every 60 s (while visible) to Base44. That contradicts both the config comment and the privacy text, and matters for the Play Data Safety and App Privacy labels.
- Fix: Pass `analytics: { enabled: false }` to `createClient`, or disclose it. Effort: <1h

### BE-09 Open Food Facts search has no throttle or cache, and runs on the legacy CGI endpoint
- Tag: **SUSPECTED** (depends on OFF per-IP limits and Base44 egress pooling)
- Severity: Medium
- Evidence: searchFoods/entry.ts:36 calls `https://world.openfoodfacts.org/cgi/search.pl?...` after each debounced pause (src/components/nutrition/FoodSearchCard.jsx:44-62). The handler has no cache and no per-user limit (:5-55). It imports `OFF_BASE` (:2) and never uses it.
- Impact: All users share Base44's egress. If OFF rate-limits that IP, search returns 502/504 for everyone at modest DAU.
- Fix: Per-user throttle, a cache for popular queries, and OFF's current search API. Effort: <1d

---

## 9. CI/CD & tooling

### 9.1 Pipeline

| Piece | What runs | Path:line | Tag |
|---|---|---|---|
| ci.yml `verify` | Triggers: PRs, and pushes to `main` and `base44-builder` (:3-12). Node 22 (:31). Steps: `npm ci` (:35), lint (:38), typecheck (:41), `npm ci --prefix expo-ios` (:44), expo typecheck (:47), speech tests (:50), **expo-doctor** (:52-53), fitness/security/contract tests (:55-62), verify:android (:64-65), build (:67-68), Playwright install + e2e (:70-74). Timeout 15 min (:20) | .github/workflows/ci.yml:1-74 | **VERIFIED** (writer re-read) |
| ci.yml report/resolve jobs | Open, comment on or close the issue "CI is failing on main" for main pushes. Comment at :76-78: "Pushes straight to main are not gated by this workflow" | ci.yml:76-153 | **VERIFIED** (issue #193 open) |
| codeql.yml | JS/TS CodeQL on pushes to main and base44-builder, PRs to main, weekly Mon 07:23 | .github/workflows/codeql.yml:1-39 | **VERIFIED** |
| base44-builder-pr.yml | On push to `base44-builder`, opens a PR to main. **Dead**: the branch was last touched 2026-09-15 and is 40 commits behind main, and no PR came from it | .github/workflows/base44-builder-pr.yml:1-111; tooling/branches.tsv, pr-branch-map.tsv | **VERIFIED** |
| dependabot.yml | npm `/` weekly (patch groups, minors ungrouped, majors ignored :21-25); npm `/expo-ios` weekly, patch only, ignores react/react-native/webview/dev-client/status-bar (:44-70); actions monthly | .github/dependabot.yml:1-80 | **VERIFIED** |
| playwright.config.js | testDir tests/e2e; webServer `npm run dev -- --host 127.0.0.1 --port 4173` with `VITE_BASE44_APP_ID=playwright-local`; `@deployed` tests excluded by `test:e2e` (package.json:14) and run only against `E2E_BASE_URL` (not set in CI) | playwright.config.js:4-5,56-70 | **VERIFIED** |
| scripts | verify-android-release.mjs (static checks of android/play-release.json, PNGs, public routes; `--live`, `--aab`); resolve-chromium.mjs (sandbox Chromium fallback) | scripts/verify-android-release.mjs:13-20,160-244; playwright.config.js:2,11-33 | **VERIFIED** |
| Backend deploy | **None in CI.** README.md:79-81: "open the Base44 dashboard and publish". docs/deploy-1-5.md:3,15-24,28 prescribes a manual order | — | **VERIFIED** |
| iOS build | EAS profiles (expo-ios/eas.json), `appVersionSource: "remote"`, `ascAppId` 6803546092; no CI job builds or submits | expo-ios/eas.json:1-31 | **VERIFIED** (writer) |

### 9.2 Tool results at 1093787 (tooling digest)

| Check | Result | Caveat | Source | Tag |
|---|---|---|---|---|
| `npm run lint` | exit 0 | 6 active rules, `--quiet`, src/lib/ui ignored (FE-04) | tooling/lint.txt | **VERIFIED** |
| `npm run typecheck` | exit 0 | 220 files pulled in; 29 src files never checked (FE-05); 0 entry.ts (BE-03) | tooling/typecheck.txt, tsc-files.txt | **VERIFIED** |
| `test:fitness` / `test:security` / `test:contract` | 345 / 492 / 15 pass | Skipped on main in CI (BE-05); security tests mostly read source text (BE-03) | tooling/test-fitness.txt, test-security.txt, test-contract.txt | **VERIFIED** |
| `test:e2e` | **fails to load**: `Cannot find package 'esbuild'` | DEP-01 | tooling/e2e.txt | **VERIFIED** |
| `vite build` | OK, 155 assets, 2.8 MB JS | `VITE_BASE44_APP_ID` unset warning | tooling/build.txt | **VERIFIED** |
| `npm audit` (root) | 0 vulnerabilities | — | tooling/npm-audit.txt | **VERIFIED** |
| `npm audit --package-lock-only` (expo-ios) | 9: 4 high, 5 low | build-time tooling (DEP-15) | tooling/expo-npm-audit.txt | **VERIFIED** |
| knip / depcheck | see §10.1 | — | tooling/knip-*.txt, depcheck.json | **VERIFIED** |
| CI on main (GitHub API) | #529 (2026-10-20) green; #531 doctor; #533-#539 Typecheck; #540-#547 doctor; steps 11-17 skipped | §1.2 #1 | C DEP-02, B BE-05 | **VERIFIED** |

### BE-05 / DEP-02 Main is red before the test steps because expo-doctor uses live Expo API data; every later step is skipped
- Tag: **VERIFIED** (GitHub Actions API; doctor mechanism read from @expo/cli source)
- Severity: High
- Evidence: All main push runs #531 (2026-10-21) to #547 (2026-10-23, head 1093787) concluded `failure`: #531 and #540-#547 at "Validate Expo configuration" (ci.yml:52-53 → expo-ios/package.json:11 `"doctor": "npx expo-doctor"`, locked 1.20.4), #533-#539 at Typecheck. Steps 11-17 (ci.yml:55-74: fitness, security, contract, Android verify, build, e2e) were `skipped` in every sampled run. Mechanism: expo-doctor's `InstalledDependencyVersionCheck` spawns `expo install --check`. In @expo/cli 57.0.31, getVersionedPackages.js merges in `getRemoteVersionsForSdkAsync()` ("Prefer the remote versions over the bundled versions, this enables us to push emergency fixes"). `npm view expo dist-tags` → `"sdk-57": "57.0.31"`; runs #542 and #547 report `expo expected ~57.0.31 found 57.0.30`. Doctor has also failed `verify` on Dependabot PRs #159/#160 (2026-09-21), #170, #177, #192 and #195. Open issue #193.
- Impact: The 492 security tests, the build and e2e do not run on main at all. An upstream Expo release turns main red with no repo change, and the red masks DEP-01 and DEP-04. Merging #196 alone does not fix it (DEP-24).
- Fix: Make the gating step hermetic (`EXPO_OFFLINE=1` or `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`; whether doctor's other network checks then pass is **SUSPECTED**), run the online doctor as a scheduled non-blocking job, then land #196 with the DEP-24 fix. Effort: <1h

### DEP-01 The entire Playwright e2e suite cannot load: `esbuild` is imported but no longer installed since the Vite 8 upgrade
- Tag: **VERIFIED**
- Severity: High
- Evidence: tests/e2e/meal-speech-input.spec.js:2 `import { build } from "esbuild";`, used at :9. esbuild was never declared in package.json (`git log -S'"esbuild"' -- package.json` → 0). Before 3ddb424 it came in only as a dependency of vite 6.4.3, and `git show 3ddb424 -- package-lock.json` deletes that entry. Vite 8.3.5 lists esbuild as an optional peer only. `npm ls esbuild` → `(empty)`. tooling/e2e.txt: `Cannot find package 'esbuild'`, exit 1. knip and depcheck (`missing.esbuild`) agree. Playwright loads all 34 spec files (194 `test("…")` declarations; 05 conflict #2) before running, so one failed import kills the run. The spec was added 2026-10-20 (5c2e4f9); main run #529 that day was green.
- Impact: No e2e test has run locally or in CI since 3ddb424 (2026-10-23, Builder, pushed to main). CI hides it behind BE-05. Main goes red on this next once doctor is fixed.
- Fix: Add `"esbuild": "^0.28.2"` to devDependencies, or rebuild the fixture with Vite's `build()`. Effort: <1h

### DEP-24 The expo-ios security test depends on unlisted `xcode`@3; Expo patch PR #196 (xcode 4.0.0) already fails CI on it
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: expo-ios/tests/dependencySecurity.test.ts:6-8 `require("xcode")`, then resolves `uuid` through it; :14 `assert.equal(manifest.overrides["xcode@3.0.1"].uuid, "11.1.1");`, :15 asserts the uuid version. `xcode` is not in expo-ios/package.json:13-30; main gets xcode 3.0.1 via `@expo/config-plugins@57.0.10`, with the override at package.json:31-35. The test runs in CI step 9 (ci.yml:49-50). PR #196's lockfile moves to `@expo/config-plugins` 57.0.11 → xcode 4.0.0, which has no uuid dependency. On GitHub, #196's `verify` fails at step 9 and doctor is skipped. Reproduced in the scratchpad: `Error: Cannot find module 'uuid'`, `# pass 15 # fail 1`.
- Impact: The routine Expo patch needed to clear DEP-02 cannot pass CI as-is, and every Expo bump that moves `xcode` hits the same wall.
- Fix: In #196, delete the `xcode@3.0.1` override and rewrite the test for xcode 4 (drop the uuid assertions, keep the `generateUuid()` test at :19-29). Effort: <1h

### BE-04 / DEP-03 `main` takes unreviewed direct pushes from the Builder and the owner, including payment, paid-inference and toolchain-major changes
- Tag: **VERIFIED** (commit history, branch rule)
- Severity: High
- Evidence: `git log origin/main --since=2026-09-15T13:40` shows 35 commits by committer: 13 `base44-builder[bot]` and 11 `Aaron Cole`, all single-parent with no PR number, against 11 PR merges (committer `GitHub`). `gh api repos/aaronjcole/recomp-iq-app/branches/main` → `"protected": true`, `"required_status_checks": {"checks": [], "contexts": [], "enforcement_level": "off"}`. The comment at base44-builder-pr.yml:3-5 assumes "With `main` protected, pointing it at this branch instead turns each Builder edit into a reviewable pull request", but `origin/base44-builder` is 40 commits behind and has never produced a PR. Direct pushes that touched base44/: 43cb895 (Builder: verifyGooglePlayPurchase, googlePlayPurchaseDomain), 5824d0b (Builder: coachReply, coachRateLimitDomain → BE-V1), 1093787 (Builder), 5c2e4f9 (owner, 7 base44 files), 3316516 (owner, 3 files). Dependency majors landed the same way: 3ddb424 (Builder, `Co-authored-by: aaronjcole`, `gh api commits/3ddb424/pulls` → `[]`) moved vite `^6.1.0` → `^8.3.5` and @vitejs/plugin-react `^4.3.4` → `^6.1.2` and rewrote 1,660 lockfile lines (→ DEP-01). react-router-dom 6→7 (6530f55, 2026-08-01) was also a direct commit. That bypasses dependabot.yml:21-25, "Major upgrades need isolated migration PRs". docs/codex-handoff.md:101-103 records that required checks were left off so the Builder could push.
- Impact: Paid-inference, payment and toolchain changes reach main unreviewed and untested (BE-05). Deploys are manual from the same dashboard the Builder works in (BE-08), so such code can reach production without review.
- Fix: Point the Builder at `base44-builder`, make `verify` a required check with PRs for main (docs/codex-handoff.md:101 explains why the two must change together), and have the owner use PRs. Or accept the risk explicitly and delete the dead workflow. Effort: <1d (settings + process; plus Base44 dashboard work, matching GIT-03)

### DEP-V1 A Builder conflict resolution silently re-added dependencies a reviewed PR had removed
- Tag: **VERIFIED**
- Severity: Low (observed impact is two unused packages; the same path could revert a security pin, not observed)
- Evidence: PR #136 (fbea2e4, 2026-09-14) removed `@hookform/resolvers`, `@radix-ui/react-accordion`, `react-hook-form` and `zod`. The next day base44-builder[bot] committed afd0fc4 "Resolve dependency conflicts in package files" and merged origin/main 6 s later (5e8b64e). afd0fc4 carries `@hookform/resolvers` and `@radix-ui/react-accordion`, which main (2984e36) did not have. Both are on main today (package.json:25-26). `gh api commits/afd0fc4/pulls` → `[]`.
- Impact: Reviewed dependency changes can be reverted by a Builder merge with no PR, review or CI gate.
- Fix: Route the Builder through its PR branch (BE-04), and add a CI check that fails on knip-unused dependencies. Effort: <1h + BE-04

### BE-03 No backend function source is ever executed or type-checked, and the test fakes diverge from the runtime
- Tag: **VERIFIED**
- Severity: High
- Evidence: `rg -i deno .github package.json scripts playwright.config.js` → 0 hits, and there is no deno.json, deno.lock or import map in the repo. jsconfig.json has no base44 path; tsc reaches 16 of 34 shared modules (transitively, via frontend imports) and 0 of 25 entry.ts (tooling/tsc-files.txt). eslint.config.js:9-14 lints only src/components, src/pages and src/Layout.jsx. 26 test files mention `entry.ts` (24 by literal path, 2 via readdirSync: owner-scoping.test.js:168, entitlement-loader.test.js:159), and none imports or executes one; tests/security has 223 `readFile*` calls. E2E mocks all `**/api/apps/**` (tests/e2e/support/base44.js:255), with per-function stubs at :347-429. Concrete incident: BE-V1.
- Impact: Typos, wrong imports, SDK misuse and request-shape bugs in 2,595 lines of handlers are caught only in production, and shared-domain tests pass against fakes the pinned SDK does not match.
- Fix: A CI job running `deno check base44/functions/*/entry.ts`, plus a smoke `deno test` per handler with a fake client built from the pinned SDK surface. Effort: <1d

### BE-08 Backend deploys are manual and ordered, and the repo does not record what is live
- Tag: **VERIFIED** (no automation); **SUSPECTED** (current git↔prod drift)
- Severity: Medium
- Evidence: README.md:79-81; docs/deploy-1-5.md:3, :15-24 ("Publish these first: `uploadAnalysisPhoto` … `upsertTrackingRecord`"), :28 "Never publish the frontend before step 2". No workflow has a deploy job (`rg -i "base44 deploy|npx base44"` outside node_modules → 0). The plugin's own build warning names a CLI path (`base44 build (or base44 deploy --build)`, tooling/build.txt:3) that the repo does not use. docs/deploy-1-5.md:6 relies on noting "the current live version" by hand.
- Impact: Publishing in the wrong order breaks food logging (deploy-1-5.md:28). Nobody can tell from git whether production runs the 1093787 rate-limit fix or the broken `count()` version (BE-V1).
- Fix: Record each publish (tag or CHANGELOG line with the Base44 version id), and script the ordered publish if the Base44 CLI supports functions (**SUSPECTED**). Effort: <1d

### BE-10 E2E exercises the dev server with a fully mocked backend and non-production flags
- Tag: **VERIFIED** (config); **SUSPECTED** (production build env values)
- Severity: Medium
- Evidence: playwright.config.js:59 starts `npm run dev`, not the built bundle. :67 sets `VITE_ENABLE_ITEMIZED_FOOD_DIARY: "true"`, which nothing reads (featureFlags.js:27 hard-codes `true`). :68 sets `VITE_ENABLE_WEEKLY_CHECK_IN_V2: "true"`, which a production build without that var has off (featureFlags.js:39). Backend routes are mocked (tests/e2e/support/base44.js:255).
- Impact: E2E covers neither the production bundle, nor the real function contracts, nor the v1 check-in path that production runs (client writes WeeklyCheckIn at RecompContext.jsx:1668).
- Fix: Run e2e against `vite preview`, drop the dead env var, and add a v2-off project. Effort: <1d

### FE-04 ESLint is effectively off: 6 active rules, and src/lib (78 files, 10,013 LOC), App.jsx, main.jsx, hooks, api and ui are unlinted
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: eslint.config.js:9-14 `files` covers only components, pages and the nonexistent `src/Layout.jsx`; :14 ignores `src/lib/**/*` and `src/components/ui/**/*`. The explicit `rules:` at :37 replaces the rules from the spread `...pluginJs.configs.recommended` and `...pluginReact.configs.flat.recommended` (:15-16). `npx eslint --print-config src/pages/Today.jsx` → 6 enabled rules; `src/lib/RecompContext.jsx` and `src/App.jsx` → `undefined`. `npm run lint` is `eslint . --quiet` (package.json:9). A scratch run with the recommended sets + exhaustive-deps finds 51 errors (47 `react/no-unescaped-entities`, 3 `no-empty`, 1 `no-control-regex` false positive) and 6 `exhaustive-deps` warnings.
- Impact: The 1,947-line RecompContext and all data/auth plumbing ship with no static checks; "lint exit 0" means little. Enabling the rules is cheap because the current debt is mostly cosmetic.
- Fix: Compose the configs as separate array entries, lint `src/**`, drop `--quiet`, add `react-hooks/exhaustive-deps`. Effort: <1d

### FE-05 29 frontend files (1,952 LOC), the whole app shell included, are never type-checked
- Tag: **VERIFIED**
- Severity: Medium (A rated Low; Medium matches QUAL-03 in 05, the same jsconfig.json:19-20 scope bug)
- Evidence: jsconfig.json:19-20 includes `src/components/**/*.js` (not `.jsx`), `src/pages/**/*.jsx` and the nonexistent `src/Layout.jsx`, and excludes src/lib, src/api and src/components/ui. `find src` minus tooling/tsc-files.txt leaves 29 files: App.jsx 174, routeMetadata.js 188, publicRouteInventory.js 165, AppLayout.jsx 124, ErrorBoundary.jsx 92, lazyWithRetry.js 58, androidBack.js 50, ProtectedRoute.jsx 37, main.jsx 19 and others. 8 of them (583 LOC) are dead, leaving 21 live files / 1,369 LOC uncovered.
- Impact: Routing, guards and boot code, where regressions blank the app, get no `checkJs` coverage.
- Fix: Include `src/**/*.js` and `src/**/*.jsx`, remove the Layout entry, fix what surfaces. Effort: <1d

### BE-27 Docs that are stale relative to the code
- Tag: **VERIFIED**
- Severity: Info
- Evidence: docs/remediation-plan.md lists as open items the code has fixed: :113 OFF total sugars as added sugar (fixed, openFoodFacts.js:43-46); :114 1200 vs 1800 summary limit (both 1800, coachContract.js:7, coachDomain.js:36); :118 CodeQL not on base44-builder (fixed, codeql.yml:10); :108-109 entitlementAccess everywhere (done); :116 parallel-request races (rank-after-insert in referralDomain.js:87-141, aiReportRateLimitDomain.js:1-13); :123 atomic token claim (43cb895). C adds docs/improvement-plan.md:236 and docs/codex-handoff.md:130 (framer-motion "one usage", DEP-08) and improvement-plan.md:47,240 (nonexistent Radix toast, DEP-22).
- Impact: The plans overstate open work and misstate the code.
- Fix: Prune and correct. Effort: <1h

---

## 10. Dependencies

Declared: root package.json has 29 dependencies (:23-51) + 17 devDependencies (:54-70) = 46. expo-ios/package.json has 10 + 4 = 14. Root node_modules is installed (`npm ci --ignore-scripts`); expo-ios/node_modules is not, so its versions come from the lockfile. **VERIFIED**

### 10.1 knip and depcheck: exact results and false positives

knip (v5) and depcheck were run by the orchestrator (tooling/). The configured knip run is authoritative.

| Run | Config | Unused files | Unused deps | Unused devDeps | Unlisted | Unused exports | Other | Tag |
|---|---|---|---|---|---|---|---|---|
| knip configured | entries src/main.jsx, base44/functions/*/entry.ts, tests/**, scripts/*.mjs + configs; `ignore: expo-ios/**`; `paths @/* → ./src/*` (tooling/knip.json) | **9**: SignalStat, StepAbout, StepActivity, StepCoaching, StepWelcome, RatingDrawer, StreakBanner, use-size, OAuthConsent | **3**: `@hookform/resolvers` (package.json:25), `@radix-ui/react-accordion` (:26), `cmdk` (:40) | **1**: `baseline-browser-mapping` (:61) | **29**: 25 × `npm:` (entry.ts:1) + 3 × `base44:` (entry.ts:2) + `esbuild` (tests/e2e/meal-speech-input.spec.js:2) | **109** (39 in base44/shared) | 1 duplicate export (QuickMealsCard.jsx `QuickMealsContent|default`); 6 config hints (redundant entries) | **VERIFIED** (tooling/knip-configured.txt) |
| knip --production | production mode, tests not entries (tooling/knip-prod2.json) | 9 (same) | — | — | — | **201** → 92 exports are used only by tests | — | **VERIFIED** (tooling/knip-prod2.txt) |
| knip, tests ignored | tooling/knip-prod.json | 9 (same) | — | — | — | 109 | 3 config hints | **VERIFIED** (tooling/knip-prod.txt) |
| knip default | no config | 197 | 20 | 1 | 5 | 123 | 53 unresolved imports | **VERIFIED**, but **noise**: without the `@/` alias knip cannot resolve imports, so it flags e.g. `@base44/sdk`, Radix, recharts as unused. Not used for conclusions (tooling/knip.txt:1,199-225) |
| depcheck | default | — | `@hookform/resolvers`, `@radix-ui/react-accordion`, `cmdk` | `autoprefixer`, `postcss`, `baseline-browser-mapping` | missing: `esbuild` (1 file), `npm:@base44` (25 files), `base44:runtime` (3 files) | — | — | **VERIFIED** (tooling/depcheck.json) |
| expo-ios | knip ignores expo-ios; depcheck not run there | — | manual check (§10.4): 0 unused | — | `xcode` (DEP-24) | — | — | **VERIFIED** |

False positives and verdicts:
- **Real**: the 3 unused deps (FE-20 / DEP-05), `esbuild` missing (DEP-01), and the 8 dead src files other than OAuthConsent (FE-20 / DEP-05).
- **False positive, keep**: `autoprefixer` and `postcss` (depcheck only). They are used via string keys in postcss.config.js:2-5, and postcss is also a regular dependency of tailwindcss 3 and vite 8 (DEP-07). `baseline-browser-mapping` is a data-freshness pin (DEP-06).
- **Expected noise**: the 28 Deno specifiers (`npm:@base44/sdk@0.8.48`, `base44:runtime`), resolved by the Base44 runtime, not npm.
- **Keep despite knip**: `OAuthConsent.jsx` (FE-11, the Builder re-adds it).
- **Exports**: the 109 unused exports are mostly shadcn sub-components (e.g. `DialogPortal`, `SelectGroup`) and constants. Spot check: `COACH_MESSAGE_MAX_LENGTH` (coachDomain.js:11) is used inside its own module at :87, so only the `export` keyword is unnecessary. Info. Every row was re-checked per symbol with `rg` in 02 §4.2 (00 C9).

### 10.2 Root `dependencies` (C §1)

Flags: UNUSED / OUTDATED-MAJOR / OUTDATED-MINOR (minor or patch behind) / DUPLICATED-PURPOSE / UNDERUSED / OK.

| Package | Declared (package.json:line) | Installed | Latest | Used where | Flags | Tag |
|---|---|---|---|---|---|---|
| @base44/sdk | ^0.8.57 (:23) | 0.8.57 | 0.8.57 | src/api/base44Client.js:1, src/lib/AuthContext.jsx:4 (deep import, FE-21); backend pins 0.8.48 (BE-21) | OK (skew vs backend) | **VERIFIED** |
| @base44/vite-plugin | ^1.0.47 (:24) | 1.0.47 | 1.0.50 | vite.config.js:1,15-25 | OUTDATED-MINOR; build tool in `dependencies` (DEP-23) | **VERIFIED** |
| @hookform/resolvers | ^4.1.2 (:25) | 4.1.3 | 6.0.2 | 0 imports; pulls react-hook-form 7.88.0 as an auto-installed peer | **UNUSED**, OUTDATED-MAJOR; re-added by Builder (DEP-V1) | **VERIFIED** |
| @radix-ui/react-accordion | ^1.2.20 (:26) | 1.2.20 | 1.3.1 | 0 imports; CSS residue tailwind.config.js:91-102 | **UNUSED**; re-added by Builder (DEP-V1) | **VERIFIED** |
| @radix-ui/react-alert-dialog | ^1.1.23 (:27) | 1.1.23 | 1.2.1 | ui/alert-dialog.jsx:2 → Profile.jsx:23, WorkoutTracker.jsx:25 | OUTDATED-MINOR | **VERIFIED** |
| @radix-ui/react-checkbox | ^1.3.11 (:28) | 1.3.11 | 1.4.1 | ui/checkbox.jsx:2 → 2 importers | OUTDATED-MINOR | **VERIFIED** |
| @radix-ui/react-collapsible | ^1.1.3 (:29) | 1.1.20 | 1.2.1 | ui/collapsible.jsx:3 → 2 importers | OUTDATED-MINOR | **VERIFIED** |
| @radix-ui/react-dialog | ^1.1.6 (:30) | 1.1.23 | 1.3.1 | ui/dialog.jsx:4 (5 importers), ui/sheet.jsx:3 (9 importers) | OUTDATED-MINOR, DUPLICATED-PURPOSE (sheet vs vaul, DEP-09) | **VERIFIED** |
| @radix-ui/react-label | ^2.1.15 (:31) | 2.1.15 | 2.1.17 | ui/label.jsx:2 → 29 importers | OUTDATED-MINOR (PR #192) | **VERIFIED** |
| @radix-ui/react-select | ^2.1.6 (:32) | 2.2.6 | 2.4.1 | ui/select.jsx:4 → 6 importers incl. ui/adaptive-select.jsx:19 | OUTDATED-MINOR; root of the Radix duplicates (DEP-11); stale PR #159 | **VERIFIED** |
| @radix-ui/react-slot | ^1.1.2 (:33) | 1.3.3 | 1.5.0 | ui/button.jsx:2 (button in 54 files) | OUTDATED-MINOR | **VERIFIED** |
| @radix-ui/react-switch | ^1.3.7 (:34) | 1.3.7 | 1.4.1 | ui/switch.jsx:2 → 2 importers | OUTDATED-MINOR | **VERIFIED** |
| @tanstack/react-query | ^5.102.8 (:35) | 5.102.8 | 5.105.0 | App.jsx:3, query-client.js:1, PageNotFound.jsx:3 (1 `useQuery`) | OUTDATED-MINOR, **UNDERUSED** (FE-09 / DEP-10) | **VERIFIED** |
| @zxing/browser | ^0.1.5 (:36) | 0.1.5 | 0.2.1 | BarcodeScanner.jsx:3; tests/contract/barcode-decoder.test.js:5 | OUTDATED-MAJOR (0.x minor) | **VERIFIED** |
| @zxing/library | ^0.21.3 (:37) | 0.21.3 | 0.21.3 | BarcodeScanner.jsx:4; contract test :4; required peer of @zxing/browser | OK (not a duplicate, DEP-13) | **VERIFIED** |
| class-variance-authority | ^0.7.1 (:38) | 0.7.1 | 0.7.1 | 5 ui wrappers | OK | **VERIFIED** |
| clsx | ^2.1.1 (:39) | 2.1.1 | 2.1.1 | src/lib/utils.js:1 | OK | **VERIFIED** |
| cmdk | ^1.0.0 (:40) | 1.1.1 | 1.1.1 | 0 imports; residue eslint.config.js:55 (`cmdk-input-wrapper`) | **UNUSED** | **VERIFIED** |
| date-fns | ^3.6.0 (:41) | 3.6.0 | 4.4.0 | 4 progress components; only `format`, `parseISO` | OUTDATED-MAJOR, DUPLICATED-PURPOSE (vs 12 `Intl` calls) | **VERIFIED** |
| framer-motion | ^11.16.4 (:42) | 11.18.2 | 14.7.1 | AppLayout.jsx:3, ConfidenceRing.jsx:1, BarcodeScanner.jsx:5; tests/security/reduced-motion.test.js:12 | OUTDATED-MAJOR, DUPLICATED-PURPOSE (vs tailwindcss-animate, DEP-08) | **VERIFIED** |
| input-otp | ^1.5.0 (:43) | 1.5.0 | 1.5.0 | ui/input-otp.jsx:2 → Register.jsx:8 | OK | **VERIFIED** |
| lucide-react | ^0.475.0 (:44) | 0.475.0 | 1.63.0 | 98 files, 104 icons | OUTDATED-MAJOR (PR #148 → 0.577.0, open 43 d) | **VERIFIED** |
| react | ^18.2.0 (:45) | 18.3.1 | 19.3.1 | 116 files | OUTDATED-MAJOR | **VERIFIED** |
| react-dom | ^18.2.0 (:46) | 18.3.1 | 19.3.1 | main.jsx:2 (`react-dom/client`); createPortal in 3 files | OUTDATED-MAJOR | **VERIFIED** |
| react-router-dom | 7.18.3 exact (:47) | 7.18.3 | 7.18.5 | 60 files | OUTDATED-MINOR (PR #192); exact pin from owner commit 6530f55 | **VERIFIED** |
| recharts | ^2.15.4 (:48) | 2.15.4 | 3.10.1 | 3 chart components | OUTDATED-MAJOR (DEP-12) | **VERIFIED** |
| tailwind-merge | ^3.6.0 (:49) | 3.6.0 | 3.7.0 | src/lib/utils.js:2 | OUTDATED-MINOR (PR #160) | **VERIFIED** |
| tailwindcss-animate | ^1.0.7 (:50) | 1.0.7 | 1.0.7 | tailwind.config.js:106; classes in 5 ui wrappers | OK; DUPLICATED-PURPOSE (vs framer-motion); build-only in `dependencies` (DEP-23) | **VERIFIED** |
| vaul | ^1.1.2 (:51) | 1.1.2 | 1.1.2 | ui/drawer.jsx:4 → Progress.jsx:36, ui/adaptive-select.jsx:12 (+ dead RatingDrawer.jsx:9) | DUPLICATED-PURPOSE (DEP-09) | **VERIFIED** |

### 10.3 Root `devDependencies`

| Package | Declared | Installed | Latest | Used where | Flags | Tag |
|---|---|---|---|---|---|---|
| @eslint/js | ^9.39.5 (:54) | 9.39.5 | 10.0.1 | eslint.config.js:2 | OUTDATED-MAJOR | **VERIFIED** |
| @playwright/test | ^1.63.0 (:55) | 1.63.0 | 1.64.1 | 36 files | OUTDATED-MINOR | **VERIFIED** |
| @types/node | ^22.20.2 (:56) | 22.20.2 | 26.6.6 | 0 in root typecheck (jsconfig types `vite/client`); optional peer of vite | editor/peer only (PR #195); keep on 22 to match CI Node 22 | **SUSPECTED** (editor use) |
| @types/react | ^18.2.66 (:57) | 18.3.28 | 19.3.0 | loaded by typecheck | OUTDATED-MAJOR | **VERIFIED** |
| @types/react-dom | ^18.2.22 (:58) | 18.3.7 | 19.3.0 | loaded by typecheck | OUTDATED-MAJOR | **VERIFIED** |
| @vitejs/plugin-react | ^6.1.2 (:59) | 6.1.2 | 6.1.2 | vite.config.js:2,26 | OK (major-bumped by Builder in 3ddb424) | **VERIFIED** |
| autoprefixer | ^10.5.6 (:60) | 10.5.6 | 10.6.2 | postcss.config.js:4 | OUTDATED-MINOR; depcheck false positive | **VERIFIED** |
| baseline-browser-mapping | ^2.11.22 (:61) | 2.11.22 | 2.11.34 | 0 imports; transitive via autoprefixer → browserslist | data-freshness pin (DEP-06) | **VERIFIED** (intent **SUSPECTED**) |
| eslint | ^9.39.5 (:62) | 9.39.5 | 10.13.0 | package.json:9-10 | OUTDATED-MAJOR | **VERIFIED** |
| eslint-plugin-react | ^7.37.4 (:63) | 7.37.5 | 7.37.5 | eslint.config.js:3 | OK | **VERIFIED** |
| eslint-plugin-react-hooks | ^5.0.0 (:64) | 5.2.0 | 7.1.1 | eslint.config.js:4 | OUTDATED-MAJOR | **VERIFIED** |
| eslint-plugin-unused-imports | ^4.3.0 (:65) | 4.4.1 | 4.4.1 | eslint.config.js:5 | OK | **VERIFIED** |
| globals | ^15.14.0 (:66) | 15.15.0 | 17.13.0 | eslint.config.js:1 | OUTDATED-MAJOR | **VERIFIED** |
| postcss | ^8.5.25 (:67) | 8.5.31 | 8.5.32 | postcss.config.js; regular dep of tailwindcss 3 and vite 8 | OUTDATED-MINOR; depcheck false positive | **VERIFIED** |
| tailwindcss | ^3.4.17 (:68) | 3.4.19 | 4.3.3 | tailwind.config.js, postcss.config.js:3, src/index.css:1-3 | OUTDATED-MAJOR (PR #177 breaks build, DEP-04) | **VERIFIED** |
| typescript | ^5.8.2 (:69) | 5.9.3 | 7.0.2 | package.json:19 | OUTDATED-MAJOR (DEP-18) | **VERIFIED** |
| vite | ^8.3.5 (:70) | 8.3.5 | 8.3.5 | vite.config.js:3 | OK (needs Node ^20.19 / ≥22.12, DEP-21) | **VERIFIED** |

Unlisted / transitive-only: `esbuild` (tests/e2e/meal-speech-input.spec.js:2; **not installed**, DEP-01); `react-hook-form` 7.88.0 (auto-installed peer of @hookform/resolvers; goes with DEP-05); `npm:@base44/sdk@0.8.48` and `base44:runtime` (Deno specifiers, resolved by the platform, **SUSPECTED** exact resolution). **VERIFIED**

### 10.4 expo-ios (`expo-ios/package.json`; locked = expo-ios/package-lock.json)

| Package | Declared (line) | Locked | Expo 57.0.30 pin | Latest | Used where | Flags | Tag |
|---|---|---|---|---|---|---|---|
| expo | ~57.0.30 (:14) | 57.0.30 | — | 58.0.21 (sdk-57: 57.0.31) | index.ts:1, src/nativeSpeech.ts:2; tsconfig `expo/tsconfig.base` | OUTDATED-MINOR (PR #196, fails CI, DEP-24); SDK major behind | **VERIFIED** |
| expo-dev-client | ~57.0.20 (:15) | 57.0.20 | ~57.0.20 | 58.0.17 | `expo start --dev-client` (:7) + autolinking | OK (Dependabot-ignored) | **VERIFIED** |
| expo-speech-recognition | 57.1.1 exact (:16) | 57.1.1 | not pinned | 58.0.0 | src/nativeSpeech.ts:3 (type) + app.json:24-27 plugin | OK for SDK 57 | **VERIFIED** |
| expo-status-bar | ~57.0.1 (:17) | 57.0.1 | ~57.0.1 | 58.0.4 | App.tsx:1 | OK (Dependabot-ignored) | **VERIFIED** |
| expo-web-browser | ~57.0.3 (:18) | 57.0.3 | ~57.0.3 | 58.0.7 | src/RecompOneWebView.tsx:17 | OK; not in the Dependabot ignore list (DEP-17) | **VERIFIED** |
| react | 19.2.3 exact (:19) | 19.2.3 | 19.2.3 | 19.3.1 | App.tsx, RecompOneWebView.tsx:1 | OK (SDK-pinned; ≠ web React 18, DEP-19) | **VERIFIED** |
| react-native | 0.86.3 exact (:20) | 0.86.3 | 0.86.3 | 0.88.1 | App.tsx:2, RecompOneWebView.tsx:2, nativeSpeech.ts:1 | OK (SDK-pinned) | **VERIFIED** |
| react-native-iap | ^16.5.1 (:21) | 16.5.1 | not pinned | 17.2.2 | RecompOneWebView.tsx:3-15 | OUTDATED-MAJOR (payment surface) | **VERIFIED** |
| react-native-nitro-modules | ^0.36.5 (:22) | 0.36.5 | not pinned | 0.37.1 | 0 imports; required peer of react-native-iap | OK (peer) | **VERIFIED** |
| react-native-webview | 13.16.1 exact (:23) | 13.16.1 | 13.16.1 | 14.0.1 | RecompOneWebView.tsx:16 | OK (SDK-pinned) | **VERIFIED** |
| @types/node | ^22.20.2 (:26) | 22.20.2 | 26.6.6 | tsconfig.json:7 | OUTDATED-MINOR (PR #170) | **VERIFIED** |
| @types/react | ~19.2.2 (:27) | 19.2.18 | 19.3.0 | tsconfig.json:7 | OK | **VERIFIED** |
| expo-doctor | ^1.20.4 (:28) | 1.20.4 | 1.21.5 | `"doctor": "npx expo-doctor"` (:11) | OUTDATED-MINOR; non-hermetic in CI (BE-05 / DEP-02) | **VERIFIED** |
| typescript | ~6.0.3 (:29) | 6.0.3 | 7.0.2 | `tsc --noEmit` (:9) | OK (≠ root 5.9.3, DEP-18) | **VERIFIED** |
| xcode (unlisted) | — | 3.0.1 via @expo/config-plugins@57.0.10; `overrides` :31-35 pins its uuid to 11.1.1 | — | — | tests/dependencySecurity.test.ts:6-7 | **UNLISTED**; breaks #196 (DEP-24) | **VERIFIED** |

No expo-ios package is unused. **VERIFIED** (C §2)

### 10.5 Lockfile duplication
Root: 523 packages, 23 names with more than one installed version, 17 of them `@radix-ui/*` (the others: eslint-visitor-keys, globals, glob-parent, picomatch, resolve, react-is). One copy each of react@18.3.1, react-dom@18.3.1, tslib@2.8.1. expo-ios: 493 packages, 32 names with more than one version (none of react, react-native, @types/react, typescript). **VERIFIED** (node script over package-lock.json, `npm ls`)

### 10.6 Duplicated-purpose summary

| Pair | Verdict | Ref | Tag |
|---|---|---|---|
| @zxing/browser + @zxing/library | Not a duplicate (required peer) | DEP-13 | **VERIFIED** |
| framer-motion + tailwindcss-animate | Duplicate animation stacks; framer-motion removable (3 sites) | DEP-08 | **VERIFIED** |
| vaul + @radix-ui/react-dialog (Sheet) | Duplicate bottom-sheet implementations | DEP-09 | **VERIFIED** |
| Toast | Single hand-rolled implementation (ui/use-toast.jsx:1, toast.jsx:6-12) | DEP-22 | **VERIFIED** |
| cva / clsx / tailwind-merge | Expected shadcn trio | src/lib/utils.js:1-2 | **VERIFIED** |
| date-fns vs Intl | date-fns for 2 functions in 4 files (21.5 kB min); Intl elsewhere | DEP-14 | **VERIFIED** |
| @radix-ui/* internals | 17 packages in 2 versions + per-parent nesting; 38-47 kB min duplicated | DEP-11 | **VERIFIED** |

### 10.7 Open Dependabot PRs (tooling/pr-branch-map.tsv; C via `gh api` check-runs)

| PR | Change | Age | `verify` (failing step) | Verdict | Tag |
|---|---|---|---|---|---|
| #196 | expo ~57.0.30 → ~57.0.31; lock moves xcode 3.0.1 → 4.0.0 | 2 d | failure (step 9, dependencySecurity.test.ts) | Needs the DEP-24 fix | **VERIFIED** |
| #195 | @types/node → 22.20.5, baseline-browser-mapping → 2.11.31 | 2 d | failure (doctor) | Safe | **VERIFIED** |
| #192 | @radix-ui/react-label → 2.1.17, react-router-dom → 7.18.4 | 2 d | failure (doctor) | Safe | **VERIFIED** |
| #177 | tailwindcss 3.4.19 → 4.3.3 | created 2026-10-06 | failure (doctor; build skipped) | Breaks build (DEP-04); close | **VERIFIED** |
| #170 | @types/node → 22.20.5 (expo-ios) | 23 d | failure (doctor) | Safe | **VERIFIED** |
| #160 | tailwind-merge 3.6.0 → 3.7.0 | 37 d | failure (doctor) | Safe | **VERIFIED** |
| #159 | @radix-ui/react-select → 2.3.7 | 37 d | failure (doctor) | Superseded by an all-Radix bump (DEP-11) | **VERIFIED** |
| #148 | lucide-react 0.475.0 → 0.577.0 | 43 d | success (2026-09-15; 44 commits behind) | Rebase and re-run | **VERIFIED** |
| #167 / #168 | codeql-action analyze/init 4.38.2 | 27 d | not checked | Merge together (docs/codex-handoff.md:91, **SUSPECTED**) | **VERIFIED** (exist) |

### FE-20 / DEP-05 Dead code: 9 unused files and 3 unused prod deps; tests pin the dead files while the live onboarding step has no source-level test
- Tag: **VERIFIED**
- Severity: Low
- Evidence: tooling/knip-configured.txt lists 9 files. The A verifier re-ran `grep -rnw` for each name across src/tests/scripts/docs/.github/index.html/public/expo-ios/src: there are no imports and no lazy imports, only tests reading source text and comments. tests/security/local-plan-cache.test.js:114-115 checks error rings in the dead `StepAbout.jsx`, and release-configuration.test.js:204,212 reads StepAbout/SignalStat. The live `src/components/onboarding/StepAboutActivity.jsx` (Onboarding.jsx:18,384) has 0 references in tests/. Deps: package.json:25 `@hookform/resolvers`, :26 `@radix-ui/react-accordion`, :40 `cmdk`. `rg -i 'cmdk|hookform|react-hook-form|accordion'` over src, tests, scripts, base44, index.html, public, .github and docs hits only package.json, eslint.config.js:55 and tailwind.config.js:91-102. knip and depcheck agree. All 3 came from the template (8bfec9a); PR #136 removed two of them, and the Builder re-added them (DEP-V1). `featureFlags.itemizedFoodDiary` is hard-coded `true` (featureFlags.js:27) and still gates 10 branches (e.g. RecompContext.jsx:353; Nutrition.jsx:130).
- Impact: 0 bytes shipped by the deps. The cost is install size, supply-chain surface and Dependabot noise. Deleting the dead files would break green tests, while the regression those tests target goes unguarded on the shipped step.
- Fix: Repoint those tests at StepAboutActivity.jsx; delete the 8 dead files (keep OAuthConsent, FE-11); `npm rm @hookform/resolvers @radix-ui/react-accordion cmdk`; delete tailwind.config.js:90-103 and eslint.config.js:55 residue; inline the `itemizedFoodDiary` flag. Effort: <1h

### DEP-04 PR #177 (Tailwind 4) fails the production build as-is
- Tag: **VERIFIED** (build reproduced)
- Severity: Medium
- Evidence: `git archive` of the PR branch into the scratchpad, `npm ci --ignore-scripts` (exit 0), `vite build` (exit 1): `[postcss] It looks like you're trying to use \`tailwindcss\` directly as a PostCSS plugin`. Cause: postcss.config.js:3 `tailwindcss: {},`. Other v3-only constructs: src/index.css:1-3 `@tailwind` directives, tailwind.config.js:2 `module.exports`, :106 `require("tailwindcss-animate")`, 2 `@apply` (src/index.css:136,141), and 3,362 `className=` occurrences in src. The PR touches only package.json and the lockfile. On GitHub, its `verify` fails at doctor, so the build step never ran.
- Impact: Merging #177 breaks CSS compilation, and CI will not show it until BE-05 is fixed.
- Fix: Close #177; do Tailwind 4 as a dedicated migration (`@tailwindcss/upgrade`, `@tailwindcss/postcss`, an animate replacement, visual checks). Effort: >1d (~2-3 days)

### DEP-08 framer-motion (≈105 kB min, 36 kB gz chunk) loads with the authenticated app shell for 3 small animations; docs claim 1 usage
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: Call sites: src/components/AppLayout.jsx:3,65-79 (route fade/slide, `duration: 0.2`), src/components/common/ConfidenceRing.jsx:1,27-39 (`motion.circle` strokeDashoffset), src/components/nutrition/BarcodeScanner.jsx:5,278-283 (scan line, `repeat: Infinity`). framer-motion is in `proxy-BOIUEqTK.js`, 109.50 kB / 36.15 kB gz (tooling/build.txt), and `AppLayout-*.js` imports it. AppLayout is lazy (App.jsx:22) and wraps every post-onboarding route. tailwindcss-animate already supplies enter/exit keyframes. docs/improvement-plan.md:236 says "the only framer-motion import" and docs/codex-handoff.md:130 plans to remove "the one `AnimatePresence`", but the other two sites predate both docs' last edits. tests/security/reduced-motion.test.js:12 asserts the `MotionConfig` import.
- Impact: ~36 kB gz extra on the first authenticated navigation for effects CSS can do. The documented removal plan misses 2 sites and 1 test.
- Fix: CSS transitions/keyframes for the 3 sites, then `npm rm framer-motion` and update the test. Effort: <1d

### DEP-14 Majors behind (root), and Dependabot version updates never propose them
- Tag: **VERIFIED** (versions, usage); risk notes **SUSPECTED** where marked
- Severity: Medium (aggregate)
- Evidence: tooling/npm-outdated.txt; dependabot.yml:21-25 ignores all semver-major version updates. React 18.3.1 → 19.3.1 (116 files; `rg 'ReactDOM\.render|findDOMNode|\.defaultProps\s*=|…'` → 0; main.jsx:2 already uses `react-dom/client`; @base44/sdk and the vite plugin declare no React peer, their React 19 behaviour **SUSPECTED**). Tailwind 3 → 4 (DEP-04). recharts 2 → 3 (3 files). framer-motion 11 → 14 (removal is cheaper, DEP-08). date-fns 3 → 4 (4 files). lucide-react 0.475 → 1.63 (98 files, renamed-icon risk **SUSPECTED**). eslint 9 → 10, react-hooks 5 → 7 (new React Compiler rules, **SUSPECTED**). typescript 5.9 → 7 (`baseUrl` deprecation, DEP-18). @zxing/browser 0.1 → 0.2 (guarded by a contract test). @hookform/resolvers 4 → 6 (delete instead).
- Impact: React, Tailwind and ESLint are each a major behind with no automated reminder, and the migrations grow with drift.
- Fix: A quarterly major-review issue. Order: delete unused deps → Radix/minors → date-fns/recharts → React 19 → Tailwind 4 → ESLint 10. Effort: >1d (~5-8 days total)

### DEP-09 Two bottom-sheet systems: vaul Drawer and Radix-Dialog Sheet
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/components/ui/drawer.jsx:4 (vaul) is used by ui/adaptive-select.jsx:5-12 (10 importers) and Progress.jsx:36. src/components/ui/sheet.jsx:3 (`@radix-ui/react-dialog`) is imported by 9 files, all with `side="bottom"` (e.g. SessionEditSheet.jsx:188). vaul adds 26.2 kB min.
- Impact: Inconsistent mobile sheet behaviour (only vaul drags to dismiss), two components for one pattern, and +26 kB.
- Fix: Standardise on one. Effort: <1d

### DEP-11 Radix version skew and nesting bundle ~38-47 kB of duplicate Radix internals
- Tag: **VERIFIED** (bytes approximate)
- Severity: Low
- Evidence: `npm ls @radix-ui/react-primitive --all`: react-select@2.2.6 uses the hoisted old internals (react-primitive 2.1.3, dismissable-layer 1.1.11, focus-scope 1.1.7), while alert-dialog, checkbox, collapsible, dialog, label and switch nest newer copies (react-primitive 2.1.10, dismissable-layer 1.1.19, focus-scope 1.1.16). Sourcemaps show 6 `react-context` copies and 3 `react-presence` 1.1.10 copies. Nested Radix code totals 47.3 kB min, 38.1 kB of it also bundled from the top level. SessionEditSheet.jsx:12 opens a Select inside a Sheet, so both layer stacks run together.
- Impact: ~38-47 kB min duplicated, and two focus-trap/dismiss stacks active at once (behavioural edge cases **SUSPECTED**).
- Fix: Bump all `@radix-ui/*` to current minors in one PR, `npm dedupe`, close #159. Effort: <1h + UI smoke test

### DEP-12 recharts 2 and its dependency tree are ~80% of the 454 kB Progress chunk
- Tag: **VERIFIED** (sizes); **SUSPECTED** (upgrade savings)
- Severity: Low
- Evidence: Progress-C504AZrH.js is 453.71 kB / 122.35 kB gz. Attribution: recharts 229.2 kB (52%); with lodash, react-smooth, fast-equals, recharts-scale, decimal.js-light and d3-* (≈60 kB) it is ≈360 kB (≈81%). Usage: 2 `<LineChart`, 1 `<BarChart` (src/components/progress/*Chart.jsx:2). Lazy route.
- Impact: ~120 kB gz to open Progress on mobile for three simple charts.
- Fix: Evaluate Recharts 3 (3 files) or hand-rolled SVG. Effort: <1d / >1d

### DEP-13 @zxing: both packages are needed (library is browser's peer); the library is 399 kB min
- Tag: **VERIFIED**
- Severity: Info
- Evidence: @zxing/browser `peerDependencies {"@zxing/library":"^0.21.0"}`; both are imported at BarcodeScanner.jsx:3-4. The BarcodeScanner chunk is 446.38 kB / 118.86 kB gz (library 398.9 kB, browser 25.5 kB), lazy at Nutrition.jsx:31. The comment at :28 says "~110KB", which matches only the gz size.
- Impact: Not a duplication problem; a 119 kB gz lazy chunk.
- Fix: Optional: native `BarcodeDetector` with a zxing fallback. Effort: <1d

### DEP-15 expo-ios `npm audit`: 4 high / 5 low, all through Expo CLI/config tooling; node-forge fixable now without --force
- Tag: **VERIFIED** (paths, patched versions); **SUSPECTED** ("not in the shipped JS bundle")
- Severity: Low
- Evidence: tooling/expo-npm-audit.txt: node-forge ≤1.4.0 (high, GHSA-86w9-cpqp-85rv; locked at expo-ios/package-lock.json:4664-4665 `"version": "1.4.0"`), zod <4.6.6 (high, GHSA-mrhx-c7xc-m3w5, via @expo/cli 57.0.31), deepmerge (GHSA-gcqx-w48m-w2h4, via @expo/config 57.0.10). node-forge 1.4.0 comes via @expo/code-signing-certificates and @expo/cli (`^1.3.3`), and `npm view node-forge versions` shows 1.4.1/1.4.2 published. zod 3.25.76 is the newest 3.x. PR #196 does not change these. npm's `--force` "fix" installs expo@51.0.39, a downgrade.
- Impact: Build-machine exposure only, as far as the lockfile graph shows; no Metro bundle was produced to confirm.
- Fix: `npm audit fix` (no --force) in expo-ios now; zod/deepmerge wait for Expo. Effort: <1h

### DEP-16 Expo SDK one major behind, native libs a major behind; Dependabot is patch-only there
- Tag: **VERIFIED**
- Severity: Low
- Evidence: expo 57.0.30 vs 58.0.21; react-native 0.86.3 vs 0.88.1; react-native-iap 16.5.1 vs 17.2.2; nitro 0.36.5 vs 0.37.1; webview 13.16.1 vs 14.0.1; expo-speech-recognition 57.1.1 vs 58.0.0. dependabot.yml:44-55 ignores minor and major for `/expo-ios`, and :66-70 ignores 5 packages outright. iap 16.5.1 peer-requires nitro `^0.36.5`.
- Impact: The StoreKit shell drifts off a supported SDK with no prompt; iap 17 is a payment-surface major that needs a signed-device test (expo-ios/README.md:27-28).
- Fix: Schedule the SDK 58 upgrade (`npx expo install --fix`, iap 17 + nitro together, EAS device build). Effort: >1d (~2-3 days)

### DEP-17 The expo-ios Dependabot ignore list does not match Expo's own pins
- Tag: **VERIFIED**
- Severity: Info
- Evidence: expo@57.0.30's bundledNativeModules.json pins expo-dev-client, expo-status-bar, expo-web-browser, react, react-native and react-native-webview. dependabot.yml:66-70 ignores 5 of them but not `expo-web-browser`.
- Impact: Minor; an expo-web-browser patch PR could appear.
- Fix: Derive the list from bundledNativeModules.json. Effort: <1h

### DEP-18 TypeScript split (root 5.9.3 vs expo-ios 6.0.3); root jsconfig uses a TS-6-deprecated option
- Tag: **VERIFIED**
- Severity: Info
- Evidence: package.json:69 `^5.8.2` → 5.9.3; expo-ios/package.json:29 `~6.0.3`. Root tests import expo-ios TS files under Node type stripping, not tsc (e.g. tests/security/premium-plans.test.js:4). typescript@6.0.3 lib/typescript.js:130044,130077-130079 deprecates `baseUrl`, and jsconfig.json:3 has `"baseUrl": "."`. CI's `Typecheck iOS shell` passes on TS 6.
- Impact: None today; a root TS 6/7 bump fails on `baseUrl`.
- Fix: Drop `baseUrl` from jsconfig.json and keep `paths`. Effort: <1h

### DEP-19 React 18 (web) vs React 19.2 (shell): no runtime code is shared today
- Tag: **VERIFIED** (current sharing); **SUSPECTED** (implications for a native-UI option)
- Severity: Info
- Evidence: Separate node_modules trees, one React each. `rg "expo-ios" src base44` (excluding .md) → 0. The web↔shell contract is an injected script string (expo-ios/src/injectedBridge.ts:1-26) read through `window` (src/lib/nativeIapBridge.js:1-9). Reusable with either React today: base44/shared (34 files, 0 package imports) and the React-free parts of src/lib.
- Impact: If a native RN UI is ever chosen, the web UI stack (Radix, vaul, recharts, framer-motion DOM, lucide-react, Tailwind, react-router-dom) is not RN-compatible regardless of React version; the domain code is reusable as-is.
- Fix: Only if that option is chosen: React 19 on the web first, then extract base44/shared + pure src/lib into a workspace package. Effort: >1d (~2 days for React 19)

### DEP-06 `baseline-browser-mapping` devDep is a data-freshness pin, not dead code
- Tag: **VERIFIED** (dependency chain, warning text); **SUSPECTED** (intent)
- Severity: Info
- Evidence: package.json:61, 0 imports. `npm ls` → autoprefixer → browserslist@4.28.9 → baseline-browser-mapping (deduped). Its dist/index.cjs warns "The data in this module is over two months old". PR #136 kept it deliberately.
- Impact: The knip/depcheck "unused" is technically right, but removing it gains nothing and can bring the stale-data warning back.
- Fix: Keep it, and add it to knip/depcheck ignores with a comment. Effort: <1h

### DEP-07 autoprefixer / postcss "unused" are depcheck false positives
- Tag: **VERIFIED**
- Severity: Info
- Evidence: postcss.config.js:2-5 `plugins: { tailwindcss: {}, autoprefixer: {} }` (string keys). postcss is a regular dependency of tailwindcss@3.4.19 and vite@8.3.5. knip (with postcss.config.js as an entry) does not flag them.
- Impact: None.
- Fix: Add both to depcheck ignores. Effort: <1h

### DEP-21 No Node engine pin; Vite 8 needs Node ^20.19 / ≥22.12
- Tag: **VERIFIED** (repo); **SUSPECTED** (Builder's Node version)
- Severity: Info
- Evidence: There is no `engines` field in either package.json and no .nvmrc/.node-version/.tool-versions. vite and rolldown declare `^20.19.0 || >=22.12.0`. CI uses Node 22 (ci.yml:31).
- Impact: Older-Node Builder or contributor environments fail at build with no clear message.
- Fix: `"engines": { "node": ">=22.12" }` + `.nvmrc`. Effort: <1h

### DEP-22 One hand-rolled toast system; the docs describe a Radix toast that does not exist
- Tag: **VERIFIED**
- Severity: Info
- Evidence: src/components/ui/use-toast.jsx:1 `// Inspired by react-hot-toast library`; toast.jsx:6-12 renders a plain `<div>`. There are 0 imports of sonner, react-hot-toast or @radix-ui/react-toast (removed by PR #136). tailwind-merge is 26.2 kB min in the preloaded `utils` chunk.
- Impact: None in code. docs/improvement-plan.md:47,240 say "Keep the Radix toast stack".
- Fix: Correct the doc. Effort: <1h

### DEP-23 Build-only packages declared as runtime `dependencies`
- Tag: **VERIFIED** (declaration); **SUSPECTED** (platform effect)
- Severity: Info
- Evidence: package.json:24 `@base44/vite-plugin` and :50 `tailwindcss-animate` are in `dependencies`, while `vite` (:70) and `tailwindcss` (:68) are devDependencies. tooling/npm-audit.json reports `"prod": 294, "dev": 227`.
- Impact: Cosmetic for a static SPA; it inflates "prod" counts and any `--omit=dev` install the platform might do.
- Fix: Move both to devDependencies once it is confirmed the Base44 build installs devDependencies. Effort: <1h

---

## 11. Could not assess

- **Base44 runtime semantics**: how RLS is enforced, whether `Deno.env` mirrors `base44:runtime` secrets (BE-20), the isolate count (BE-18), function wall-clock timeouts (BE-15, LLM calls), whether a private-file delete API exists (BE-19), and whether the runtime resolves `npm:@base44/sdk@0.8.48` exactly as written (BE-V1). None of this is visible in the repo.
- **Production state**: whether `APPLE_SANDBOX_ALLOWED_USER_IDS`, `PREMIUM_TESTER_EMAILS` and `ENABLE_BODY_COMPOSITION_SCAN` are set; which function versions are live and whether the broken `count()` build was ever published (BE-08, BE-V1); whether the App Store Connect V2 webhook is configured; whether TestFlight is public (BE-07); whether signup is open (BE-02 relies on a code comment); whether anyone grants referral rewards by hand (BE-01); whether the Base44 server retains SDK analytics events (W-01).
- **GitHub**: only the branch's `required_status_checks` were read (DEP-03); review requirements and bypass lists were not. Job logs could not be downloaded (proxy 403), so why doctor failed on PRs #159/#160/#170 in September/early October is unknown. Of main runs #531-#547, B checked the failing step on 5 runs and C on all; only step conclusions were readable. The CodeQL PRs #167/#168 checks were not queried. Why Dependabot opened the major #177 despite the ignore rule is unknown (alerts API 403).
- **Device / runtime behaviour**: whether the Base44 Android wrapper calls `window.handleAndroidBack` and honours `false` (FE-13, FE-14); how iOS handles the `recompone://` hand-off; re-render cost of FE-01/FE-15 (the app was not run or profiled: no `VITE_BASE44_APP_ID`, no backend access); Playwright e2e could not run (DEP-01), so routing was verified statically only.
- **Execution**: Deno was not run and no function was called. expo-ios/node_modules is not installed, and no Metro/EAS bundle was produced (DEP-15 "build-time only" rests on the lockfile graph). Whether `EXPO_OFFLINE=1` makes doctor's other network checks pass (DEP-02), and whether #196 passes doctor once DEP-24 is fixed, are untested (no Expo API access).
- **SDK internals** beyond the files read: token storage on logout, socket.io lifecycle, axios 401 interceptors; whether `upsertTrackingRecord` returns a complete record (FE-18); whether deterministic meal-plan regeneration is identical (FE-08); whether Rolldown's preload helper wraps the inner `lazy()` imports (FE-23).
- **External limits**: Open Food Facts' actual rate limits on Base44 egress (BE-09); the LLM provider and cost behind `InvokeLLM` default/"automatic".
- **Upstream changelogs**: Tailwind 4, Recharts 3, lucide 1.x, eslint-plugin-react-hooks 7 and react-native-iap 17 breaking changes were not checked (DEP-14/DEP-16 risk notes stay **SUSPECTED**); nor the React 19 compatibility of @base44/sdk and @base44/vite-plugin.
- **Platform install behaviour**: whether Base44 honours `installCommand`, installs devDependencies or the lockfile, and which Node version it uses (BE-12, DEP-21, DEP-23); whether any Base44-hosted preview serves `npm run dev` (base44/config.jsonc:6), which would inject dev-only plugin scripts.
- **Future Builder behaviour**: whether it will re-add OAuthConsent.jsx (FE-11) or removed dependencies (DEP-V1) again; inferred from 2 and 1 past occurrences.
- **knip unused exports**: this document spot-checked one entry (§10.1); the per-symbol check of all 109 (+92 test-only) is in 02 §4.2.
