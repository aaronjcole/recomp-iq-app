# 02 — Dead Code and Stale Branches

Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

Nothing was deleted, moved, checked out or pushed. Every command in this document is text for a human to run.

---

## 1. Summary

What is wrong, ranked:

1. **Main is ungated (GIT-03, High).** Since the last merged PR (#187, 2026-10-07), 20 commits have landed on main without a PR: +13,594/−2,192 lines across 136 files. Aaron Cole made 11 of them and base44-builder[bot] made 9. The `base44-builder` branch, which three workflows use to gate Builder pushes, has never received a Builder push (GIT-04).
2. **No Dependabot PR can go green (GIT-05, Medium).** 9 of the 10 open PR branches fail `verify`. The 10th, #148, last passed on 2026-09-15 and is now 44 commits behind. #196 was supposed to fix main's CI, but it fails a different test.
   - #167 and #168 each bump only one half of the CodeQL action pair (GIT-06).
   - #177 is a Tailwind 3→4 major bump that the Dependabot major-ignore policy should have blocked (GIT-07).
3. **87% of the branch list is dead (GIT-01).** 79 of 91 remote branches are MERGED-DELETE-SAFE. For 78 of them the tip tree is byte-identical to the squash commit on main; the 79th differs only in files the branch never touched. 51 of the 79 are more than 60 days old.
   - Only one branch, `claude/amazing-cori-t2evjc`, holds unmerged content: 13 doc lines in fdb5865 that record Google Play launch blockers (GIT-02). Land that commit before deleting the branch.
4. **The biggest dead-code item is really a rendering bug (DEAD-01, Medium).** 242 opacity-modifier class usages in 73 files produce no CSS, for example `bg-teal/10` (48 uses). The cause is that every theme colour is a bare `var()`. As a result the bottom tab bar and 4 sticky headers have no background colour, and 3 button variants have no hover state.
5. **1,147 lines sit in unreachable or prod-unused files.**
   - knip lists 9 unused files (823 lines). The `export *` barrel at `src/lib/fitness/index.js` hides 3 more modules (324 lines).
   - 781 of these lines can be deleted in under an hour.
   - `OAuthConsent.jsx` (240 lines) must stay, because base44-builder[bot] has re-added it both times it was deleted (DEAD-04).
   - `adaptiveGoalEngine.js` (126 lines) needs a product decision.
6. **Two hard-coded flags leave about 544 lines unreachable.**
   - `LIFESTYLE_COACH_ENABLED = false` accounts for about 494 lines in the page, VoiceInput and the backend function. It also pulls a 404-line domain module into the eager AuthContext chunk (DEAD-06).
   - `itemizedFoodDiary: true` leaves about 50 lines of dead else-branches (DEAD-07).
7. **Some backend surface has no product path.**
   - registerPushToken and verifyGooglePlayPurchase, plus the latter's domain module, total 462 lines with no caller in the repo (DEAD-09).
   - CoachConversation has never been written on any branch (DEAD-10).
   - The `gmail.send` connector has had no consumer since 2026-09-10 (DEAD-12).
8. **The guardrails hide all of this (DEAD-15, DEAD-V1, DEAD-11).**
   - ESLint covers only src/components and src/pages.
   - `--quiet` hides 7 warnings.
   - `react-hooks/exhaustive-deps` is never enabled.
   - No knip config is committed.
   - An undeclared `esbuild` import stops the whole e2e suite from loading.

What is fine:
- 0 commented-out code blocks.
- 0 TODO/FIXME/XXX/HACK markers.
- 0 literal constant conditions.
- Every expo-ios dependency is referenced or required by convention.
- Local branches are clean (GIT-11).

### Findings index

| ID | Severity | Tag | Claim | Section |
|---|---|---|---|---|
| GIT-03 | High | **VERIFIED** (history; branch rule queried) | Main takes direct pushes: 20 commits with no PR since 2026-10-07 | 3 |
| GIT-05 | Medium | **VERIFIED** | Every open Dependabot branch is red or stale; #196 fails on the xcode 4 / uuid override | 3 |
| DEAD-01 | Medium | **VERIFIED** | 242 opacity-modifier usages emit no CSS | 4 |
| GIT-02 | Medium | **VERIFIED** | `claude/amazing-cori-t2evjc` holds the only unmerged commit (fdb5865, Play billing blockers) | 3 |
| GIT-04 | Medium | **VERIFIED** / **SUSPECTED** | `base44-builder` gate branch has never received a Builder push and is 40 commits behind | 3 |
| GIT-07 | Medium | **VERIFIED** | #177 is a Tailwind 3→4 major bump that breaks the build (reproduced as DEP-04 in 01) | 3 |
| DEAD-02 | Low | **VERIFIED** | 8 more no-op classes (overridden orange/red scales, missing `caret-blink` keyframe) | 4 |
| DEAD-03 | Low | **VERIFIED** | 9 unreferenced files (823 lines); 2 test files read dead files | 4 |
| DEAD-04 | Low | **VERIFIED** / **SUSPECTED** | OAuthConsent.jsx is unrouted but re-created by the Builder | 4 |
| DEAD-05 | Low | **VERIFIED** | 3 fitness modules (324 lines) dead or test-only, hidden by `export *` | 4 |
| DEAD-06 | Low | **VERIFIED** | Lifestyle Coach hard-disabled; about 494 unreachable lines; schema ships eagerly | 5 |
| DEAD-07 | Low | **VERIFIED** | `itemizedFoodDiary: true` leaves about 50 dead lines | 5 |
| DEAD-09 | Low | **VERIFIED** / **SUSPECTED** | 2 deployed functions (+1 domain module, 462 lines) have no caller | 4 |
| DEAD-10 | Low | **VERIFIED** / **SUSPECTED** | 4 entities have no live writer | 4 |
| DEAD-11 | Low | **VERIFIED** | 3 unused deps + 1 unused devDep; `esbuild` used but undeclared | 4 |
| DEAD-12 | Low | **VERIFIED** / **SUSPECTED** | Dead config paths, inert legacy-SDK shim, orphaned Gmail send connector | 4 |
| DEAD-14 | Low | **VERIFIED** / **SUSPECTED** | 2.1 MB of non-web PNGs deployed to the web root | 4 |
| DEAD-15 | Medium | **VERIFIED** | Lint and typecheck scopes hide exactly these dead-code classes | 4 |
| DEAD-V1 | Medium | **VERIFIED** | `exhaustive-deps` never enabled; its 2 suppressions are dead | 4 |
| GIT-01 | Low | **VERIFIED** (repo setting **SUSPECTED**) | 79 merged branches never deleted | 3 |
| GIT-06 | Low | **VERIFIED** | #167/#168 split the CodeQL init/analyze pair | 3 |
| GIT-08 | Info | **VERIFIED** | docs/security-audit.md:71 says the remote has 2 branches | 3 |
| GIT-09 | Low | **VERIFIED** | Agent branches reused across 8-13 PRs, then rewritten | 3 |
| GIT-10 | Low | **VERIFIED** | No tags or releases; store builds pinned only in prose | 3 |
| DEAD-08 | Info | **SUSPECTED** | Build-time flags default off; prod state unknown | 5 |
| DEAD-13 | Info | **VERIFIED** | About 43 lines of unused theme tokens | 4 |
| DEAD-16 | Info | **VERIFIED** | Stale docs and comments about dead code | 4 |
| GIT-11 | Info | **VERIFIED** | Local branches are clean | 3 |

---

## 2. Method

### Tools (outputs in the orchestrator scratchpad, cited as "tooling:")

**knip.**
- tooling: knip-configured.txt was run with config tooling: knip.json. Its entries are `src/main.jsx`, `base44/functions/*/entry.ts`, `tests/**`, `scripts/*.mjs` and the root configs, and `expo-ios/**` is ignored. It reports 9 unused files, 3 unused deps, 1 unused devDep, 109 unused exports, 1 duplicate export and 29 unlisted deps.
- tooling: knip-prod2.txt is the `--production` run, with tests not counted as entries. It reports 201 unused exports. That is the 109 above plus 92 that only tests import.

**depcheck.** tooling: depcheck.json agrees on the 3 unused deps and `baseline-browser-mapping`. It also reports a false positive: autoprefixer and postcss are used by `postcss.config.js`.

**Per-symbol `rg -w` sweep.** This was run by the dead-code author and re-run independently by its verifier.
- It covers all 109 knip rows and the 92 test-only extras.
- The search area was src, base44, tests, scripts, `expo-ios/{src,tests,App.tsx}`, index.html, public, .github, android, playwright.config.js and vite.config.js.
- Hits in docs/, README and AGENTS were counted separately.

**ESLint (scratch config).** A scratch config turned on `no-unused-vars` (vars:all), `no-unreachable` and `no-constant-condition` over `src/**`, `base44/shared/*.js` and `scripts/**/*.mjs`. It produced 7 messages. A separate run of the repo's own `eslint .` without `--quiet` produced 7 warnings.

**`tsc --noUnusedLocals`** over `base44/functions/*/entry.ts` found 2 TS6133 hits.

**Tailwind 3.4.19 compile.** The repo's tailwind.config.js was compiled independently and the result compared with the built CSS (tooling: dist/assets/index-Cx4ij3X6.css, 57,296 B). Every `<utility>-<colour>/<n>` token in src was scanned.

**git.** `log -S`, `--diff-filter=AD` and `show --name-status` were used to date when code went dead and to detect re-additions by base44-builder.

**Branches.**
- Branch data came from tooling: branches.tsv (age, author, ahead/behind, is-ancestor, cherry) and tooling: pr-branch-map.tsv (PRs #1-#196, with `merged_at`).
- Each branch tip was compared with the head SHA of its last merged PR.
- Each branch tip tree was compared with the tree of its squash commit on main, found by the `(#N)` subject.
- GitHub API data: `list_branches`, PR check runs, and job logs for #196, #195 and #177.

### Manual checks done before calling anything dead

- **Dynamic loading.** Pages are lazy-loaded from the list in `src/App.jsx:21-138`. There is no `import.meta.glob` in src or vite.config.js (verified again for this document: 0 hits). Nothing marked dead appears in a `lazy()`, `lazyWithRetry` or `import()` call.
- **String references.**
  - Backend functions are invoked by name. 22 of 25 have a quoted-name reference in src, expo-ios, public, index.html or scripts; the three without one are listed in DEAD-09.
  - Entities are referenced as `entities.<Name>`, as string arrays in the deletion cascade and export lists, and through `ownedRecords(base44, "<Name>")`.
  - Route and page names are strings in App.jsx.
- **Base44 conventions.**
  - `base44/functions/<name>/entry.ts` is deployed by name and callable from outside the repo. Any function with no in-repo caller is therefore **SUSPECTED** for external callers.
  - The `@base44/vite-plugin` legacy resolver has 0 targets: there are 0 `@/entities|@/integrations|@/agents|@/functions` imports.
- **Tests, scripts and docs.** Every file and symbol was also searched in tests/, scripts/, docs/, .github/, android/, index.html and public/. Anything that is test-only is labelled TEST-ONLY, not dead.

### Caveats

- **The repo squash-merges PRs.** `merged_ancestor=no` and `git cherry +` counts in branches.tsv are therefore meaningless for merged branches. Two things are authoritative: the PR's `merged_at`, and whether the branch tip tree equals its squash commit.
- **expo-ios was not analysed by knip or tsc,** because its node_modules is not installed. It got a grep-level check only.
- **28 of knip's 29 "unlisted dependencies" are false positives.** They are Deno `npm:` (25) and `base44:` (3) specifiers in base44/functions, which the Base44 runtime resolves. Only `esbuild` is real (DEAD-11).
- **Production Base44 state is invisible from the repo.** That includes env flags, Secrets, the deployed function list, entity row counts and connector grants. Every claim that depends on it is **SUSPECTED**.
- **CSS no-op findings are not visually confirmed.** They rest on absence from the built stylesheet plus an independent compile. No browser rendering was done.

### Writer re-verification and conflict resolution

Re-checked for this document, all against commit 1093787:

**Branches**
- tooling: branches.tsv has 91 non-main remote branches. 51 are more than 60 days old, and 3 are ancestors of main (base44-builder, optimistic-johnson, coaching-tier).
- Joined against pr-branch-map.tsv: 80 have a merged PR, 10 have an open PR, and 1 (base44-builder) has no PR.
- For all 91 rows, the dossier's date, age and ahead/behind values match branches.tsv exactly.
- The 79-branch delete list in §3.4 is identical (`diff`) to "branches with a merged PR, minus amazing-cori".

**Tree comparison.** Of the 80 merged-PR branches, 78 tip trees equal their squash commit. The other two:
- `codex/progress-sections` differs only in package.json and package-lock.json, and the branch never touched either. Every file it touched is identical.
- `claude/amazing-cori-t2evjc` differs by 13 doc lines.

**GitHub.** `list_branches` returns 92 branches (91 + main), and only `main` is `protected:true`. Check runs confirm `verify` failure on #196 and #167, CodeQL "Analyze" failure on #167, and `verify` success on #148 (2026-09-15).

**Code**
- References re-grepped for the 9 knip files and all 34 dead-symbol rows: hits only in their own file, a dead file, tests or docs.
- Built CSS: 0 matches for `bg-teal\/10`, `bg-panel\/95`, `hover\:bg-primary\/90`, `bg-orange-100`, `caret-blink` and `accordion`; 1 match for `bg-black\/50`; keyframes are only enter, exit, ping, pulse and spin.
- Chunks: the NASM data string is in RecompContext-BaLxye1K.js (77,720 B), and the lifestyle schema strings are in AuthContext-DUTLrtI1.js (11,381 B).

Conflicts resolved:

| # | Conflict | Resolution | Evidence |
|---|---|---|---|
| R1 | D-deadcode (DEAD-14, Could not assess) said tooling: dist/brand/ lacks `recompone-mark-master.png`. | **Wrong.** The file is present (1,169,981 B). Its mtime is 2026-10-28 19:31:14, the same build as its siblings. The mark-master PNG does ship in the build, and that Could-not-assess item is closed. | `ls -l tooling/dist/brand/` |
| R2 | D-deadcode (DEAD-11) puts the unused-dep cost at "about 3.4 MB". The frontend dossier notes that `react-hook-form` is still installed. | Both are right. `react-hook-form` was removed from package.json in afd0fc4, but package-lock.json:6440-6446 still installs 7.88.0 with `"peer": true`, as the peer of `@hookform/resolvers`. Removing the resolvers also drops it (2.3 MB), so the total is about 5.7 MB. | `du -sh node_modules/{react-hook-form,@hookform/resolvers,...}` |
| R3 | E-branches GIT-05: "#196 passes that point [expo-doctor] but fails earlier". | #196 fails at "Test native meal speech protocol and lifecycle" (.github/workflows/ci.yml:49-50), which runs **before** "Validate Expo configuration" (:52-53). expo-doctor never ran on #196, so whether expo 57.0.31 clears it is untested in CI. | `name:` / `run:` lines of .github/workflows/ci.yml (grep -n) |
| R4 | The spec defines 4 branch classes. E-branches adds KEEP. | KEEP is retained for `main` and `base44-builder`. base44-builder is an ancestor of main with no PR, so its content is MERGED-DELETE-SAFE, but 3 workflows and 1 test key on its name (GIT-04). STALE (>60 days) is applied only to unmerged branches, and there are 0 of those. Merged branches older than 60 days are marked "(>60)" in the Age column. | §3.3 |
| R5 | OAuthConsent appears as FE-11 in the frontend dossier and as DEAD-04 here. The Gmail connector appears as B44-11/BE-11 (doc 03) and SEC-16 (security dossier). | Same facts in each. They are merged into DEAD-04 and DEAD-12 here, with cross-references. | — |

---

## 3. Branches

### 3.1 Counts (91 remote branches, excluding `origin/main`)

| Classification | Count | Detail | Tag |
|---|---|---|---|
| MERGED-DELETE-SAFE | 79 | 77 have tip == merged PR head. 2 have a tip that *is* their own squash commit on main (is-ancestor=yes). 51 are >60 days old, 28 are 43-60 days. 66 are `codex/*`, 13 `claude/*` | **VERIFIED** |
| ACTIVE (open Dependabot PR) | 10 | 9 red. 1 green but stale (#148) | **VERIFIED** |
| UNMERGED-REVIEW | 1 | `claude/amazing-cori-t2evjc` (21 days, no open PR, 1 unique commit) | **VERIFIED** |
| KEEP (infrastructure) | 1 | `base44-builder` (ancestor of main, no PR, referenced by CI) | **VERIFIED** |
| STALE (>60 days, unmerged) | 0 | — | **VERIFIED** |
| Local-only | 1 | `claude/compassionate-knuth-kolhx5` (audit branch, == origin/main) | **VERIFIED** |

Tags and releases: 0. `git tag | wc -l` = 0, and GitHub tags and releases are both empty.

### 3.2 Branch findings

### GIT-01 79 of 91 remote branches are fully merged and safe to delete; nothing deletes merged head branches
- Tag: **VERIFIED** (the "Automatically delete head branches" setting is **SUSPECTED**)
- Severity: Low
- Evidence:
  - For 77 branches, the tip SHA equals the `head.sha` of the last merged PR (GitHub API vs `git rev-parse`; tooling: branches.tsv, pr-branch-map.tsv). The full list is §3.3.
  - 2 branches point *at* their squash commit on main:
    - `claude/optimistic-johnson-h2gazu` → 0dd8dd3 "(#156)".
    - `claude/coaching-tier-ui-workout-tracker-6004le` → 6e62983 "(#80)".
  - 78 of 80 merged-PR tip trees are byte-identical to their squash commit. `codex/progress-sections` is identical in every file it touched (see §2, "Writer re-verification").
  - Every closed Dependabot branch is gone, while 79 merged human and agent branches remain. That pattern indicates head-branch auto-delete is off; the setting itself cannot be read through the API.
- Impact: 87% of refs are dead. Tools that use ancestry report them as unmerged: branches.tsv shows `merged_ancestor=no` for 77 of them.
- Fix: run the §3.4 deletes after GIT-02, then turn on Settings → General → "Automatically delete head branches". Effort: <1h

### GIT-02 `claude/amazing-cori-t2evjc` holds one unmerged docs commit (fdb5865) recording Google Play launch blockers that are still open in main
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - `git log f720085..origin/claude/amazing-cori-t2evjc` lists 3 commits:
    - d7a2dad "Merge the merged branch history…"
    - fdb5865 "Document launch-blocking gaps in verifyGooglePlayPurchase" (2026-10-07)
    - 9d4d8fd, which is main's own #187 squash.
  - `git diff --stat origin/main origin/claude/amazing-cori-t2evjc -- docs/premium-testing-and-launch.md docs/product-roadmap.md` shows 11 + 2 = 13 inserted lines.
  - Main has not touched either file since 9d4d8fd (`git log 9d4d8fd..origin/main -- <files>` is empty), so the commit applies cleanly.
  - Gaps still present in main:
    - 0 `acknowledg` hits in base44/functions/verifyGooglePlayPurchase/.
    - base44/functions/verifyGooglePlayPurchase/entry.ts:128-133 still calls the one-time `/purchases/products/` endpoint ("One-time product (inapp) purchase verification").
    - entry.ts:12 `const VALID_PRODUCT_IDS = new Set(Object.values(PREMIUM_PRODUCTS));`
  - Partly superseded: the race fix landed in 43cb895, which adds `export function rankGooglePlayBinding(rows, ownId)` at base44/shared/googlePlayPurchaseDomain.js:42.
  - The other 38 `git cherry` "+" commits are pre-squash copies of PRs #172-#187.
- Impact: Deleting this branch along with the other 79 would lose the only written record of these blockers, including the one that says unacknowledged Play purchases are auto-refunded.
- Fix: cherry-pick fdb5865 into a docs PR and rewrite the "racy binding" and "make testable" bullets to reflect 43cb895. Then delete the branch. Effort: <1h

### GIT-03 Main takes unreviewed direct pushes: 20 commits (+13,594/−2,192, 136 files) since the last merged PR
- Tag: **VERIFIED** (history; branch rule queried in QA)
- Severity: High
- Evidence:
  - `git log 9d4d8fd..origin/main` has 20 commits: 11 by Aaron Cole, 9 by base44-builder[bot], 0 merges.
  - `git diff --shortstat 9d4d8fd origin/main` = "136 files changed, 13594 insertions(+), 2192 deletions(-)".
  - The latest `merged_at` in pr-branch-map.tsv is 2026-10-07T16:01:16Z (#187).
  - `gh api repos/aaronjcole/recomp-iq-app/branches/main` → `{"protected":true,"rsc":{"checks":[],"contexts":[],"enforcement_level":"off"}}`: protected, with no required checks (00 C2).
  - .github/workflows/ci.yml:76-77 states it outright: "Pushes straight to main are not gated by this workflow -- only pull requests are."
  - Builder commits include 3ddb424, the Vite 8 install that left `esbuild` unresolvable (DEAD-11), and 43cb895, a Play purchase backend change.
- Impact: Three weeks of changes reached main, and possibly Base44 production (publishes are manual, BE-08), with no review and no CI gate. CI on main has been red on every push since #531 (2026-10-21); the last green run was #529 (00 C8).
- Fix: point the Builder at `base44-builder` (GIT-04) and require status checks on main, or document the ungated model explicitly. Effort: <1d (plus Base44 dashboard work)

### GIT-04 `base44-builder` is wired into 3 workflows and 1 test but has never received a Builder push; it is 40 commits behind main
- Tag: **VERIFIED** (whether the Base44 dashboard can target a branch is **SUSPECTED**)
- Severity: Medium
- Evidence:
  - The tip, 2fb3a21, is the #155 squash (2026-09-15). `git log origin/main..origin/base44-builder --author=base44-builder` returns 0 commits.
  - The branch is referenced in four places:
    - .github/workflows/base44-builder-pr.yml:24-27 (`on: push: branches: - base44-builder`)
    - .github/workflows/ci.yml:12
    - .github/workflows/codeql.yml:10
    - tests/security/repository-policy.test.js:180-189, which asserts that CI and CodeQL list it.
  - docs/codex-handoff.md:107: "Whether the Base44 dashboard exposes a target-branch setting is still **unverified**".
- Impact: The PR-gating path is dead in practice. If the Builder is ever pointed at the branch, its first push lands on a ref 40 commits stale.
- Fix: keep the branch, and fast-forward it to main before re-pointing the Builder (command in §3.4). Effort: <1h

### GIT-05 All 10 open Dependabot branches are red or stale; #196, the one meant to fix main, fails on the xcode 4 / uuid override
- Tag: **VERIFIED**
- Severity: Medium (the xcode part is DEP-24, Medium; the doctor part is BE-05 / DEP-02, counted there as High)
- Evidence:
  - Check runs: `verify` fails on #196, #195, #192, #177, #170, #168, #167, #160 and #159. #148 has `verify` = success, but that run is from 2026-09-15 and the branch is 44 commits behind.
  - The #195 and #177 logs fail at expo-doctor, with "expo ~57.0.31 expected, 57.0.30 found". That is main's own non-hermetic failure.
  - #196 fails at `npm run test:speech --prefix expo-ios` (ci.yml:49-50, which runs before expo-doctor; see R3). The failing assertion is expo-ios/tests/dependencySecurity.test.ts:14, `assert.equal(manifest.overrides["xcode@3.0.1"].uuid, "11.1.1")`.
  - Cause, from parsing the lockfiles:
    - The #196 lockfile resolves `node_modules/xcode` 4.0.0 with no `node_modules/uuid`.
    - Main resolves xcode 3.0.1 and uuid 11.1.1.
    - The override at expo-ios/package.json:31-35 (`"xcode@3.0.1": { "uuid": "11.1.1" }`) therefore no longer matches anything.
- Impact: Merging Dependabot PRs cannot make main go green, and the "required checks" signal carries no information.
- Fix: carry #196 on a human branch that bumps expo and re-scopes the override and test to xcode 4.0.0, then close #196. Effort: <1h (the DEP-24 change)

### GIT-06 #167 and #168 each bump only one half of the CodeQL action pair
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - Main pins both `init@` and `analyze@` to b96794f0… (.github/workflows/codeql.yml:34, :39).
  - #168's three-dot diff is a single line: `init@` moves to 2892aa5e…. #167 moves only `analyze@`.
  - On #167, "Analyze JavaScript and TypeScript" fails (check run, 2026-10-01).
  - .github/dependabot.yml:72-80, the github-actions block, has no `groups:` entry.
- Impact: Neither PR can be merged on its own. Merging either one breaks CodeQL on main.
- Fix: close both, land one combined bump, and add a `groups: codeql: patterns: ["github/codeql-action/*"]` entry. Effort: <1h

### GIT-07 #177 is a Tailwind 3→4 major bump that contradicts the Dependabot major-ignore policy and probably breaks the build
- Tag: **VERIFIED** (version change, config state, and the build break: 01 DEP-04 ran `vite build` on the PR tree and got exit 1 with the Tailwind-4 PostCSS error; 00 C4) / **SUSPECTED** (why Dependabot routed it)
- Severity: Medium
- Evidence:
  - The branch's package.json:68 has `"tailwindcss": "^4.3.3"`; main has `^3.4.17`.
  - The branch lockfile has 0 `node_modules/@tailwindcss/postcss` entries.
  - postcss.config.js:3 is still `tailwindcss: {},`.
  - .github/dependabot.yml:21-25 ignores `version-update:semver-major`.
  - CI never reached the build step: it failed at expo-doctor. The local reproduction is in 01 DEP-04.
- Impact: A "fix CI, then merge the queue" pass would break `vite build`, because Tailwind 4 moved its PostCSS plugin to `@tailwindcss/postcss`.
- Fix: close #177 and track a separate migration. Effort: <1h to close; >1d (~2-3 days) to migrate

### GIT-08 docs/security-audit.md:71 says the remote has two branches and no tags
- Tag: **VERIFIED**
- Severity: Info (same class as BE-27 / DEAD-16 / SEC-20)
- Evidence: docs/security-audit.md:71 says "The remote has only `main` and `codex/release-stabilization`, with no tags." `list_branches` returns 92.
- Impact: The doc's "every reachable Git object" secrets claim covered a 2-branch repo. The only content outside main today is fdb5865 plus the Dependabot lockfiles, so the practical exposure is nil, but the statement is false.
- Fix: drop the sentence or date-stamp it. Effort: <1h

### GIT-09 Agent branches are reused across 8-13 squash-merged PRs and then rewritten, creating false "unmerged" signals
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - PR head refs (tooling: pr-branch-map.tsv):
    - `claude/optimistic-johnson-h2gazu`: 13 PRs
    - `claude/premium-features-testing-unlock-wse2gu`: 13 PRs
    - `claude/amazing-cori-t2evjc`: 10 PRs
    - `claude/issue-prioritization-tlk4mn`: 8 PRs
  - The PR heads 7891f3d and 046997c are no longer in the object store; those branches were reset to their squash commit.
  - amazing-cori shows "+49/−20, 38 cherry+" for 13 real lines.
- Impact: ahead/behind and `git cherry` cannot be trusted for these branches. That is how fdb5865 ended up hidden among 48 commits that were already merged.
- Fix: use one branch per PR and delete on merge (GIT-01). Effort: <1h (process)

### GIT-10 No tags or releases exist; shipped native builds are tracked only in prose
- Tag: **VERIFIED**
- Severity: Low
- Evidence: `git tag | wc -l` = 0. GitHub tags and releases are both `[]`. docs/features/nutrition-integration.md:81 says "iOS build 6 … completed successfully from native source commit 7e6e81c".
- Impact: No ref pins the commit behind a store binary, so rollback and bisect depend on reading docs.
- Fix: tag each store build, e.g. `ios-build-6` → 7e6e81c. Effort: <1h

### GIT-11 Local branches are clean
- Tag: **VERIFIED**
- Severity: Info
- Evidence: `git branch -vv` shows `main 1093787 [origin/main]` and `* claude/compassionate-knuth-kolhx5 1093787` (no upstream, 0 unique commits).
- Impact: none.
- Fix: none. Effort: n/a

### 3.3 Full branch table

Columns:
- Age is in days as of 2026-10-28; "(>60)" marks branches older than 60 days.
- Ahead/Behind is relative to origin/main (tooling: branches.tsv).
- Merged status comes from PR `merged_at` (tooling: pr-branch-map.tsv).
- "tree == squash X" means the branch tip tree is byte-identical to main's squash commit X (re-verified for this document).
- CI results come from GitHub check runs. The failing step was read from logs only for #196, #195 and #177.

| Branch | Last commit | Age | Author | Ahead/Behind | Merged status | Classification | Evidence | Tag |
|---|---|---|---|---|---|---|---|---|
| origin/main | 2026-10-23 | 5 | base44-builder[bot] | +0/-0 | — | KEEP (default, protected:true) | 1093787 | **VERIFIED** |
| base44-builder | 2026-09-15 | 43 | aaronjcole | +0/-40 | ancestor (no PR) | KEEP (infra; ancestor) | push target in .github/workflows/ci.yml:12, codeql.yml:10, base44-builder-pr.yml:27; tip 2fb3a21 = #155 squash; never received a Builder push | **VERIFIED** |
| claude/ai-coach-premium-research-nbz9fn | 2026-08-07 | 81 (>60) | Claude | +3/-165 | PR #72 merged 2026-08-07 | MERGED-DELETE-SAFE | tip == #72 head e77affa; #72 base was wse2gu, carried to main by #73 (060115d); trees identical | **VERIFIED** |
| claude/amazing-cori-t2evjc | 2026-10-07 | 21 | Claude | +49/-20 | PR #172-#174,#180,#182-#187 (10) merged, last 2026-10-07 | UNMERGED-REVIEW | tip d7a2dad is 3 commits past #187 head f720085; fdb5865 adds 13 doc lines not in main (GIT-02) | **VERIFIED** |
| claude/app-improvement-appeal-e4iuce | 2026-08-16 | 72 (>60) | Claude | +2/-148 | PR #89 merged 2026-08-16 | MERGED-DELETE-SAFE | tip 21454d5 == #89 head; tree == squash b666bc8 | **VERIFIED** |
| claude/coach-tier-premium-beta-p892pu | 2026-08-08 | 81 (>60) | Claude | +1/-158 | PR #74 merged 2026-08-08 | MERGED-DELETE-SAFE | tip d697db2 == #74 head; tree == squash 266a845 | **VERIFIED** |
| claude/coaching-tier-ui-workout-tracker-6004le | 2026-08-10 | 78 (>60) | aaronjcole | +0/-156 | ancestor; PR #80 merged 2026-08-10 | MERGED-DELETE-SAFE | tip 6e62983 IS the #80 squash commit on main (is-ancestor=yes); PR head 046997c not in object store (branch reset after merge) | **VERIFIED** |
| claude/codex-android-review-zem1sq | 2026-08-03 | 86 (>60) | Claude | +6/-207 | PR #29 merged 2026-08-03 | MERGED-DELETE-SAFE | tip 96ec1f4 == #29 head; tree == squash 6bbbc35 | **VERIFIED** |
| claude/issue-prioritization-tlk4mn | 2026-08-15 | 73 (>60) | Claude | +2/-149 | PR #81-#88 (8) merged | MERGED-DELETE-SAFE | tip 0ed31b2 == #88 head; tree == squash decc51b | **VERIFIED** |
| claude/observability-resilience-zem1sq | 2026-08-03 | 85 (>60) | Claude | +3/-202 | PR #34 merged 2026-08-03 | MERGED-DELETE-SAFE | tip 9dba94a == #34 head; tree == squash fef44a0 | **VERIFIED** |
| claude/optimistic-johnson-h2gazu | 2026-09-15 | 43 | aaronjcole | +0/-34 | ancestor; PR #127,#136-#138,#146,#147,#150-#156 (13) merged | MERGED-DELETE-SAFE | tip 0dd8dd3 IS the #156 squash commit on main (is-ancestor=yes); PR head 7891f3d not in object store (branch reset after merge) | **VERIFIED** |
| claude/premium-features-testing-unlock-wse2gu | 2026-08-07 | 81 (>60) | aaronjcole | +1/-165 | PR #59-#65,#67-#71,#73 (13) merged | MERGED-DELETE-SAFE | tip 721784e == #73 head; tree == squash 060115d | **VERIFIED** |
| claude/today-redesign-zem1sq | 2026-08-03 | 86 (>60) | aaronjcole | +3/-206 | PR #30 merged 2026-08-03 | MERGED-DELETE-SAFE | tip a187056 == #30 head; tree == squash 592bd5c | **VERIFIED** |
| claude/wave1-habits-domain-zem1sq | 2026-08-03 | 86 (>60) | Claude | +2/-204 | PR #32 merged 2026-08-03 | MERGED-DELETE-SAFE | tip fcb28ed == #32 head; tree == squash ee9f708 | **VERIFIED** |
| claude/wave1-ref-live-split-zem1sq | 2026-08-03 | 86 (>60) | Claude | +1/-203 | PR #33 merged 2026-08-03 | MERGED-DELETE-SAFE | tip 557a112 == #33 head; tree == squash a56d2b7 | **VERIFIED** |
| claude/wave1-test-harness-zem1sq | 2026-08-03 | 86 (>60) | Claude | +2/-205 | PR #31 merged 2026-08-03 | MERGED-DELETE-SAFE | tip bf1d5ba == #31 head; tree == squash aecf55f | **VERIFIED** |
| codex/accessibility-semantics | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-198 | PR #38 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 798a03e == #38 head; tree == squash 4eaabde | **VERIFIED** |
| codex/accessible-form-labels | 2026-09-03 | 55 | Aaron Cole | +1/-112 | PR #95 merged 2026-09-03 | MERGED-DELETE-SAFE | tip f27da1e == #95 head; tree == squash 7beb1d6 | **VERIFIED** |
| codex/accessible-progress-share | 2026-09-03 | 54 | Aaron Cole | +1/-108 | PR #99 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 01a7b53 == #99 head; tree == squash 4d328f5 | **VERIFIED** |
| codex/adaptive-meal-planning | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-190 | PR #46 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 110413e == #46 head; tree == squash 383b7f5 | **VERIFIED** |
| codex/adaptive-training-blocks | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-189 | PR #47 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 5807fe1 == #47 head; tree == squash 538bdc7 | **VERIFIED** |
| codex/android-play-wrapper-1 | 2026-08-01 | 87 (>60) | Aaron Cole | +1/-213 | PR #23 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 1c3ece9 == #23 head; tree == squash c0b3687 | **VERIFIED** |
| codex/base44-auth-bootstrap | 2026-08-04 | 85 (>60) | Aaron Cole | +2/-182 | PR #54 merged 2026-08-04 | MERGED-DELETE-SAFE | tip cefb6ce == #54 head; tree == squash 58a93eb | **VERIFIED** |
| codex/base44-oauth-consent | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-181 | PR #55 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 6f73281 == #55 head; tree == squash cb39d78 | **VERIFIED** |
| codex/base44-premium-release-flag | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-183 | PR #53 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 3f75c29 == #53 head; tree == squash a841f42 | **VERIFIED** |
| codex/base44-shared-function-code | 2026-08-01 | 88 (>60) | Aaron Cole | +1/-219 | PR #17 merged 2026-08-01 | MERGED-DELETE-SAFE | tip 6950ac3 == #17 head; tree == squash b499f1b | **VERIFIED** |
| codex/brand-logo-refresh-1 | 2026-08-02 | 87 (>60) | Aaron Cole | +1/-211 | PR #25 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 1a20d31 == #25 head; tree == squash 4cfbd48 | **VERIFIED** |
| codex/coach-action-eligibility-1 | 2026-08-01 | 87 (>60) | Aaron Cole | +1/-215 | PR #21 merged 2026-08-01 | MERGED-DELETE-SAFE | tip fac0dbf == #21 head; tree == squash 95a80d9 | **VERIFIED** |
| codex/coach-shared-rate-limit | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-193 | PR #43 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 62c4c11 == #43 head; tree == squash 2095a79 | **VERIFIED** |
| codex/custom-touch-targets | 2026-09-03 | 55 | Aaron Cole | +1/-111 | PR #96 merged 2026-09-03 | MERGED-DELETE-SAFE | tip f8c4509 == #96 head; tree == squash a1fd3d5 | **VERIFIED** |
| codex/dark-mode-row-control | 2026-09-03 | 54 | Aaron Cole | +1/-110 | PR #97 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 43d765b == #97 head; tree == squash e597b6b | **VERIFIED** |
| codex/dedupe-default-habits | 2026-09-08 | 49 | Aaron Cole | +2/-87 | PR #120 merged 2026-09-08 | MERGED-DELETE-SAFE | tip b99d70f == #120 head; tree == squash b5845e3 | **VERIFIED** |
| codex/dependency-policy | 2026-08-01 | 88 (>60) | Aaron Cole | +1/-221 | PR #10 merged 2026-08-01 | MERGED-DELETE-SAFE | tip f6b43bd == #10 head; tree == squash 662f06c | **VERIFIED** |
| codex/eas-ios-testflight | 2026-09-10 | 48 | Aaron Cole | +2/-81 | PR #123 merged 2026-09-10 | MERGED-DELETE-SAFE | tip aa14119 == #123 head; tree == squash d277502 | **VERIFIED** |
| codex/expo-ios-storekit-shell | 2026-09-09 | 48 | Aaron Cole | +2/-82 | PR #122 merged 2026-09-10 | MERGED-DELETE-SAFE | tip 6dc2cc5 == #122 head; tree == squash 0cb2620 | **VERIFIED** |
| codex/fitness-module-tests | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-199 | PR #37 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 3ba7e3b == #37 head; tree == squash 9878e31 | **VERIFIED** |
| codex/fix-sitemap-mime | 2026-08-04 | 85 (>60) | Aaron Cole | +2/-178 | PR #58 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 6626c6c == #58 head; tree == squash b54c5bc | **VERIFIED** |
| codex/fix-today-calorie-source | 2026-09-07 | 51 | Aaron Cole | +1/-94 | PR #114 merged 2026-09-07 | MERGED-DELETE-SAFE | tip 95646f1 == #114 head; tree == squash 283c0b7 | **VERIFIED** |
| codex/free-sleep-insights | 2026-09-08 | 50 | Aaron Cole | +2/-91 | PR #116 merged 2026-09-08 | MERGED-DELETE-SAFE | tip 6466478 == #116 head; tree == squash 0996f6e | **VERIFIED** |
| codex/hero-premium-features | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-184 | PR #52 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 01a8cb6 == #52 head; tree == squash 60e21ef | **VERIFIED** |
| codex/idempotent-writes | 2026-08-01 | 88 (>60) | Aaron Cole | +1/-220 | PR #16 merged 2026-08-01 | MERGED-DELETE-SAFE | tip 27265aa == #16 head; tree == squash 510bffe | **VERIFIED** |
| codex/ios-entry-and-apple-auth | 2026-09-07 | 50 | Aaron Cole | +2/-93 | PR #115 merged 2026-09-07 | MERGED-DELETE-SAFE | tip 495a96c == #115 head; tree == squash dc5d315 | **VERIFIED** |
| codex/ios-fullbleed-icon | 2026-09-10 | 48 | Aaron Cole | +2/-79 | PR #125 merged 2026-09-10 | MERGED-DELETE-SAFE | tip 3fc2b9f == #125 head; tree == squash 1d90577 | **VERIFIED** |
| codex/ios-layout-preferences | 2026-09-10 | 48 | Aaron Cole | +1/-80 | PR #124 merged 2026-09-10 | MERGED-DELETE-SAFE | tip 7e67cb8 == #124 head; tree == squash 33fecbe | **VERIFIED** |
| codex/ios-theme-controls | 2026-09-10 | 47 | Aaron Cole | +1/-78 | PR #126 merged 2026-09-10 | MERGED-DELETE-SAFE | tip 9d0d9c3 == #126 head; tree == squash b695c72 | **VERIFIED** |
| codex/itemized-food-diary | 2026-09-08 | 50 | Aaron Cole | +1/-90 | PR #117 merged 2026-09-08 | MERGED-DELETE-SAFE | tip dc64ba3 == #117 head; tree == squash df8f2fe | **VERIFIED** |
| codex/launch-page-positioning | 2026-08-02 | 86 (>60) | Aaron Cole | +1/-210 | PR #26 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 2d98224 == #26 head; tree == squash 62ee67c | **VERIFIED** |
| codex/light-gold-contrast | 2026-09-03 | 54 | Aaron Cole | +1/-106 | PR #101 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 040c0cd == #101 head; tree == squash 874fe6f | **VERIFIED** |
| codex/live-frame-protection-verifier | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-192 | PR #44 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 534097d == #44 head; tree == squash b57de73 | **VERIFIED** |
| codex/marketing-store-conversion | 2026-09-04 | 54 | Aaron Cole | +1/-100 | PR #107 merged 2026-09-04 | MERGED-DELETE-SAFE | tip 1929a03 == #107 head; tree == squash e117aea | **VERIFIED** |
| codex/mobile-tab-subroutes | 2026-08-02 | 86 (>60) | Aaron Cole | +1/-208 | PR #28 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 9a95c01 == #28 head; tree == squash 89fea84 | **VERIFIED** |
| codex/mobile-ux-hierarchy-1 | 2026-08-01 | 87 (>60) | Aaron Cole | +2/-217 | PR #19 merged 2026-08-01 | MERGED-DELETE-SAFE | tip 0f4b8d3 == #19 head; tree == squash 086ef5b | **VERIFIED** |
| codex/mobile-webview-polish-1 | 2026-08-02 | 87 (>60) | Aaron Cole | +1/-212 | PR #24 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 1042ad6 == #24 head; tree == squash 24ba6a2 | **VERIFIED** |
| codex/more-page-semantics | 2026-09-03 | 54 | Aaron Cole | +1/-107 | PR #100 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 867b23c == #100 head; tree == squash 1624237 | **VERIFIED** |
| codex/on-device-visual-progress | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-187 | PR #49 merged 2026-08-04 | MERGED-DELETE-SAFE | tip eee403d == #49 head; tree == squash 5b1bc92 | **VERIFIED** |
| codex/play-release-readiness-1 | 2026-08-01 | 88 (>60) | Aaron Cole | +1/-218 | PR #18 merged 2026-08-01 | MERGED-DELETE-SAFE | tip e8aa9fd == #18 head; tree == squash ec34769 | **VERIFIED** |
| codex/premium-body-composition-scan | 2026-08-04 | 85 (>60) | Aaron Cole | +2/-185 | PR #51 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 2e61167 == #51 head; tree == squash 3b520cd | **VERIFIED** |
| codex/premium-cta-names | 2026-09-03 | 54 | Aaron Cole | +1/-109 | PR #98 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 0916fb8 == #98 head; tree == squash e4dff23 | **VERIFIED** |
| codex/premium-entitlement-foundation | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-191 | PR #45 merged 2026-08-04 | MERGED-DELETE-SAFE | tip b12e0e4 == #45 head; tree == squash 34ccbe9 | **VERIFIED** |
| codex/premium-launch-runbook | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-186 | PR #50 merged 2026-08-04 | MERGED-DELETE-SAFE | tip c8b763d == #50 head; tree == squash 5bb7fab | **VERIFIED** |
| codex/premium-product-previews | 2026-09-04 | 54 | Aaron Cole | +1/-101 | PR #106 merged 2026-09-04 | MERGED-DELETE-SAFE | tip b3056ec == #106 head; tree == squash 37584a8 | **VERIFIED** |
| codex/progress-linear-trends | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-201 | PR #35 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 859efc4 == #35 head; tree == squash ef73b09 | **VERIFIED** |
| codex/progress-sections | 2026-09-04 | 54 | Aaron Cole | +1/-103 | PR #105 merged 2026-09-04 | MERGED-DELETE-SAFE | tip 5f3f56b == #105 head; every file the branch touched is identical in squash 306f224 (tree differs only in package.json + package-lock.json, untouched by the branch) | **VERIFIED** |
| codex/promo-premium-section | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-180 | PR #56 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 01a3702 == #56 head; tree == squash 5346a80 | **VERIFIED** |
| codex/public-seo-indexing | 2026-08-04 | 85 (>60) | Aaron Cole | +2/-179 | PR #57 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 8215d66 == #57 head; tree == squash 9dd1892 | **VERIFIED** |
| codex/react-vendor-chunk | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-194 | PR #42 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 483a423 == #42 head; tree == squash 87319e3 | **VERIFIED** |
| codex/rebrand-recompone | 2026-08-02 | 86 (>60) | Aaron Cole | +1/-209 | PR #27 merged 2026-08-02 | MERGED-DELETE-SAFE | tip d5c3c17 == #27 head; tree == squash 22344f8 | **VERIFIED** |
| codex/recommendation-correctness | 2026-08-03 | 85 (>60) | Aaron Cole | +2/-200 | PR #36 merged 2026-08-04 | MERGED-DELETE-SAFE | tip d9de10c == #36 head; tree == squash db292c7 | **VERIFIED** |
| codex/reduced-motion | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-197 | PR #39 merged 2026-08-04 | MERGED-DELETE-SAFE | tip fdac42e == #39 head; tree == squash e5c2d89 | **VERIFIED** |
| codex/refresh-postcss-security | 2026-09-04 | 54 | Aaron Cole | +1/-99 | PR #108 merged 2026-09-04 | MERGED-DELETE-SAFE | tip 0ef13bc == #108 head; tree == squash 171622c | **VERIFIED** |
| codex/release-stabilization | 2026-08-01 | 88 (>60) | Aaron Cole | +2/-223 | PR #1,#2 (2) merged | MERGED-DELETE-SAFE | tip bb289de == #2 head; tree == squash ab6187e | **VERIFIED** |
| codex/repair-analysis-image-security-oracle | 2026-09-07 | 51 | Aaron Cole | +2/-95 | PR #109 merged 2026-09-07 | MERGED-DELETE-SAFE | tip 92f18c1 == #109 head; tree == squash a96e362 | **VERIFIED** |
| codex/restore-release-gates-seo | 2026-09-03 | 55 | Aaron Cole | +1/-113 | PR #93 merged 2026-09-03 | MERGED-DELETE-SAFE | tip 81db032 == #93 head; tree == squash aed873e | **VERIFIED** |
| codex/route-accessibility-polish-1 | 2026-08-01 | 87 (>60) | Aaron Cole | +2/-214 | PR #22 merged 2026-08-02 | MERGED-DELETE-SAFE | tip 9a65500 == #22 head; tree == squash 5f05a95 | **VERIFIED** |
| codex/system-theme-default | 2026-09-03 | 54 | Aaron Cole | +1/-105 | PR #102 merged 2026-09-03 | MERGED-DELETE-SAFE | tip cab2ef2 == #102 head; tree == squash 6ffc171 | **VERIFIED** |
| codex/today-first-viewport | 2026-09-03 | 54 | Aaron Cole | +1/-104 | PR #103 merged 2026-09-03 | MERGED-DELETE-SAFE | tip e8de9e4 == #103 head; tree == squash de8a55c | **VERIFIED** |
| codex/today-progressive-disclosure | 2026-09-08 | 49 | Aaron Cole | +1/-88 | PR #119 merged 2026-09-08 | MERGED-DELETE-SAFE | tip 61479ce == #119 head; tree == squash 27c8fa8 | **VERIFIED** |
| codex/todays-best-move-1 | 2026-08-01 | 87 (>60) | Aaron Cole | +1/-216 | PR #20 merged 2026-08-01 | MERGED-DELETE-SAFE | tip 8cdc7f3 == #20 head; tree == squash 2488057 | **VERIFIED** |
| codex/touch-target-primitives | 2026-08-03 | 85 (>60) | Aaron Cole | +4/-196 | PR #40 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 3690824 == #40 head; tree == squash ead8f24 | **VERIFIED** |
| codex/type-token-unification | 2026-08-03 | 85 (>60) | Aaron Cole | +1/-195 | PR #41 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 325f3ec == #41 head; tree == squash 79d4a1b | **VERIFIED** |
| codex/weekly-autopilot-review | 2026-08-04 | 85 (>60) | Aaron Cole | +1/-188 | PR #48 merged 2026-08-04 | MERGED-DELETE-SAFE | tip 3871884 == #48 head; tree == squash 6f8c1c2 | **VERIFIED** |
| codex/workout-history-reuse | 2026-09-08 | 49 | Aaron Cole | +2/-89 | PR #118 merged 2026-09-08 | MERGED-DELETE-SAFE | tip 83e80a5 == #118 head; tree == squash 2f9619e | **VERIFIED** |
| dependabot/github_actions/github/codeql-action/analyze-4.38.2 | 2026-10-01 | 27 | dependabot[bot] | +1/-33 | open PR #167 | ACTIVE | codeql-action/analyze pin only; tip 842e820 = PR head; verify FAIL + CodeQL Analyze FAIL (GIT-06) | **VERIFIED** |
| dependabot/github_actions/github/codeql-action/init-4.38.2 | 2026-10-01 | 27 | dependabot[bot] | +1/-33 | open PR #168 | ACTIVE | codeql-action/init pin only; tip fc11424 = PR head; verify FAIL + CodeQL Analyze FAIL (GIT-06) | **VERIFIED** |
| dependabot/npm_and_yarn/development-patches-db6c32fc4b | 2026-10-26 | 2 | dependabot[bot] | +1/-0 | open PR #195 | ACTIVE | @types/node 22.20.5, baseline-browser-mapping 2.11.31; tip 8ad4af2 = PR head; verify FAIL (expo-doctor) | **VERIFIED** |
| dependabot/npm_and_yarn/expo-ios/expo-57.0.31 | 2026-10-26 | 2 | dependabot[bot] | +1/-0 | open PR #196 | ACTIVE | expo 57.0.30->57.0.31 (expo-ios); tip 0df5fa1 = PR head; verify FAIL at test:speech (xcode 4 / uuid override, GIT-05) | **VERIFIED** |
| dependabot/npm_and_yarn/expo-ios/types/node-22.20.5 | 2026-10-05 | 23 | dependabot[bot] | +1/-32 | open PR #170 | ACTIVE | @types/node 22.20.5 (expo-ios); tip ae67165 = PR head; verify FAIL (step not read) | **VERIFIED** |
| dependabot/npm_and_yarn/lucide-react-0.577.0 | 2026-09-15 | 43 | dependabot[bot] | +1/-44 | open PR #148 | ACTIVE | lucide-react 0.475->0.577; tip 646e7cd = PR head; verify PASS (2026-09-15, 44 commits stale) | **VERIFIED** |
| dependabot/npm_and_yarn/multi-d49ef80a9c | 2026-10-23 | 5 | dependabot[bot] | +1/-2 | open PR #177 | ACTIVE | tailwindcss 3.4.19->4.3.3 MAJOR, drops postcss-selector-parser; tip 39b5305 = PR head; verify FAIL (expo-doctor; build step never reached) (GIT-07) | **VERIFIED** |
| dependabot/npm_and_yarn/production-patches-a76b2953a1 | 2026-10-26 | 2 | dependabot[bot] | +1/-0 | open PR #192 | ACTIVE | @radix-ui/react-label 2.1.17, react-router-dom 7.18.4; tip dbfff05 = PR head; verify FAIL (step not read) | **VERIFIED** |
| dependabot/npm_and_yarn/radix-ui/react-select-2.3.7 | 2026-09-21 | 37 | dependabot[bot] | +1/-34 | open PR #159 | ACTIVE | @radix-ui/react-select 2.3.7; tip b471d4b = PR head; verify FAIL (step not read) | **VERIFIED** |
| dependabot/npm_and_yarn/tailwind-merge-3.7.0 | 2026-09-21 | 37 | dependabot[bot] | +1/-34 | open PR #160 | ACTIVE | tailwind-merge 3.7.0; tip 5a78750 = PR head; verify FAIL (step not read) | **VERIFIED** |
| main (local) | 2026-10-23 | 5 | base44-builder[bot] | +0/-0 vs origin/main | tracks origin/main | KEEP | `main 1093787 [origin/main]` | **VERIFIED** |
| claude/compassionate-knuth-kolhx5 (local only) | 2026-10-23 | 5 | base44-builder[bot] | +0/-0 | == origin/main, no upstream | KEEP (current audit branch) | `* claude/compassionate-knuth-kolhx5 1093787`, not on remote | **VERIFIED** |

### 3.4 Cleanup commands (TEXT ONLY — none of this was run)

```sh
# 0. Preserve the one unmerged commit first (GIT-02)
git fetch origin
git switch -c docs/google-play-launch-gaps origin/main
git cherry-pick fdb586593823ed8f5c5f34f0a5573009de3f4fe1   # then edit the "racy binding" / "make testable" bullets for 43cb895
git push -u origin docs/google-play-launch-gaps             # open PR, squash-merge

# 1. Delete the 79 MERGED-DELETE-SAFE branches
#    (identical to "branches with a merged PR, minus amazing-cori"; tree-verified)
git push origin --delete \
  claude/ai-coach-premium-research-nbz9fn \
  claude/app-improvement-appeal-e4iuce \
  claude/coach-tier-premium-beta-p892pu \
  claude/coaching-tier-ui-workout-tracker-6004le \
  claude/codex-android-review-zem1sq \
  claude/issue-prioritization-tlk4mn \
  claude/observability-resilience-zem1sq \
  claude/optimistic-johnson-h2gazu \
  claude/premium-features-testing-unlock-wse2gu \
  claude/today-redesign-zem1sq \
  claude/wave1-habits-domain-zem1sq \
  claude/wave1-ref-live-split-zem1sq \
  claude/wave1-test-harness-zem1sq \
  codex/accessibility-semantics \
  codex/accessible-form-labels \
  codex/accessible-progress-share \
  codex/adaptive-meal-planning \
  codex/adaptive-training-blocks \
  codex/android-play-wrapper-1 \
  codex/base44-auth-bootstrap \
  codex/base44-oauth-consent \
  codex/base44-premium-release-flag \
  codex/base44-shared-function-code \
  codex/brand-logo-refresh-1 \
  codex/coach-action-eligibility-1 \
  codex/coach-shared-rate-limit \
  codex/custom-touch-targets \
  codex/dark-mode-row-control \
  codex/dedupe-default-habits \
  codex/dependency-policy \
  codex/eas-ios-testflight \
  codex/expo-ios-storekit-shell \
  codex/fitness-module-tests \
  codex/fix-sitemap-mime \
  codex/fix-today-calorie-source \
  codex/free-sleep-insights \
  codex/hero-premium-features \
  codex/idempotent-writes \
  codex/ios-entry-and-apple-auth \
  codex/ios-fullbleed-icon \
  codex/ios-layout-preferences \
  codex/ios-theme-controls \
  codex/itemized-food-diary \
  codex/launch-page-positioning \
  codex/light-gold-contrast \
  codex/live-frame-protection-verifier \
  codex/marketing-store-conversion \
  codex/mobile-tab-subroutes \
  codex/mobile-ux-hierarchy-1 \
  codex/mobile-webview-polish-1 \
  codex/more-page-semantics \
  codex/on-device-visual-progress \
  codex/play-release-readiness-1 \
  codex/premium-body-composition-scan \
  codex/premium-cta-names \
  codex/premium-entitlement-foundation \
  codex/premium-launch-runbook \
  codex/premium-product-previews \
  codex/progress-linear-trends \
  codex/progress-sections \
  codex/promo-premium-section \
  codex/public-seo-indexing \
  codex/react-vendor-chunk \
  codex/rebrand-recompone \
  codex/recommendation-correctness \
  codex/reduced-motion \
  codex/refresh-postcss-security \
  codex/release-stabilization \
  codex/repair-analysis-image-security-oracle \
  codex/restore-release-gates-seo \
  codex/route-accessibility-polish-1 \
  codex/system-theme-default \
  codex/today-first-viewport \
  codex/today-progressive-disclosure \
  codex/todays-best-move-1 \
  codex/touch-target-primitives \
  codex/type-token-unification \
  codex/weekly-autopilot-review \
  codex/workout-history-reuse

# 2. After the GIT-02 PR merges
git push origin --delete claude/amazing-cori-t2evjc

# 3. Prune local remote-tracking refs
git fetch --prune origin

# 4. Dependabot (Dependabot deletes its own branch when the PR closes)
gh pr close 167 --comment "Superseded: init+analyze must move together (see #137)"
gh pr close 168 --comment "Superseded: init+analyze must move together (see #137)"
gh pr close 177 --comment "Tailwind 4 is a major migration; postcss.config.js still uses the v3 plugin"
# #196: carry on a human branch with the xcode 4 / uuid override + test update, then close #196 as superseded
# #148, #159, #160, #170, #192, #195: "Update branch" once main is green, then re-evaluate

# 5. Do NOT delete: main, base44-builder
#    (.github/workflows/ci.yml:12, codeql.yml:10, base44-builder-pr.yml:27 and
#     tests/security/repository-policy.test.js:180-189 key on it)
# Optional, before re-pointing the Builder at it:
git push origin origin/main:refs/heads/base44-builder

# 6. Repo setting (UI): Settings -> General -> "Automatically delete head branches" = on
# 7. Tag shipped native builds (GIT-10), e.g.:
git tag ios-build-6 7e6e81c && git push origin ios-build-6
```

---

## 4. Dead code

### 4.1 Findings

### DEAD-01 242 opacity-modifier class usages emit no CSS, so tints, hover states and translucent bars render without colour
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - **Cause.** tailwind.config.js:12-78 defines every theme colour as a bare `var()`, for example `teal: 'var(--teal)'` (:60), `panel: 'var(--panel)'` (:55) and `primary: { DEFAULT: 'var(--primary)' }` (:24). src/index.css:58 holds the hex value: `--teal: #12836f;`. Tailwind 3 cannot apply a `/NN` modifier to a `var()` colour that has no `<alpha-value>`.
  - **Built CSS.** 0 matches for `bg-teal\/10`, `bg-panel\/95` and `hover\:bg-primary\/90`. 1 match for `bg-black\/50`. `.bg-teal{background-color:var(--teal)}` exists.
  - **Independent compile.** The same classes produce NO CSS.
  - **Scope.** 78 distinct `<utility>-<colour>/<n>` tokens appear in src, and 58 of them emit nothing. That is 242 usages in 73 files, or 50 distinct classes once variant prefixes are stripped.
  - **Top offenders.** `bg-teal/10` ×48 (re-counted), `bg-teal/15` ×32, `border-teal/40` ×25, `border-teal/30` ×17, `bg-destructive/10` ×9.
  - **Visible cases:**
    - src/components/AppLayout.jsx:82 `…border-t border-line bg-panel/95 backdrop-blur…` is the fixed bottom nav.
    - src/components/ChildTopBar.jsx:14 `sticky top-0 … bg-bg/95 backdrop-blur`.
    - src/components/seo/SeoShell.jsx:73 (`bg-bg/85`), src/components/LegalShell.jsx:46 and src/pages/Hero.jsx:60 (`bg-bg/80`).
    - src/components/ui/button.jsx:13,15,19: `hover:bg-primary/90`, `hover:bg-destructive/90` and `hover:bg-secondary/80` are all no-ops.
  - **History.** The `var()` palette arrived in 773ff44 (2026-07-28). The root commit 8bfec9a has no `teal` token.
- Impact: Every `/NN` chip, badge, selected state and border tint renders transparent. The bottom nav and 4 sticky headers are see-through apart from the blur. The default, destructive and secondary buttons have no hover feedback. Lint, tests and the build all pass.
- Fix: store channels in CSS vars and define tokens as `rgb(var(--teal-rgb) / <alpha-value>)`, or use `color-mix()`. Then spot-check the 73 files. Effort: <1d

### DEAD-02 Eight more classes are no-ops: shades of overridden palette colours and a missing keyframe
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - `extend.colors.orange` and `.red` are plain strings (tailwind.config.js:65-66), so they replace the default `orange-*` and `red-*` scales. Affected classes:
    - src/components/UserNotRegisteredError.jsx:8-9: `bg-orange-100`, `text-orange-600`.
    - src/lib/PageNotFound.jsx:46-47: `bg-orange-100`, `bg-orange-400`.
    - src/components/ui/toast.jsx:70: `group-[.destructive]:text-red-300`, `hover:text-red-50`, `focus:ring-red-400`, `focus:ring-offset-red-600`.
  - src/components/ui/input-otp.jsx:59 uses `animate-caret-blink`, but the built CSS has only `@keyframes enter|exit|ping|pulse|spin`.
  - A full literal-class scan of 814 tokens found no other non-opacity no-op classes.
- Impact: The orange icon on "Access Restricted" and on the 404 admin note renders uncoloured. The OTP caret does not blink. The destructive toast close button loses its red tint and focus ring.
- Fix: use `text-orange` / `bg-orange/..` after the DEAD-01 fix, and add the shadcn `caret-blink` keyframes. Effort: <1h

### DEAD-03 Nine unreferenced files (823 lines); two test files still read them
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - knip-configured and knip-prod2 both list "Unused files (9)".
  - `rg -w <name>` over the repo finds no import, `lazy()` call or route string. The only hits are tests and comments:
    - tests/security/local-plan-cache.test.js:115 `read("src/components/onboarding/StepAbout.jsx")`.
    - tests/security/release-configuration.test.js:204 lists StepAbout in an `AdaptiveSelect` must-match loop.
    - release-configuration.test.js:212 lists SignalStat in a `doesNotMatch` loop over 9/10 px text.
    - :141 asserts that StreakBanner is *absent* from Today.
    - StreakChip.jsx:10 mentions "the legacy StreakBanner" in a comment.
  - The live onboarding step is StepAboutActivity (src/pages/Onboarding.jsx:18,384).
  - When each file went dead:
    - b666bc8 (#89, 2026-08-16) removed the imports of StepWelcome, StepAbout, StepActivity and StepCoaching.
    - RatingDrawer: 6aa5347.
    - StreakBanner: 135be9e.
    - SignalStat: 27c8fa8 (#119).
    - use-size.jsx was orphaned when fbea2e4 (#136, 2026-09-14) deleted its only importer, src/components/ui/image.jsx.
  - Line counts: 22 + 176 + 53 + 70 + 39 + 54 + 141 + 28 + 240 = 823 (`wc -l`).
- Impact: Two green assertions guard a file the app never renders. Deleting the files as they stand breaks 2 test files.
- Fix: retarget local-plan-cache.test.js:115 and release-configuration.test.js:204 to StepAboutActivity.jsx, drop the SignalStat path from :212, then delete the 8 non-OAuth files (583 lines). Effort: <1h

### DEAD-04 OAuthConsent.jsx is unrouted, but Base44 Builder re-creates it every time it is deleted
- Tag: **VERIFIED** (unreachable; history) / **SUSPECTED** (whether the platform needs it)
- Severity: Low
- Also reported as FE-11 (frontend dossier).
- Evidence:
  - src/pages/OAuthConsent.jsx is 240 lines (`export default function OAuthConsent()` :14).
  - `rg -i 'oauth|consent'` over src/App.jsx, src/main.jsx, index.html and base44/config.jsonc returns 0 hits.
  - The only other repo reference is docs/remediation-plan.md:121.
  - Its header (:7-8) cites `base44/mcp/config.json`, but `ls base44` shows only auth, config.jsonc, connectors, entities, functions and shared.
  - `git log --all --name-status` history:
    - A cb39d78 (#55)
    - D 1c99808 (#86)
    - **A 46ef650** (base44-builder[bot], "chore: add boilerplate auth templates")
    - D 921fa4f (#172)
    - **A 4336ca3** (base44-builder[bot])
  - It carries 2 of the 7 warnings hidden by `--quiet`: unused catch vars at :75 and :116.
- Impact: A third deletion will probably be undone. Meanwhile the file adds 240 lines of noise to every audit.
- Fix: keep it, add it to a committed knip `ignore`, and ask Base44 how to opt out of the auth template. Effort: <1h

### DEAD-05 Three fitness modules are dead or test-only but hidden from knip by the `export *` barrel
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - src/lib/fitness/index.js has `export * from "./adaptiveGoalEngine"` (:9), `"./mealPlanning"` (:12) and `"./nasmKnowledgeBase"` (:21). That makes these files "reachable", so knip lists only their exports.
  - **mealPlanning.js (42 lines).** All 3 exports (:5, :20, :33) have 0 references outside the file.
  - **nasmKnowledgeBase.js (156 lines).** All 4 exports (:8, :71, :98, :136) are dead. The header at :5-6, "Used by the adaptive training block generator", is false.
  - **NASM data still ships.** Its top-level `Object.freeze(...)` data is not tree-shaken: the `stabilization_endurance` string appears in tooling: dist/assets/RecompContext-BaLxye1K.js (77,720 B), about 2,350 B of it. RecompContext loads for every authenticated route.
  - **adaptiveGoalEngine.js (126 lines).** `estimateObservedTdee` (:41) and `buildAdaptiveGoalPlan` (:80) have no production caller. They are imported only by tests/fitness/fitness-engine.test.js:6 and tests/fitness/adaptive-goal-engine.test.js:4.
- Impact: 324 lines that read as an "adaptive goal engine" and "NASM grounding" never run in the app. About 2.35 kB of dead data is downloaded on every authenticated load.
- Fix: delete mealPlanning.js and nasmKnowledgeBase.js together with index.js:12 and :21. Either wire adaptiveGoalEngine in or delete it along with its 2 tests. Effort: <1h (delete) / >1d (wire in)

### DEAD-09 Two deployed backend functions have no caller in the repo
- Tag: **VERIFIED** (no caller in repo) / **SUSPECTED** (no external caller)
- Severity: Low
- Evidence:
  - A quoted-name search ``rg "[\"'`]<fn>[\"'`]"`` over src, expo-ios/src, expo-ios/App.tsx, public, index.html and scripts finds a reference for 22 of the 25 functions (re-run for this document). The three with 0 hits:
    - **appleStoreNotification.** Legitimate: it is the App Store webhook (docs/apple-premium-launch.md:71).
    - **registerPushToken** (77 lines). It writes PushDevice at base44/functions/registerPushToken/entry.ts:50-64. docs/features/reminders-and-integrations.md:7 says "Server push plumbing exists, but nothing uses it".
    - **verifyGooglePlayPurchase** (237 lines), plus base44/shared/googlePlayPurchaseDomain.js (148 lines). The only Play-related match in src is the store link `GOOGLE_PLAY_URL` (src/pages/ComingSoon.jsx:6,215,217). docs/premium-testing-and-launch.md:57 calls it "already scaffolded".
- Impact: 462 lines of deployed, authenticated, publicly invokable endpoints have no product path. registerPushToken stores device tokens for no purpose.
- Fix: delete registerPushToken and its PushDevice writes if reminders stay local. Keep verifyGooglePlayPurchase only if Play billing is scheduled, and land GIT-02 either way. Effort: <1h each

### DEAD-10 Four entities have no live writer
- Tag: **VERIFIED** (repo; all branches for CoachConversation) / **SUSPECTED** (production rows)
- Severity: Low
- Evidence:
  - **CoachConversation** (base44/entities/CoachConversation.jsonc:2):
    - There are 0 `entities.CoachConversation` calls, and `git log --all -S'entities.CoachConversation'` returns 0 commits.
    - The only references are the deletion cascade (base44/shared/accountDeletionDomain.js:39) and the export label (src/pages/YourData.jsx:32).
    - It was introduced in 060115d (#73) and never wired up.
  - **LifestyleProfile.** Its only writes are base44/functions/lifestyleCoachReply/entry.ts:168 and :170, which are unreachable (DEAD-06).
  - **PushDevice.** Its only writer is registerPushToken/entry.ts:50-64, which has no caller (DEAD-09).
  - **WaitlistEntry.** It has no writer today. joinWaitlist history:
    - Removed in e38905c (#69).
    - Restored the same day by the revert fe5d4d6 (#71).
    - Given a Gmail welcome email in ed9ab25.
    - Deleted by base44-builder in e7e92e0 (2026-09-10).
  - WaitlistEntry is still exported and deleted (accountDeletionDomain.js:55, YourData.jsx:40), and tests/security/repository-policy.test.js:63-68 keeps it admin-only.
- Impact: Four schemas widen the export, delete and RLS review surface for data that no live code path produces.
- Fix: check production row counts. Drop CoachConversation if it has 0 rows. Keep WaitlistEntry until legacy rows are purged. Effort: <1h

### DEAD-11 Unused dependencies, their leftover config, and one used-but-undeclared dependency
- Tag: **VERIFIED**
- Severity: Low
- Evidence (knip and depcheck agree, and rg over src, tests, scripts and base44 finds 0 imports):
  - **`@hookform/resolvers`** (package.json:25; 2.3 MB).
    - Its peer `react-hook-form` was removed from package.json in afd0fc4 (base44-builder, 2026-09-15).
    - The peer is still installed: package-lock.json:6440-6446 has `react-hook-form` 7.88.0 with `"peer": true`, another 2.3 MB (R2).
  - **`@radix-ui/react-accordion`** (package.json:26; 804 kB). Its leftover config is the `accordion-down/up` keyframes and animations at tailwind.config.js:90-103, which have 0 uses; the built CSS has 0 "accordion".
  - **`cmdk`** (package.json:40; 124 kB). Its only trace is eslint.config.js:55 `ignore: ["cmdk-input-wrapper", "toast-close"]`. The `toast-close` entry is still live (toast.jsx:74).
  - **`baseline-browser-mapping`** (devDep, package.json:61; 160 kB).
    - It has 0 imports and is already pulled in transitively through browserslist (package-lock.json:3196).
    - It has been a direct devDep since 8bfec9a. It may be pinned on purpose to silence that package's stale-data warning (**SUSPECTED** intent).
  - **Reverse gap: `esbuild`.**
    - tests/e2e/meal-speech-input.spec.js:2 has `import { build } from "esbuild";`.
    - `node_modules/esbuild` does not exist, so tooling: e2e.txt shows "Cannot find package 'esbuild'" and `e2e exit=1`.
    - The CI failure at the earlier expo-doctor step masks this (tooling: README). This half is High and tracked as DEP-01 / TEST-01; the Low rating here applies to the unused packages.
  - The expo-ios dependencies are all referenced or required by convention: expo-dev-client is used via `--dev-client` (expo-ios/package.json:7) and eas.json:8, and react-native-nitro-modules is a peer of react-native-iap.
- Impact: About 5.7 MB of node_modules (including the orphaned peer) for code that never runs. Three of the four appear in tooling: npm-outdated.txt, which generates Dependabot noise. The entire Playwright suite cannot load.
- Fix: `npm rm @hookform/resolvers @radix-ui/react-accordion cmdk`, then drop tailwind.config.js:90-103 and the `cmdk-input-wrapper` ignore. Run `npm i -D esbuild`. Decide deliberately whether to keep `baseline-browser-mapping`. Effort: <1h

### DEAD-12 Dead config: nonexistent paths, an inert legacy-SDK shim, and an orphaned Gmail send connector
- Tag: **VERIFIED** (repo) / **SUSPECTED** (whether the Gmail grant is still active on the platform)
- Severity: Low
- Also reported as B44-11/BE-11 (doc 03) and SEC-16 (security dossier).
- Evidence:
  - **Nonexistent paths.**
    - eslint.config.js:12 and jsconfig.json:19 list `src/Layout.jsx`, and jsconfig.json:20 excludes `src/vite-plugins`. `ls` reports "No such file or directory" for both.
  - **Inert legacy-SDK shim.**
    - vite.config.js:18 sets `legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'`.
    - Nothing in the repo sets that variable. Its only hits are vite.config.js:18 and doc 03.
    - The shim would be inert even if set: there are 0 `@/entities|@/integrations|@/agents|@/functions` imports, and 0 `process.env` uses in src.
  - **Orphaned Gmail connector.**
    - base44/connectors/gmail.jsonc requests `"https://www.googleapis.com/auth/gmail.send"`.
    - base44-builder added it in eb32616 (2026-08-27). Its only consumer was joinWaitlist's `connectors.getConnection("gmail")` (ed9ab25), which e7e92e0 deleted on 2026-09-10.
    - `rg 'connectors\.|getConnection' src base44 expo-ios/src` returns 0 hits.
- Impact: The lint and typecheck globs look broader than they are. A send-mail OAuth scope has been granted for no feature since 2026-09-10, which widens what a compromised app identity could do.
- Fix: remove the dead globs and `legacySDKImports`. Delete base44/connectors/gmail.jsonc and revoke the grant in Base44. Effort: <1h

### DEAD-13 Unused theme tokens in tailwind.config.js and index.css
- Tag: **VERIFIED**
- Severity: Info
- Evidence (0 class uses and 0 `var(--x)` uses outside src/index.css):
  - `sidebar` colours (tailwind.config.js:69-78), plus 16 vars (src/index.css:42-49, :95-102).
  - `yellow` (tailwind.config.js:64; index.css:62,114).
  - `orange` (tailwind.config.js:65; index.css:63,115).
  - `fontFamily.heading` / `.display` (tailwind.config.js:81,83). The built CSS has 0 `.font-display` rules, and `font-heading` appears only as the var `--font-heading`.
  - `chart.1-5` as Tailwind colours (tailwind.config.js:46-52). The vars are used directly, e.g. src/components/progress/StrengthProgressChart.jsx:5.
- Impact: About 43 dead lines that mislead anyone choosing tokens.
- Fix: delete them during the DEAD-01 token rewrite. Effort: <1h

### DEAD-14 Two non-web PNGs (2.1 MB) are deployed to the web root, and the maskable icon reuses the "any" icon
- Tag: **VERIFIED** (references, sizes, md5) / **SUSPECTED** (launcher-specific cropping)
- Severity: Low
- Evidence:
  - **public/brand/recompone-mark-master.png (1,169,981 B).**
    - It is referenced only in docs: docs/play-store/README.md:15, docs/codex-handoff.md:38 and docs/improvement-plan.md.
    - It is present in tooling: dist/brand/ (R1).
    - docs/codex-handoff.md:38 records an owner decision to keep it: "Keep both brand PNGs … `recompone-mark-master.png` is the brand master."
  - **public/brand/recompone-app-icon-ios.png (947,690 B).** It is used only by expo-ios/app.json:10 and tests/security/ios-app-icon.test.js:8,14. It is an iOS build input that is also published on the web.
  - **Live brand assets.** recompone-logo-primary.png (index.html:45) and recompone-feature-1024x500.png (index.html:22,29) are referenced and live.
  - **Byte-identical duplicates (md5):**
    - d74cb558…: public/icons/recompone-512.png = public/icons/recompone-maskable-512.png (manifest `"purpose": "maskable"`) = docs/play-store/app-icon-512.png.
    - 898efc80…: public/brand/recompone-feature-1024x500.png = docs/play-store/feature-graphic-1024x500.png.
    - The docs/play-store copies are load-bearing: android/play-release.json:17, scripts/verify-android-release.mjs:236 and tests/security/android-release.test.js:126-127.
  - **Maskable icon.** It has a full-bleed navy background. A PIL measurement found 99.7% of the mark inside the 80% safe circle; only 155 px of the R's leg tip falls outside.
- Impact: 2.1 MB of non-web assets ship with every site build. Circular masks clip the very tip of the R, which is cosmetic only.
- Fix: move mark-master to docs/brand rather than deleting it, which honours the owner's "keep" decision. Move app-icon-ios to expo-ios/assets and update app.json and the test. Effort: <1h

### DEAD-15 The lint and typecheck configs hide exactly the dead-code classes this inventory found
- Tag: **VERIFIED**
- Severity: Medium (same root cause as FE-04 / QUAL-01 / QUAL-02, all Medium)
- Evidence:
  - **ESLint scope.** eslint.config.js:9-14 applies rules only to src/components and src/pages (plus the nonexistent src/Layout.jsx), and ignores `src/lib/**` and `src/components/ui/**`.
  - **Suppressed warnings.** `unused-imports/no-unused-vars` is `"warn"` (:42-43), and package.json:9 runs `"lint": "eslint . --quiet"`, which drops warnings.
    - Running the repo's own `eslint .` without `--quiet` gives 7 warnings: 3 unused catch vars (SessionBuilder.jsx:139; OAuthConsent.jsx:75,116) and 4 unused disable directives.
  - **Scratch scan** over the wider tree found:
    - base44/shared/weeklyAutopilotDomain.js:2 `const DAY_MS = 86_400_000;` is unused.
    - src/lib/fitness/calculators.js:151 `deficit` is unused, inside the dead `calculateSustainabilityScore` (:149).
    - src/components/ui/use-toast.jsx:85 `_clearFromRemoveQueue` is unused.
    - src/lib/telemetry.js:100,108 carry unused `no-console` disables.
  - **`tsc --noUnusedLocals`** found:
    - base44/functions/lifestyleCoachReply/entry.ts:28 `CONVERSATION_MESSAGES_LIMIT`.
    - base44/functions/searchFoods/entry.ts:2, which imports `OFF_BASE` but never uses it (`rg -w OFF_BASE` hits only line 2).
  - src/lib/haptics.js:9 `MEAL_LOGGED: HAPTIC_IMPACTS.LIGHT` has 0 uses.
  - Typecheck scope: jsconfig.json:19 includes `src/components/**/*.js` (not `.jsx`), and :20 excludes src/lib, src/api and src/components/ui.
- Impact: New dead code in src/lib, base44 or the UI kit never surfaces in CI, and warnings in the linted folders are suppressed.
- Fix: widen the eslint `files` to `src/**`, `base44/shared/**` and `scripts/**`. Make `no-unused-vars` an error or drop `--quiet`. Commit a knip config that ignores OAuthConsent.jsx and `src/components/ui/**` exports. Effort: <1d (matches FE-04; the config change alone is <1h)

### DEAD-V1 `react-hooks/exhaustive-deps` is never enabled, so its 2 suppressions are dead and hook dependencies go unchecked
- Tag: **VERIFIED**
- Severity: Medium (part of FE-04 / QUAL-01)
- Evidence:
  - eslint.config.js:34 loads `"react-hooks": pluginReactHooks`, but :57 enables only `"react-hooks/rules-of-hooks": "error"`.
  - src/components/nutrition/BarcodeScanner.jsx:211 and src/components/nutrition/FoodPhotoScan.jsx:83 both carry `// eslint-disable-next-line react-hooks/exhaustive-deps`. ESLint reports both as unused directives.
- Impact: No `useEffect`/`useCallback` dependency array in src is checked, so stale-closure bugs land unflagged.
- Fix: add `"react-hooks/exhaustive-deps": "warn"`, triage the hits, and keep the two justified suppressions. Effort: <1d

### DEAD-16 Stale documentation and comments about dead code
- Tag: **VERIFIED**
- Severity: Info
- Evidence:
  - docs/remediation-plan.md:121 still says "delete the dead `OAuthConsent.jsx`". That was done twice and undone twice (DEAD-04).
  - Misleading comments with no disclaimer:
    - src/lib/fitness/nasmKnowledgeBase.js:5-6 says "Used by the adaptive training block generator", which is false.
    - tests/fitness/height-round-trip.test.js:12 says "The bounds of the metric height input in StepAbout", which points at a dead file.
  - docs/improvement-plan.md cites deleted files (joinWaitlist, QuickLogCard, ui/chart.jsx, ui/sonner.jsx), but its reading note at :7 already declares it a pre-implementation snapshot, so that staleness is disclosed.
  - docs/security-audit.md:71 is stale (GIT-08).
- Impact: Readers are sent to deleted files and to fixes that already shipped.
- Fix: fix the two comments, and change remediation-plan.md:121 to "keep and knip-ignore". Effort: <1h

### 4.2 Dead code table (grouped)

Legend:
- **DEAD**: nothing in prod or tests uses it.
- **export-only**: the symbol is live in its own file and only the `export` keyword is unused.
- **TEST-ONLY**: only tests execute it.

"Safe to remove" assumes the prerequisites listed in the same cell.

#### Files

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| SignalStat (22 lines) | src/components/common/SignalStat.jsx:8 | knip unused file; no import/lazy/string ref; read by tests/security/release-configuration.test.js:212 | **VERIFIED** | Y, after dropping its path from the :212 list |
| StepAbout (176) | src/components/onboarding/StepAbout.jsx:23 | importer removed b666bc8 (#89); read by local-plan-cache.test.js:115 and release-configuration.test.js:204 | **VERIFIED** | Y, after retargeting those 2 tests to StepAboutActivity.jsx |
| StepActivity (53) | src/components/onboarding/StepActivity.jsx:11 | importer removed b666bc8; 0 refs | **VERIFIED** | Y |
| StepCoaching (70) | src/components/onboarding/StepCoaching.jsx:7 | importer removed b666bc8; 0 refs; sole user of `toneLabel` | **VERIFIED** | Y (then drop `toneLabel`) |
| StepWelcome (39) | src/components/onboarding/StepWelcome.jsx:4 | importer removed b666bc8; 0 refs | **VERIFIED** | Y |
| RatingDrawer (54) | src/components/today/RatingDrawer.jsx:16 | dead since 6aa5347; 0 refs; sole user of `DrawerClose` | **VERIFIED** | Y |
| StreakBanner (141) | src/components/today/StreakBanner.jsx:15 | replaced by StreakChip (comment StreakChip.jsx:10); test asserts its absence (release-configuration.test.js:141) | **VERIFIED** | Y |
| useSize hook file (28) | src/hooks/use-size.jsx:3 | orphaned by fbea2e4 (#136) deleting ui/image.jsx; 0 refs | **VERIFIED** | Y |
| OAuthConsent (240) | src/pages/OAuthConsent.jsx:14 | no route in App.jsx; re-added twice by base44-builder[bot] (46ef650, 4336ca3) | **VERIFIED** unreachable / **SUSPECTED** platform-required | N — Builder re-adds it; knip-ignore |
| mealPlanning.js (42, barrel-hidden) | src/lib/fitness/mealPlanning.js:5-42 | all 3 exports 0 refs; reachable only via index.js:12 `export *` | **VERIFIED** | Y (+ remove index.js:12) |
| nasmKnowledgeBase.js (156, barrel-hidden) | src/lib/fitness/nasmKnowledgeBase.js:8-156 | all 4 exports dead; about 2,350 B ships in RecompContext chunk | **VERIFIED** | Y (+ remove index.js:21) |
| adaptiveGoalEngine.js (126, barrel-hidden) | src/lib/fitness/adaptiveGoalEngine.js:41-126 | both exports prod-unused (knip-prod2); used by 2 test files | **VERIFIED** | N — product decision |
| PublicHome pass-through | src/components/PublicHome.jsx:1-5 | only `return <ComingSoon />`; pinned by tests/security/seo-indexability.test.js:144 (`assert.match(publicHome, /return <ComingSoon \/>/)`) | **VERIFIED** | N — harmless, test-pinned |
| VoiceInput (132) | src/components/VoiceInput.jsx | one importer (LifestyleCoach.jsx:20), rendered only after the kill switch (DEAD-06) | **VERIFIED** | N — goes with the DEAD-06 decision |

#### Exports — dead symbols, app code (19 knip rows, 18 distinct)

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `detectPlateau` | base44/shared/fitnessAdjustments.js:187 | 0 refs outside definition (rg -w, re-run) | **VERIFIED** | Y |
| `CHECK_IN_STATUSES` | base44/shared/weeklyCheckInDomain.js:20 | 0 refs outside definition | **VERIFIED** | Y |
| `toneLabel` | src/components/onboarding/constants.js:65 | only importer is dead StepCoaching.jsx:4 | **VERIFIED** | Y (with StepCoaching) |
| `TextField` | src/components/onboarding/Fields.jsx:47 | 0 refs outside definition | **VERIFIED** | Y |
| `ANALYSIS_URL_TTL_SECONDS` | src/lib/analysisImages.js:2 | 0 refs outside definition | **VERIFIED** | Y |
| `calculateSustainabilityScore` | src/lib/fitness/calculators.js:149 | 0 refs outside definition; contains unused local `deficit` :151 | **VERIFIED** | Y |
| `ADJUSTMENT_DECISIONS` (definition + barrel re-export) | src/lib/fitness/constants.js:51; src/lib/fitness/index.js:22 | only re-exported; nothing imports it | **VERIFIED** | Y |
| `rankFoodsForGoal`, `buildGroceryListFromRecipes`, `suggestRecipesFromPantry` | src/lib/fitness/mealPlanning.js:5,20,33 | 0 refs outside file | **VERIFIED** | Y (whole file, DEAD-05) |
| `NASM_PHASES`, `NASM_MOVEMENT_PATTERNS`, `selectNasmPhase`, `getNasmAcuteVariables` | src/lib/fitness/nasmKnowledgeBase.js:8,71,98,136 | 0 refs outside file (NASM_PHASES used only by the 2 dead functions) | **VERIFIED** | Y (whole file, DEAD-05) |
| `recalculateProjection` | src/lib/fitness/recalculate.js:76 | 0 refs outside definition | **VERIFIED** | Y |
| `summarizeTrainingLoad` | src/lib/fitness/trainingAnalysis.js:6 | 0 code refs; docs/improvement-plan.md mention only | **VERIFIED** | Y |
| `relativeDayLabel` | src/lib/loggingDateUtils.js:127 | 0 refs outside definition | **VERIFIED** | Y |
| `isIframe` | src/lib/utils.js:9 | `export const isIframe = window.self !== window.top;` 0 refs | **VERIFIED** | Y |

#### Exports — dead shadcn primitives (15 knip rows)

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription` | src/components/ui/card.jsx:70 | 0 refs outside file | **VERIFIED** | Y (vendor file; low value; `shadcn add` may re-add) |
| `DialogTrigger`, `DialogClose` | src/components/ui/dialog.jsx:103-104 | 0 code refs (DialogClose: docs mention only) | **VERIFIED** | Y (vendor; low value) |
| `DrawerClose`, `DrawerFooter` | src/components/ui/drawer.jsx:101,104 | DrawerClose's only importer is dead RatingDrawer.jsx; DrawerFooter 0 refs | **VERIFIED** | Y (vendor; low value) |
| `InputOTPSeparator` | src/components/ui/input-otp.jsx:77 | 0 refs outside file | **VERIFIED** | Y (vendor; low value) |
| `SelectGroup`, `SelectLabel`, `SelectSeparator` | src/components/ui/select.jsx:133,137,139 | 0 refs outside file | **VERIFIED** | Y (vendor; low value) |
| `SheetTrigger`, `SheetClose` | src/components/ui/sheet.jsx:118-119 | 0 code refs (SheetClose: docs mention only) | **VERIFIED** | Y (vendor; low value) |
| `ToastAction` | src/components/ui/toast.jsx:107 | 0 refs outside file | **VERIFIED** | Y (vendor; low value) |

#### Exports — export-only (73 knip rows: symbol live in-file, `export` unused)

Evidence for every row: in-file use at the cited lines, and 0 importers in `rg -w` over src, base44, tests, scripts, docs and expo-ios.

| Item | Location | Evidence (in-file use) | Confidence | Safe to remove |
|---|---|---|---|---|
| `normalizeDeletionEmail` | base44/shared/accountDeletionDomain.js:20 | :59 | **VERIFIED** | Y — drop `export` only |
| `EXPORT_FORMAT_VERSION`, `EXPORT_MAX_ROWS` | base44/shared/accountExportDomain.js:9,12 | :68; :38 | **VERIFIED** | Y — drop `export` only |
| `scaleMeal` | base44/shared/adaptiveMealPlanDomain.js:576 | :569, :977 | **VERIFIED** | Y — drop `export` only |
| `AI_REPORT_WINDOW_MS` | base44/shared/aiReportRateLimitDomain.js:9 | :39 | **VERIFIED** | Y — drop `export` only |
| `ANALYSIS_UPLOAD_ALLOWED_TYPES`, `ANALYSIS_UPLOAD_PURPOSES`, `MAX_ANALYSIS_FILE_URI_LENGTH`, `normalizeAnalysisUploadPurpose`, `normalizePhotoReferences` | base44/shared/analysisUploadDomain.js:12,17,20,54,75 | :43; :55; :63,:86; :66; :102,:122 | **VERIFIED** | Y — drop `export` only |
| `APPLE_LEAF_OID`, `APPLE_WWDR_INTERMEDIATE_OID` | base44/shared/appleJwsVerify.js:50,51 | :357; :353 | **VERIFIED** | Y — drop `export` only |
| `COACH_MESSAGE_MAX_LENGTH`, `COACH_HISTORY_ITEM_MAX_LENGTH`, `COACH_HISTORY_TOTAL_MAX_LENGTH` | base44/shared/coachDomain.js:11,13,14 | :87; :102; :107,:109 | **VERIFIED** | Y — drop `export` only |
| `parseTesterEmails`, `listAllEntitlements` | base44/shared/entitlementAccess.js:46,76 | :59; :115 (tests grep its source text only) | **VERIFIED** | Y — drop `export` only |
| `calculateTargetAdherence`, `calculateMinimumAdherence` | base44/shared/fitnessAdherence.js:56,63 | :75; :81,:86 | **VERIFIED** | Y — drop `export` only |
| `GOOGLE_PLAY_BINDING_PAGE_SIZE` | base44/shared/googlePlayPurchaseDomain.js:20 | :126 | **VERIFIED** | Y — drop `export` only |
| `LIFESTYLE_MESSAGE_MAX_LENGTH`, `LIFESTYLE_HISTORY_MAX_ITEMS`, `LIFESTYLE_HISTORY_ITEM_MAX_LENGTH`, `LIFESTYLE_HISTORY_TOTAL_MAX_LENGTH` | base44/shared/lifestyleCoachDomain.js:18-21 | :248; :254-255; :263; :268 (callers unreachable, DEAD-06) | **VERIFIED** | Y — drop `export` only |
| `DEFAULT_TIMEOUT_MS`, `round`, `pick` | base44/shared/openFoodFacts.js:5,7,13 | :54; :10,:38-45; :29,:38-45 | **VERIFIED** | Y — drop `export` only |
| `REFERRAL_CODE_PATTERN`, `REFERRAL_RANK_PAGE_SIZE` | base44/shared/referralDomain.js:4,14 | :22; :128,:131 | **VERIFIED** | Y — drop `export` only |
| `WEEKLY_CHECK_IN_RULE_VERSION`, `CHECK_IN_DECISIONS`, `CHECK_IN_TARGET_KEYS`, `checkInConfidence`, `proposalFingerprint`, `summarizeProposal` | base44/shared/weeklyCheckInDomain.js:18,22,27,116,196,207 | :176; :288; :75,:83,:257; :190; :193; :232 | **VERIFIED** | Y — drop `export` only |
| `CHECK_IN_LOG_LIMIT`, `APPLY_IN_FLIGHT_MS` | base44/shared/weeklyCheckInPersistence.js:34,39 | :49; :123 | **VERIFIED** | Y — drop `export` only |
| `chunkContainsTitle` | scripts/lib/android-release-checks.mjs:85 | :104 | **VERIFIED** | Y — drop `export` only |
| `applyLabel` | src/components/more/WeeklyCheckInReview.jsx:39 | :313 | **VERIFIED** | Y — drop `export` only |
| `AlertDialogPortal`, `AlertDialogOverlay` | src/components/ui/alert-dialog.jsx:107,108 | :11,:31,:40; :13,:25,:32 | **VERIFIED** | Y — drop `export` only (vendor) |
| `badgeVariants` | src/components/ui/badge.jsx:39 | :6, :36 | **VERIFIED** | Y — drop `export` only (vendor) |
| `DialogPortal`, `DialogOverlay` | src/components/ui/dialog.jsx:101,102 | :13,:35,:51; :17,:29,:36 | **VERIFIED** | Y — drop `export` only (vendor) |
| `DrawerPortal`, `DrawerOverlay` | src/components/ui/drawer.jsx:98,99 | :19,:38,:50; :23,:32,:39 | **VERIFIED** | Y — drop `export` only (vendor) |
| `SelectScrollUpButton`, `SelectScrollDownButton` | src/components/ui/select.jsx:140,141 | :34,:45,:76; :47,:58,:82 | **VERIFIED** | Y — drop `export` only (vendor) |
| `SheetPortal`, `SheetOverlay` | src/components/ui/sheet.jsx:116,117 | :15,:56,:66; :17,:29,:57 | **VERIFIED** | Y — drop `export` only (vendor) |
| `reducer` | src/components/ui/use-toast.jsx:93 | :153 | **VERIFIED** | Y — drop `export` only (vendor) |
| `PUBLIC_EXIT_PATHS`, `PUBLIC_AUTH_PATHS` | src/lib/androidBack.js:6,15 | :36; :42 | **VERIFIED** | Y — drop `export` only |
| `REPORT_MESSAGE_ID_MAX`, `boundedText` | src/lib/coachContract.js:9,21 | :90,:108; :86,:90,:94 | **VERIFIED** | Y — drop `export` only |
| `convertLbsToKg`, `convertInchesToCm`, `calculateStepTarget` | src/lib/fitness/calculators.js:30,34,91 | :39; :40; :120 | **VERIFIED** | Y — drop `export` only |
| `STALE_AFTER_DAYS` | src/lib/fitness/liftProgression.js:11 | :141 | **VERIFIED** | Y — drop `export` only |
| `calculateWeightVariance`, `estimateStepCalorieDelta` | src/lib/fitness/projections.js:40,62 | :103; :114 | **VERIFIED** | Y — drop `export` only |
| `ADULT_SLEEP_REFERENCE_HOURS`, `SLEEP_LOOKBACK_DAYS` | src/lib/fitness/sleep.js:8,9 | :26; :29 | **VERIFIED** | Y — drop `export` only |
| `isSessionCompleted` | src/lib/fitness/trainingBlockProgress.js:41 | :85 | **VERIFIED** | Y — drop `export` only |
| `ICON_MAP` | src/lib/habitIcons.js:3 | :16, :19 | **VERIFIED** | Y — drop `export` only |
| `MEAL_SPEECH_MAX_LENGTH` | src/lib/nativeSpeechBridge.js:1 | :15, :145 | **VERIFIED** | Y — drop `export` only |
| `NUTRITION_REPORT_PAGE_SIZE`, `NUTRITION_REPORT_MAX_RECORDS` | src/lib/nutritionReportData.js:4,5 | :12 | **VERIFIED** | Y — drop `export` only |
| `PROFILE_DRAFT_FIELDS`, `PREFERENCE_DRAFT_STRING_FIELDS`, `PREFERENCE_DRAFT_LIST_FIELDS` | src/lib/onboardingDraft.js:23,39,45 | :74; :85; :92 | **VERIFIED** | Y — drop `export` only |
| `knownRecipeNumber` | src/lib/recipeNutrition.js:10 | :17, :20, :43 | **VERIFIED** | Y — drop `export` only |
| `PUBLIC_CONTENT_PATHS` | src/lib/seo/publicRouteInventory.js:137 | :152 | **VERIFIED** | Y — drop `export` only |
| expo-ios: `AppleProductId`, `BridgeRequest`, `SubscriptionPeriod`; `BRIDGE_TIMEOUTS_MS` (not in knip, grep-only) | expo-ios/src/bridgeProtocol.ts:11,15,44; expo-ios/src/injectedBridge.ts:9 | used in-file only; 0 other importers | **VERIFIED** | Y — drop `export` (Info) |

#### Duplicate and test-only knip rows (2)

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| default export duplicating `QuickMealsContent` | src/components/today/QuickMealsCard.jsx:61 | knip duplicate export; only importer TodayMacroCard.jsx:10 uses named `{ QuickMealsContent }` | **VERIFIED** | Y — drop line 61 |
| `estimateUsage` [TEST-ONLY] | src/lib/progressPhotos.js:226 | tests/security/visual-progress.test.js:122 dynamic `import(…progressPhotos.js?fake=)`, then :126 | **VERIFIED** | N — keep as test seam or delete with the test |

#### Exports used only by tests (92 knip `--production` extras)

Unless noted, the evidence for each row is: knip-prod2 flags the export as unused in prod, the symbol is used inside its own file, and it is imported only by tests. Those are test seams, not dead code.

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `estimateObservedTdee`:41, `buildAdaptiveGoalPlan`:80 | src/lib/fitness/adaptiveGoalEngine.js | **prod-dead**: only tests/fitness/adaptive-goal-engine.test.js:4, fitness-engine.test.js:6 | **VERIFIED** | N — DEAD-05 decision |
| `normalizeCoachReply`:369-371 [wrapper] | base44/shared/coachDomain.js | used only by tests/security/ai-coach-backend.test.js:15; coachReply/entry.ts:10,159 uses `normalizeCoachReplyResult` | **VERIFIED** | Y, with the test update |
| `COACH_HISTORY_MAX_ITEMS`:12 | base44/shared/coachDomain.js | test seam | **VERIFIED** | N |
| `ACCOUNT_DELETION_CASCADE`:25, `NON_USER_DATA_ENTITIES`:69 | base44/shared/accountDeletionDomain.js | the latter is an intentional `Object.freeze({})` allowlist enforced by tests/security/account-deletion.test.js:49-61 | **VERIFIED** | N |
| `RecompProvider`:190 [export-only] | src/lib/RecompContext.jsx | used in-file :1911 `<RecompProvider key=…>`; no other importer | **VERIFIED** | Y — drop `export` only |
| `PLAN_ADJUSTMENT_RANGES`:293, `normalizePlanAdjustments`:313 | base44/shared/lifestyleCoachDomain.js | seams whose in-file callers are unreachable (DEAD-06) | **VERIFIED** | N — with DEAD-06 |
| `COACH_HOURLY_LIMIT`:5, `COACH_DAILY_LIMIT`:6, `AI_FEATURE_DAILY_CEILINGS`:61, `rankReservation`:116 | base44/shared/coachRateLimitDomain.js | test seam | **VERIFIED** | N |
| `AI_REPORT_CATEGORIES`:8, `REPORTED_CONTENT_MAX_LENGTH`:17 | base44/shared/aiReportDomain.js | test seam | **VERIFIED** | N |
| `AI_REPORT_HOURLY_LIMIT`:8, `AI_REPORT_RANK_PAGE_SIZE`:13, `rankAiReport`:36 | base44/shared/aiReportRateLimitDomain.js | test seam | **VERIFIED** | N |
| `ANALYSIS_IMAGE_MAX_BYTES`:1 | src/lib/analysisImages.js | test seam | **VERIFIED** | N |
| `APPLE_ROOT_CA_G3_B64`:25, `parseCertificate`:158, `derEcdsaSignatureToRaw`:248 | base44/shared/appleJwsVerify.js | test seam | **VERIFIED** | N |
| `APPLE_STORE_PRODUCTS`:24, `parseIdAllowlist`:116 | base44/shared/premiumDomain.js | test seam | **VERIFIED** | N |
| `CM_PER_INCH`:7 | src/lib/heightConversion.js | test seam | **VERIFIED** | N |
| `COACH_MESSAGE_MAX`:1, `COACH_HISTORY_MAX`:2, `COACH_HISTORY_CONTENT_MAX`:3, `COACH_HISTORY_TOTAL_MAX`:4, `COACH_REPLY_SUMMARY_MAX`:7, `REPORT_REASON_MAX`:8, `REPORT_CONTENT_MAX`:10, `clipAtWord`:33, `toCoachHistory`:53 | src/lib/coachContract.js | test seam | **VERIFIED** | N |
| `TIP_SLUGS`:5, `COMPARISON_SLUGS`:24, `LOCATION_SLUGS`:43 | src/lib/seo/publicRouteInventory.js | test seam | **VERIFIED** | N |
| `HABIT_ENTRY_FIELDS`:31, `DAILY_LOG_INCREMENT_FIELDS`:38 | base44/shared/trackingRecordDomain.js | test seam | **VERIFIED** | N |
| `DAILY_LOG_NUMBER_RANGES`:10, `formNumber`:15 | src/lib/dailyLogForm.js | test seam | **VERIFIED** | N |
| `ENTITLEMENT_PAGE_SIZE`:19, `MAX_ENTITLEMENT_RECORDS`:20, `TESTER_FULL_RECORD`:34, `isPremiumTester`:58 | base44/shared/entitlementAccess.js | test seam | **VERIFIED** | N |
| `ENTRY_PAGE_SIZE`:13, `assignSystemKey`:57 | base44/shared/defaultHabitsProvisioning.js | test seam | **VERIFIED** | N |
| `REVOKE_TYPES`:12, `EXPIRE_TYPES`:13 | base44/shared/appleNotificationDomain.js | test seam | **VERIFIED** | N |
| `EXPORT_PAGE_SIZE`:10 | base44/shared/accountExportDomain.js | test seam | **VERIFIED** | N |
| `GOOGLE_PLAY_SOURCE`:15, `rankGooglePlayBinding`:42 | base44/shared/googlePlayPurchaseDomain.js | test seam (module itself has no prod caller, DEAD-09) | **VERIFIED** | N |
| `LEGACY_ONBOARDING_DRAFT_KEY`:15, `ONBOARDING_DRAFT_PREFIX`:16, `sanitizeOnboardingDraft`:100, `onboardingDraftKey`:116 | src/lib/onboardingDraft.js | test seam | **VERIFIED** | N |
| `MANUAL_TARGET_KEYS`:35 | src/lib/fitness/recalculate.js | test seam | **VERIFIED** | N |
| `MAX_ANALYSIS_PHOTO_REFERENCES`:19, `assertOwnedPhotoReferences`:98 | base44/shared/analysisUploadDomain.js | test seam | **VERIFIED** | N |
| `MEAL_PLAN_CALORIE_FLOOR`:6, `swapMeal`:486 | base44/shared/adaptiveMealPlanDomain.js | test seam | **VERIFIED** | N |
| `OwnerScopeError`:8 | base44/shared/ownerScope.js | test seam | **VERIFIED** | N |
| `PLAN_TARGET_FIELDS`:8, `PlanSettingsError`:16 | src/lib/planSettings.js | test seam | **VERIFIED** | N |
| `REFERRAL_ATTRIBUTION_WINDOW_MS`:9, `rankReferralAttribution`:65 | base44/shared/referralDomain.js | test seam | **VERIFIED** | N |
| `blockWeekFor`:24 | src/lib/fitness/trainingBlockProgress.js | test seam | **VERIFIED** | N |
| `sanitizeProps`:20, `redactText`:37, `buildErrorPayload`:48, `buildEventPayload`:63, `telemetryEnabled`:74 | src/lib/telemetry.js | test seam | **VERIFIED** | N |
| `frameAncestorsDirectives`:12, `isRestrictiveFrameAncestors`:27, `cspBlocksThirdPartyFraming`:40, `bundleDeclaresRoute`:71 | scripts/lib/android-release-checks.mjs | test seam | **VERIFIED** | N |
| `calculateWeightTrend`:26, `calculateProjectionConfidence`:50, `generateMilestoneForecasts`:67 | src/lib/fitness/projections.js | test seam | **VERIFIED** | N |
| `enabledFromEnvironment`:3 | src/lib/featureFlags.js | test seam | **VERIFIED** | N |
| `fetchNutritionReportEntity`:11 | src/lib/nutritionReportData.js | test seam | **VERIFIED** | N |
| `goalDirection`:20 | src/lib/fitness/progressInsights.js | test seam | **VERIFIED** | N |
| `importWithRetry`:15 | src/lib/lazyWithRetry.js | test seam | **VERIFIED** | N |
| `inRange`:20 | src/lib/biometricRanges.js | test seam | **VERIFIED** | N |
| `sortPhotosNewestFirst`:86, `meta`:138 | src/lib/progressPhotos.js | test seam | **VERIFIED** | N |
| `normalizeMealTranscript`:13 | src/lib/nativeSpeechBridge.js | test seam | **VERIFIED** | N |
| `normalizeStoreUrl`:6 | src/lib/storeLinks.js | test seam | **VERIFIED** | N |
| `nutritionValue`:21 | src/lib/nutritionReport.js | test seam | **VERIFIED** | N |
| `rebalanceMacrosForCalories`:36 | base44/shared/fitnessAdjustments.js | test seam | **VERIFIED** | N |
| `reconcileGroceryChecks`:9 | src/lib/useRecipeGroceryChecks.js | test seam | **VERIFIED** | N |
| `verifyHabitOwnership`:31 | base44/shared/trackingRecordPersistence.js | test seam | **VERIFIED** | N |
| expo-ios: `NATIVE_AUTH_RETURN_PATH`:22, `safeReturnPath`:60 | expo-ios/src/nativeAuth.ts | used in-file (:81; :80,:105) and by tests/security/ios-native-auth.test.js:8,11 | **VERIFIED** | N |

#### Functions and locals inside live files

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| unused local `DAY_MS` | base44/shared/weeklyAutopilotDomain.js:2 | eslint no-unused-vars; `rg -w DAY_MS` hits only :2 | **VERIFIED** | Y |
| unused local `deficit` | src/lib/fitness/calculators.js:151 | eslint; inside dead `calculateSustainabilityScore` | **VERIFIED** | Y (delete the function) |
| unused local `_clearFromRemoveQueue` | src/components/ui/use-toast.jsx:85 | eslint; shadcn vendor | **VERIFIED** | Y (low value) |
| unused const `CONVERSATION_MESSAGES_LIMIT` | base44/functions/lifestyleCoachReply/entry.ts:28 | tsc TS6133 `entry.ts(28,7)` | **VERIFIED** | Y |
| unused import `OFF_BASE` | base44/functions/searchFoods/entry.ts:2 | tsc TS6133; `rg -w OFF_BASE` in that file hits only :2 | **VERIFIED** | Y |
| unused trigger key `MEAL_LOGGED` | src/lib/haptics.js:9 | 0 uses; no food-log path fires a haptic | **VERIFIED** | Y, or wire the meal-logged haptic |
| unused eslint-disable directives | src/lib/telemetry.js:100,108 | eslint "Unused eslint-disable directive" | **VERIFIED** | Y |
| dead `exhaustive-deps` suppressions | src/components/nutrition/BarcodeScanner.jsx:211; src/components/nutrition/FoodPhotoScan.jsx:83 | rule never enabled (eslint.config.js:57) | **VERIFIED** | N — enable the rule (DEAD-V1) |
| unused catch vars (hidden by `--quiet`) | src/components/training/SessionBuilder.jsx:139; src/pages/OAuthConsent.jsx:75,116 | repo `eslint .` without `--quiet` | **VERIFIED** | Y (trivial) |
| any other unused top-level function or component | src/**, base44/shared/** | eslint `no-unused-vars` vars:all: none beyond the rows above | **VERIFIED** | n/a |

#### Hooks

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `useSize` | src/hooks/use-size.jsx:3 | knip unused file; `rg -w useSize` hits only the file itself | **VERIFIED** | Y |
| `useIsMobile` | src/hooks/use-mobile.jsx | used by src/components/ui/adaptive-select.jsx | **VERIFIED** | N — live |

#### CSS / Tailwind

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| 50 no-op opacity classes (58 with variant prefixes; 242 uses, 73 files) | tailwind.config.js:12-78; e.g. src/components/AppLayout.jsx:82, ChildTopBar.jsx:14, ui/button.jsx:13,15,19 | absent from built CSS; compile emits NO CSS | **VERIFIED** | N — fix the token format (DEAD-01) |
| `bg-orange-100`, `text-orange-600` | src/components/UserNotRegisteredError.jsx:8-9 | orange scale overridden (tailwind.config.js:65); 0 in built CSS | **VERIFIED** | Y / replace |
| `bg-orange-100`, `bg-orange-400` | src/lib/PageNotFound.jsx:46-47 | same | **VERIFIED** | Y / replace |
| `text-red-300`, `hover:text-red-50`, `ring-red-400`, `ring-offset-red-600` | src/components/ui/toast.jsx:70 | red scale overridden (tailwind.config.js:66) | **VERIFIED** | Y / replace |
| `animate-caret-blink` | src/components/ui/input-otp.jsx:59 | no keyframe; 0 in built CSS | **VERIFIED** | N — add keyframe |
| `accordion-down/up` keyframes and animations | tailwind.config.js:90-103 | 0 uses; dep unused | **VERIFIED** | Y |
| colours `sidebar.*` + 16 `--sidebar-*` vars | tailwind.config.js:69-78; src/index.css:42-49,95-102 | 0 uses | **VERIFIED** | Y |
| colour `yellow` + `--yellow` | tailwind.config.js:64; src/index.css:62,114 | 0 uses | **VERIFIED** | Y |
| colour `orange` + `--orange` | tailwind.config.js:65; src/index.css:63,115 | 0 bare uses (only no-op `orange-NNN`) | **VERIFIED** | Y |
| fontFamily `heading`, `display` + vars | tailwind.config.js:81,83; src/index.css:38,40 | 0 class uses; 0 `.font-display` rules in built CSS | **VERIFIED** | Y |
| colours `chart.1-5` as classes | tailwind.config.js:46-52 | 0 class uses; vars used via `var(--chart-n)` | **VERIFIED** | Y (keep vars) |
| `.no-scrollbar` | src/index.css:5-8 | used in Coach.jsx, LifestyleCoach.jsx, QuickMealsCard.jsx | **VERIFIED** | N — live |
| fontSize `micro`, `label` | tailwind.config.js:86-89 | 4 and 42 uses | **VERIFIED** | N — live |

#### Assets

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| recompone-mark-master.png (1,169,981 B) | public/brand/recompone-mark-master.png | docs-only refs; ships in build (tooling: dist/brand, R1); owner "keep" (docs/codex-handoff.md:38) | **VERIFIED** | Y from public/ — move to docs/brand, do not delete |
| recompone-app-icon-ios.png (947,690 B) | public/brand/recompone-app-icon-ios.png | only expo-ios/app.json:10 and tests/security/ios-app-icon.test.js:8,14 | **VERIFIED** | N — move with app.json + test update |
| recompone-maskable-512.png (duplicate of 512) | public/icons/recompone-maskable-512.png | md5 d74cb558… identical to recompone-512.png; 99.7% of mark inside safe circle | **VERIFIED** (launcher cropping **SUSPECTED**) | N — optional dedicated variant (Info) |
| docs/play-store/app-icon-512.png, feature-graphic-1024x500.png (duplicates) | docs/play-store/ | identical to public/ copies; used by android/play-release.json:17, scripts/verify-android-release.mjs:236, tests/security/android-release.test.js:126-127 | **VERIFIED** | N — load-bearing |
| recompone-logo-primary.png, recompone-feature-1024x500.png | public/brand/ | index.html:22,29,45 | **VERIFIED** | N — live |

#### Env vars

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `VITE_ENABLE_ITEMIZED_FOOD_DIARY` (set, never read) | playwright.config.js:67 | flag hard-coded at src/lib/featureFlags.js:27 | **VERIFIED** | Y |
| `BASE44_LEGACY_SDK_IMPORTS` (read, never set in repo) | vite.config.js:18 | 0 legacy imports to resolve | **VERIFIED** | Y |
| `APPLE_APP_ID` (documented, never read) | base44/functions/verifyApplePurchase/entry.ts:20 (comment); docs/apple-premium-launch.md:62 | no code reads it | **VERIFIED** | Y (doc only; the Secret may stay) |
| `VITE_APP_VERSION` (read, never set or documented) | src/lib/telemetry.js:11 | `rg` hits only this line | **VERIFIED** | N — set it from the git sha at build |
| `VITE_TELEMETRY_ENDPOINT`, `VITE_ENABLE_TELEMETRY` (read, set nowhere) | src/lib/telemetry.js:10; src/lib/featureFlags.js:22 | docs/codex-handoff.md:143 "It ships off" | **SUSPECTED** (build env not visible) | N — opt-in feature |
| `VITE_BASE44_FUNCTIONS_VERSION` (read, undocumented) | src/lib/app-params.js:80,105 → src/api/base44Client.js:9 | Base44 convention, injected by `base44 dev` | **SUSPECTED** | N |
| `ENABLE_BODY_COMPOSITION_SCAN`, `PREMIUM_TESTER_EMAILS` (via `Deno.env`, while README calls them Secrets) | base44/functions/getPremiumAccess/entry.ts:5-6; analyzeBodyComposition/entry.ts:27-28 | README.md:69-71; other secrets use `secrets.get` | **SUSPECTED** | N — verify the access path |
| other `VITE_*` (`APP_ID`, `APP_BASE_URL`, `GOOGLE_PLAY_URL`, `APP_STORE_URL`, scan flags, `WEEKLY_CHECK_IN_V2`) | featureFlags.js, storeLinks.js:22-30, app-params.js | read and documented | **VERIFIED** | N |

#### Entities and backend functions

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| CoachConversation | base44/entities/CoachConversation.jsonc:2 | 0 writers on any branch; only deletion/export refs (accountDeletionDomain.js:39, YourData.jsx:32) | **VERIFIED** repo / **SUSPECTED** prod rows | N until prod row count checked |
| LifestyleProfile | base44/entities/LifestyleProfile.jsonc | only writer lifestyleCoachReply/entry.ts:168,170, behind the kill switch | **VERIFIED** | N — feature decision |
| PushDevice | base44/entities/PushDevice.jsonc | only writer registerPushToken/entry.ts:50-64 (no caller) | **VERIFIED** | N — feature decision |
| WaitlistEntry | base44/entities/WaitlistEntry.jsonc:2 | writer joinWaitlist deleted in e7e92e0 (2026-09-10); kept for export/purge | **VERIFIED** | N — until legacy rows are purged |
| registerPushToken (77 lines) | base44/functions/registerPushToken/entry.ts | 0 quoted-name refs in src, expo-ios, public, index.html, scripts | **VERIFIED** repo / **SUSPECTED** external | Y if reminders stay local |
| verifyGooglePlayPurchase (237) + googlePlayPurchaseDomain.js (148) | base44/functions/verifyGooglePlayPurchase/entry.ts; base44/shared/googlePlayPurchaseDomain.js | 0 refs; "scaffolded" (docs/premium-testing-and-launch.md:57) | **VERIFIED** repo / **SUSPECTED** external | N — planned Play billing (GIT-02) |
| appleStoreNotification | base44/functions/appleStoreNotification/entry.ts | App Store webhook (docs/apple-premium-launch.md:71) | **VERIFIED** | N — webhook |
| lifestyleCoachReply | base44/functions/lifestyleCoachReply/entry.ts:71-74 | invoked (LifestyleCoach.jsx:165) but always 404 | **VERIFIED** | N — feature decision |
| other 21 functions / 21 entities | base44/functions/*, base44/entities/* | each has a string invoke or `entities.<Name>` use | **VERIFIED** | N |

#### Dependencies

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `@hookform/resolvers` (+ orphaned peer `react-hook-form` 7.88.0) | package.json:25; package-lock.json:6440-6446 | 0 imports; peer removed from package.json in afd0fc4 but still installed as `"peer": true` | **VERIFIED** | Y |
| `@radix-ui/react-accordion` | package.json:26 | 0 imports | **VERIFIED** | Y (+ tailwind.config.js:90-103) |
| `cmdk` | package.json:40 | 0 imports; only eslint.config.js:55 ignore entry | **VERIFIED** | Y (+ drop `cmdk-input-wrapper`) |
| `baseline-browser-mapping` (dev) | package.json:61 | 0 imports; transitive via browserslist (package-lock.json:3196) | **VERIFIED** unused / **SUSPECTED** intent | Y, deliberately |
| `esbuild` (unlisted) | tests/e2e/meal-speech-input.spec.js:2 | imported, not declared, not installed; e2e cannot load (tooling: e2e.txt) | **VERIFIED** | N — add to devDependencies |
| `autoprefixer`, `postcss` | package.json devDeps; postcss.config.js | depcheck false positive | **VERIFIED** | N |
| expo-ios deps | expo-ios/package.json | all referenced or convention-required (`--dev-client` :7 + eas.json:8; nitro is a react-native-iap peer) | **VERIFIED** | N |

#### Config

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `src/Layout.jsx` glob | eslint.config.js:12; jsconfig.json:19 | file does not exist | **VERIFIED** | Y |
| `src/vite-plugins` exclude | jsconfig.json:20 | directory does not exist | **VERIFIED** | Y |
| `legacySDKImports` option | vite.config.js:18 | inert (DEAD-12) | **VERIFIED** | Y |
| Gmail connector (`gmail.send`) | base44/connectors/gmail.jsonc | no consumer since e7e92e0 (2026-09-10) | **VERIFIED** repo / **SUSPECTED** platform grant | Y — and revoke the grant |
| `cmdk-input-wrapper` prop ignore | eslint.config.js:55 | cmdk unused | **VERIFIED** | Y (keep `toast-close`) |

---

## 5. Unreachable code, flags, commented-out blocks

### 5.1 Findings

### DEAD-06 Lifestyle Coach is hard-disabled by a constant, so about 494 lines are unreachable while its schema still ships eagerly
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - **The switch.** base44/shared/lifestyleCoachDomain.js:16 has `export const LIFESTYLE_COACH_ENABLED = false;`. It is a source constant with no env override, consumed at src/lib/featureFlags.js:34 as `lifestyleCoach: LIFESTYLE_COACH_ENABLED`. It is the only hard-coded `*_ENABLED` constant in src, base44, expo-ios and scripts (rg).
  - **Page.** src/pages/LifestyleCoach.jsx:204-206 has `if (!featureFlags.lifestyleCoach) { return <LifestyleCoachComingSoon onBack={goBack} />;`. Lines 208-456 (249 lines) never render.
  - **VoiceInput.** src/components/VoiceInput.jsx (132 lines) is rendered only after that guard.
  - **Backend.** base44/functions/lifestyleCoachReply/entry.ts:71-74 returns `{ status: 404 }` before doing any work, so :76-188 (113 lines) is unreachable. That includes the only LifestyleProfile writes (:168, :170).
  - **Entry points are stubs.** src/pages/More.jsx:222 has `badge: "Soon"`, and src/pages/Premium.jsx:68 has `to: featureFlags.lifestyleCoach ? "/more/coach/lifestyle" : null`.
  - **Eager bundle cost.** featureFlags.js:1 imports the 404-line domain module for one boolean. The eager tooling: dist/assets/AuthContext-DUTLrtI1.js (11,381 B, imported by index-*.js) contains "Conversational response — personal, specific, groun…" and `calorie_target:Object.freeze({min:1500`.
  - **History.** The UI kill switch dates from 0761b94 (base44-builder, 2026-08-31). The shared constant dates from 921fa4f (#172).
- Impact: The code is maintained, tested (tests/security/lifestyle-coach-safety.test.js) and deployed, but unreachable. The live endpoint always returns 404, and every page load downloads the unused schema.
- Fix: move `LIFESTYLE_COACH_ENABLED` into its own tiny shared module so the frontend stops importing the domain file. Then decide whether to keep or drop the feature. Effort: <1h

### DEAD-07 `itemizedFoodDiary` is hard-coded `true`, so its legacy else-branches are dead
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/featureFlags.js:27 has `itemizedFoodDiary: true,` (since b769a03, base44-builder, 2026-09-11). It gates 10 sites. The dead arms are:
  - src/pages/Nutrition.jsx:139-146: the `await upsertDailyLog(selectedDate, null, { increments: …` fall-through after `if (featureFlags.itemizedFoodDiary) { return logFoodEntry(…) }` at :130.
  - src/pages/Nutrition.jsx:435-455: the legacy "Recent foods" card in the `: foods.length > 0 && (` arm of the :411 ternary.
  - src/lib/RecompContext.jsx:355, :432, :500: the `: Promise.resolve([])` arms.
  - src/lib/RecompContext.jsx:1594-1603: `if (!featureFlags.itemizedFoodDiary) { await adjustDailyNutrition(…); … return; }`.
  - src/components/nutrition/FoodEntryComposer.jsx:137-144: the `} else {` arm after :135.
  - playwright.config.js:67 sets `VITE_ENABLE_ITEMIZED_FOOD_DIARY: "true"`, which no code reads.
- Impact: About 50 lines of a second nutrition write path that will never run but still shapes reviews and tests. The e2e env var is misleading.
- Fix: inline `true`, delete the else-arms and the flag key, and remove playwright.config.js:67. Effort: <1h

### DEAD-08 Build-time flags default off; their production state cannot be proven from the repo
- Tag: **SUSPECTED** (depends on the Base44 build env and Secrets)
- Severity: Info
- Evidence:
  - featureFlags.js:11-13, :16-18, :22 and :39 use `enabledFromEnvironment(import.meta.env?.VITE_…)`, which is true only for the string `"true"` (:3-4).
  - **Body composition scan.** README.md:56 documents `VITE_ENABLE_BODY_COMPOSITION_SCAN=false`. But BodyCompositionScan renders when `(featureFlags.bodyCompositionScan || releaseFlags.bodyCompositionScan)` (src/pages/Progress.jsx:255). `releaseFlags` comes from base44/functions/getPremiumAccess/entry.ts:5-6, `Deno.env.get("ENABLE_BODY_COMPOSITION_SCAN") === "true"`, returned at :49. So the server can turn it on, and it is **not** provably dead.
  - **Food photo scan.** README.md:58 documents `VITE_ENABLE_FOOD_PHOTO_SCAN=false`.
  - **Weekly Check-In v2.** `VITE_ENABLE_WEEKLY_CHECK_IN_V2` is set only by playwright.config.js:68. WeeklyCheckInReview is statically imported (src/pages/More.jsx:15) and rendered only under the flag (:352), yet its string "Applied. Your new targets start today." ships in tooling: dist/assets/More-DHFxaQmo.js (22,938 B).
  - **Telemetry.** `VITE_ENABLE_TELEMETRY` and `VITE_TELEMETRY_ENDPOINT` (telemetry.js:10) are set nowhere in the repo.
- Impact: Four feature paths (photo scan, body-composition scan, check-in v2, telemetry) are probably dark in production, but nothing in the repo proves it.
- Fix: confirm how Base44 exposes Secrets and standardise on one access path. Lazy-load WeeklyCheckInReview. Effort: <1h

### 5.2 Flag table

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `lifestyleCoach` = constant `false` | base44/shared/lifestyleCoachDomain.js:16; src/lib/featureFlags.js:34 | LifestyleCoach.jsx:208-456, VoiceInput.jsx (132), lifestyleCoachReply/entry.ts:76-188 unreachable | **VERIFIED** | N — product decision; decouple the import now (DEAD-06) |
| `itemizedFoodDiary` = constant `true` | src/lib/featureFlags.js:27 | dead else-arms at Nutrition.jsx:139-146,435-455; RecompContext.jsx:355,432,500,1594-1603; FoodEntryComposer.jsx:137-144 | **VERIFIED** | Y |
| `foodPhotoScan` (VITE, default off) | src/lib/featureFlags.js:11-13 | README.md:58 `=false`; FoodPhotoScan is lazy (Nutrition.jsx:32) | **SUSPECTED** | N |
| `bodyCompositionScan` (VITE OR server releaseFlag) | src/lib/featureFlags.js:16-18; src/pages/Progress.jsx:255 | server env can enable it (getPremiumAccess/entry.ts:5-6,49) | **SUSPECTED** | N |
| `weeklyCheckInV2` (VITE, default off) | src/lib/featureFlags.js:39; src/pages/More.jsx:15,352 | only playwright sets it; component statically imported | **SUSPECTED** | N — lazy-load it |
| `telemetry` (VITE + endpoint) | src/lib/featureFlags.js:22; src/lib/telemetry.js:10 | neither var set in repo | **SUSPECTED** | N |
| `legacySDKImports` | vite.config.js:18 | env set nowhere; inert even if set | **VERIFIED** | Y |

### 5.3 Commented-out code and constant conditions

| Item | Location | Evidence | Confidence | Safe to remove |
|---|---|---|---|---|
| `//`-prefixed code lines | src, base44, scripts, expo-ios/src, expo-ios/App.tsx | `rg '^\s*//\s*(const\|let\|var\|import\|export\|return\|if \(\|await\|function\|<[A-Z])'` (re-run): 9 hits, all prose (e.g. src/components/ErrorBoundary.jsx:6, src/lib/lazyWithRetry.js:12) | **VERIFIED** | n/a — none found |
| `/* */` and `{/* */}` blocks containing code | src, base44 | multiline rg for code tokens inside block comments: 0; JSX comments are labels (e.g. Nutrition.jsx:342) | **VERIFIED** | n/a — none found |
| TODO/FIXME/XXX/HACK | src, base44, scripts, expo-ios | 0 hits (re-run) | **VERIFIED** | n/a |
| literal constant conditions | src, base44, scripts | `if (true\|false)`, `&& false`, `\|\| true`: 0 hits (re-run); eslint `no-constant-condition` and `no-unreachable`: 0 | **VERIFIED** | n/a |
| hard-coded `*_ENABLED`/`*_FLAG`/`*_DEBUG` constants | src, base44, expo-ios, scripts | only `LIFESTYLE_COACH_ENABLED` (above) | **VERIFIED** | n/a |

---

## 6. Highest-value removals

Ordered by value per hour.

1. **Fix the colour token format (DEAD-01).** One change to tailwind.config.js and src/index.css revives all 242 dead usages in 73 files: the nav and header backgrounds, button hovers and tints. This fixes a bug rather than just tidying code. It is also the moment to delete the ~43 unused token lines (DEAD-13) and fix DEAD-02. Effort: <1d
2. **Land fdb5865, then delete the 79 merged branches, then amazing-cori (GIT-02, GIT-01).**
   - Cherry-pick fdb5865 into a docs PR, then run the §3.4 deletes. That removes 87% of refs.
   - Turn on auto-delete of head branches.
   - Tag `ios-build-6` (GIT-10).
   - Effort: <1h
3. **Delete 781 fully dead lines (DEAD-03, DEAD-05).**
   - That is the 8 non-OAuth unused files (583 lines), mealPlanning.js (42) and nasmKnowledgeBase.js (156), plus the barrel lines index.js:12 and :21. It also removes about 2.35 kB of dead data from the RecompContext chunk.
   - First retarget local-plan-cache.test.js:115 and release-configuration.test.js:204 to StepAboutActivity.jsx, and drop SignalStat from the :212 list.
   - Do **not** delete OAuthConsent.jsx; knip-ignore it (DEAD-04).
   - Effort: <1h
4. **Decouple the Lifestyle Coach flag (DEAD-06).** Move `LIFESTYLE_COACH_ENABLED` into its own module so the eager AuthContext chunk stops carrying the 404-line domain module. Then decide the feature's fate, which covers about 494 lines, a 404 endpoint and the LifestyleProfile entity. Effort: <1h (decouple) / product decision
5. **Collapse `itemizedFoodDiary` (DEAD-07).** Delete about 50 lines of a dead second write path across 3 files, and remove playwright.config.js:67. Effort: <1h
6. **Fix the dependency list (DEAD-11).**
   - `npm rm @hookform/resolvers @radix-ui/react-accordion cmdk` removes about 5.7 MB including the orphaned `react-hook-form` peer.
   - Drop tailwind.config.js:90-103 and the `cmdk-input-wrapper` ignore.
   - `npm i -D esbuild` lets the e2e suite load again.
   - Effort: <1h
7. **Revoke the orphaned Gmail send scope (DEAD-12).** Delete base44/connectors/gmail.jsonc and revoke the grant in Base44. This is the one removal that shrinks attack surface. Effort: <1h
8. **Decide on the dark backend features (DEAD-09, DEAD-10).** That covers registerPushToken with PushDevice, verifyGooglePlayPurchase (385 lines with its domain module) and CoachConversation, which needs a prod row check. Effort: <1h each, once decided
9. **Unblock the Dependabot queue (GIT-05/06/07).**
   - Carry #196 on a human branch with the xcode 4 override and test change.
   - Close #167, #168 and #177.
   - Add a CodeQL `groups:` entry.
   - Effort: <1h
10. **Prevent regrowth (DEAD-15, DEAD-V1).**
    - Lint `src/**`, `base44/shared/**` and `scripts/**`, and drop `--quiet` or make unused vars an error.
    - Enable `react-hooks/exhaustive-deps`.
    - Commit a knip config that ignores OAuthConsent.jsx and `src/components/ui/**` exports.
    - Effort: <1d
11. **Low value; leave as is.** The 73 export-only symbols and 15 dead shadcn primitives cost nothing at runtime. Silence them via the knip config instead of editing vendor files.

---

## 7. Could not assess

- **Production Base44 state.** Not in the repo, and no dashboard access. This covers:
  - whether the build env sets any `VITE_ENABLE_*` flag or `BASE44_LEGACY_SDK_IMPORTS`;
  - whether the `ENABLE_BODY_COMPOSITION_SCAN` and `PREMIUM_TESTER_EMAILS` Secrets reach `Deno.env`;
  - row counts in CoachConversation, LifestyleProfile, PushDevice and WaitlistEntry;
  - whether the Gmail connector grant is still active;
  - whether a deleted function such as joinWaitlist is still deployed.
- **External callers** of registerPushToken and verifyGooglePlayPurchase, for example a native Android layer outside this repo.
- **Whether Base44 requires OAuthConsent.jsx** for an MCP consent flow. `base44/mcp/config.json` does not exist on any branch.
- **Whether the Base44 dashboard can target a non-default branch** (GIT-04). docs/codex-handoff.md:107 also says this is unverified.
- **GitHub repo settings.** "Automatically delete head branches", review requirements and the bypass list are not exposed by the API toolset. The required-checks part of the branch rule was read with `gh api` (empty, 00 C2).
- **The failing CI step for #192, #170, #160 and #159.** Check-run conclusions were read, but their logs were not.
- **Whether expo 57.0.31 passes expo-doctor.** #196 fails at the step before it (R3).
- **Lockfile semantic validity of the Dependabot branches after a textual merge.** `git merge-tree` found 0 conflict markers, but `npm ci` was not run per branch.
- **Visual confirmation of DEAD-01 and DEAD-02.** These are inferred from the absence of CSS. No browser rendering was done.
- **Unused entity fields, unused props and dead parameters.** Only entity names were checked, and ESLint ran with `args: none`.
- **Runtime-built class names.** Classes assembled by string concatenation are missed by the regex scans. Tailwind's extractor would miss them too, so the conclusions stand.
- **The full byte cost of retained dead `Object.freeze` data.** Only NASM (~2,350 B) and the AuthContext lifestyle span were measured.
- **expo-ios with knip or tsc.** Its node_modules is not installed, so expo-ios got a grep-level export and dependency check only.
- **knip itself was not re-run.** Its tooling outputs were trusted, and the 109 + 92 rows were re-checked symbol by symbol with rg.
