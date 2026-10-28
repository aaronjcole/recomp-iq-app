# 03 — Base44 Coupling Inventory
Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

Sources: verified dossiers F-base44 (finding IDs `B44-*`, unknowns `U*`), B-backend (`BE-*`) and A-frontend (`FE-*`), plus the writer's own checks (listed in §1.2). Tags: **VERIFIED** = cited lines opened, or tool/command output; **SUSPECTED** = inference, Base44 platform behaviour, or engineering judgement. **Every effort figure in this document is judgement and therefore SUSPECTED**, whatever the tag on the evidence next to it.

Target-stack assumption for all replacements and estimates: Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions on Deno). It fits because the 25 functions already use Deno idioms (`npm:` specifiers, `Deno.env.get`, Web `Request`/`Response`). Alternative: a Hono API on Node 22 (Fly/Render) at +0.5 d for `npm:` rewrites. One senior engineer who knows the stack; engineer-days only, excluding store-review and vendor lead time. (a) = portable as-is, (b) = thin adapter, (c) = full replacement.

---

## 1. Summary

- **Total migration effort: ~28-38 engineer-days (about 6-8 weeks for one engineer), plus an LLM output-parity eval and external lead time** (Base44 bulk export, Google Play upload-key reset, App Review). **SUSPECTED** (sum of the §2 rows).
- **Dominant cost: identity and data continuity, 14-18 of the 28-38 days.** That is auth replacement (6-8 d), entity DDL/RLS plus a client shim for 123 direct and 12 dynamic entity call sites (5 d), and an id-preserving data migration (3-5 d). The hard constraint is that Base44 user ids must survive: Apple purchases are cryptographically bound to them (B44-02), and 24 of 25 entities key rows on them. Second cost: mobile distribution, 4-7 d plus store calendar time. The Android app is a Base44-built wrapper (B44-09), and the iOS binary hard-codes the Base44 origin (B44-10).
- **The domain logic is already portable.** `base44/shared` is 34 modules, 6,608 LOC, with 0 platform imports: 23 pure modules (5,007 LOC) plus 11 that take an injected entity accessor (1,601 LOC). 201 of 233 `src` JS/JSX files (24,304 of 32,267 LOC) import neither the SDK nor an injected Base44 handle (§9).
- **The coupling is concentrated.** 32 frontend files (7,963 LOC) and all 25 backend functions touch Base44. `src/lib/RecompContext.jsx` alone holds 71 of the 79 browser entity calls (B44-18). Only 4 SDK modules are used: `entities`, `auth`, `functions` and backend `integrations`, plus analytics, which the SDK switches on by default (writer check, §1.2).
- **Problems to fix now, migration or not:** SDK analytics sends user-identified events, contradicting the privacy text (B44-01, High). The Builder and the owner push straight to a red-CI `main` whose protection rule requires no checks (B44-03/BE-04/BE-05, High). `uploadAnalysisPhoto` accepts 10 MB private files from any account with no gate (B44-V1, Medium), and those files can never be deleted (B44-04, Medium).
- **33 Base44-side unknowns block a confident migration plan** (§10). The blocking ones are U1 (deployed schema/RLS), U3 (User table and password hashes), U4 (OAuth client ownership, especially Apple), U9 (file storage), U14 (what is live) and U22 (bulk export).

### 1.1 Top findings

| ID | Claim | Sev | Tag |
|---|---|---|---|
| B44-01 | SDK analytics is on in production and sends Base44 user id, session, page paths and 60 s heartbeats, contrary to vite.config.js:21-23 and src/pages/Privacy.jsx:76-77 | High | **VERIFIED** (code); compliance impact **SUSPECTED** |
| B44-02 | Apple appAccountToken = SHA-256(bundle-id domain + Base44 user id); new ids break every restore with 409 | High (migration blocker) | **VERIFIED** |
| B44-03 / BE-04 | Builder (110 of 280 main commits) and owner push directly to `main`; the Builder PR workflow has never fired; deploys are manual dashboard publishes | High | **VERIFIED** (history) |
| BE-05 | CI on `main` red on every push #531-#547; all backend/security/e2e steps skipped | High | **VERIFIED** (GitHub API) |
| BE-03 / BE-V1 | No `entry.ts` is ever executed or type-checked; a Builder commit shipped `usage.count()`, which the pinned backend SDK 0.8.48 lacks | High / Medium | **VERIFIED** |
| B44-18 | Core business writes run in the browser against the Base44 entity API with Mongo-style operators (79 calls) | Medium (migration surface) | **VERIFIED** |
| B44-V1 | `uploadAnalysisPhoto`: no premium, flag or quota check before `UploadPrivateFile` | Medium | **VERIFIED** |
| B44-04 / BE-19 | Uploaded analysis photos are never deleted; SDK has no delete endpoint | Medium | **VERIFIED** (absence); retention **SUSPECTED** |
| B44-05 / BE-21 | Backend SDK pinned at 0.8.48 in 25 `npm:` specifiers invisible to Dependabot; frontend on 0.8.57; model ids drift | Medium | **VERIFIED** |
| B44-09 / B44-10 | Android app is a Base44/Wix artifact; Base44 origin hard-coded in the iOS binary, ASC webhook and Android contract | Medium | **VERIFIED** (repo); ownership **SUSPECTED** |
| B44-16 / BE-18 | Uniqueness relies on per-instance in-memory Maps and rank-after-insert because entities have no unique constraints or transactions | Medium | **VERIFIED** (code); multi-instance effect **SUSPECTED** |
| B44-12 | Microsoft and Facebook login enabled server-side, not offered in UI; Google in Base44 "default" OAuth mode | Medium | **VERIFIED** (config) |

### 1.2 Dossier conflicts resolved, and writer checks

| Conflict / check | Resolution | How confirmed | Tag |
|---|---|---|---|
| Browser entity calls: A-frontend says 71, F-base44 says 79 | Both right. 71 `base44.entities.<Name>.<op>(` calls are in src/lib/RecompContext.jsx. 8 more go through an injected `entities` parameter: src/lib/sessionEdit.js:14-28 (5) and src/lib/planSettings.js:121 (3 on one line). This document uses 79 | `rg -o "entities\.[A-Z]…\.[a-z]+\(" src` → 79; with `base44.` prefix → 71 | **VERIFIED** |
| Builder commits after #155: F says 18, B says 13 | Both right under their definitions. 18 Builder commits are not reachable from 2fb3a21 (#155, 13:34Z). 13 of them have committer date after 2026-09-15T13:40Z. The other 5 (13e6555 … 8d1c538, 12:47Z-13:38Z) were made around the #155 merge and arrived through a merge commit | `git log 2fb3a21..origin/main --author=base44 --format='%h %cd'` | **VERIFIED** |
| Main commit totals | 280 commits on main (all parents), 260 first-parent. 110 are by `base44-builder[bot]` (109) or `base44-bot` (1), all first-parent | `git log origin/main [--first-parent] --format=%an \| sort \| uniq -c` | **VERIFIED** |
| socket.io: FE-23 says it "ships for one screen"; F (B44-17) says it ships regardless | F is right. node_modules/@base44/sdk/dist/client.js:16 statically imports `RoomsSocket` from utils/socket-utils.js, and that file's line 1 is `import { io } from "socket.io-client";`. Dropping the one realtime hook would not shrink the bundle | opened both lines | **VERIFIED** |
| SDK 0.8.48 entity methods (BE-V1 lists 9) | The 0.8.48 tarball (scratchpad/sdk0848) also defines `updateMany` (:110), `bulkUpdate` (:114) and `subscribe` (:128). It has no `count` (grep → 0). This matters because base44/shared/trackingRecordPersistence.js:113 calls `entity.updateMany(` on the backend. That call is valid on 0.8.48. The BE-V1 core claim stands | grep of `dist/modules/entities.js` in the tarball | **VERIFIED** |
| B44-05 model ids | `gemini_3_flash` **is** in the 0.8.48 `InvokeLLMParams.model` union (tarball integrations.types.d.ts:48) and is **absent** from 0.8.57's union (node_modules/@base44/sdk/dist/modules/integrations.types.d.ts:48). `automatic` is in neither. So the photo functions used a model id that was valid at the pinned version and has since been dropped from the SDK's enum. Whether Base44 still serves it is **SUSPECTED** (U8) | opened both lines | **VERIFIED** (strings) |
| Photo-deletion severity: B44-04 Medium, BE-19 Low | Medium adopted. Physique photos are sensitive, B44-V1 lets any account create them, and Play's account-deletion policy applies | — | judgement |
| In-process Maps: B44-16 VERIFIED/Medium, BE-18 SUSPECTED/Low | The Maps exist (**VERIFIED**). Cross-instance duplicate windows depend on the Base44 isolate model (**SUSPECTED**). Medium kept because the migration schema must replace them with constraints | — | split |
| Pure shared modules: F says 23, B says "19 pure" | Consistent. B's 19 no-I/O modules plus openFoodFacts, appleJwsVerify, appleAppAccountToken and httpUtils (Web globals only) = F's 23. Writer re-summed `wc -l`: 23 pure = 5,007 LOC; 11 injected = 1,601 LOC | `wc -l base44/shared/*.js` | **VERIFIED** |
| SDK modules actually used (writer) | Only `base44.entities` (96 text hits), `base44.auth` (48), `base44.asServiceRole.entities` (31), `base44.functions` (26) and `base44.asServiceRole.integrations` (8). 0 uses of `users`, `agents`, `appLogs`, `payments`, `connectors` or `actors` (the 2 `base44.app` hits are domain strings) | `rg -o "base44\.(asServiceRole\.)?(users\|agents\|…)" src base44` | **VERIFIED** |
| Built-in User fields consumed (writer) | `id` (131 hits), `email` (5: src/pages/More.jsx:164; base44/shared/accountDeletionDomain.js:59; accountExportDomain.js:70; entitlementAccess.js:60-61), `full_name` (2: More.jsx:163; accountExportDomain.js:70), `role` (1: src/lib/PageNotFound.jsx:43), `created_date` (1: base44/shared/referralDomain.js:38) | `rg -o "(user\|currentUser)\??\.(role\|email\|…)"` | **VERIFIED** |

---

## 2. Coupling inventory

Call-site counts are **VERIFIED** (F §0-§1, re-checked by the writer where marked). Effort is **SUSPECTED** (judgement).

| # | Category | Call sites | Class | Replacement | Effort (d) | Evidence | Tag |
|---|---|---|---|---|---|---|---|
| 1 | Auth: frontend | 16 SDK calls in 8 files (`loginViaEmailPassword`, `loginWithProvider` ×4, `register`, `verifyOtp`, `setToken`, `resendOtp`, `resetPasswordRequest`, `resetPassword`, `me` ×3, `redirectToLogin`, `logout`). Also 2 monkey-patches, 1 raw platform endpoint and 1 SDK deep import | (c) | Supabase Auth (or Clerk). Rewrite src/lib/app-params.js, src/lib/AuthContext.jsx, the 4 auth pages and expo-ios/src/nativeAuth.ts. Import Base44 user ids as auth ids (B44-02) | 6-8 | src/pages/Login.jsx:27,37,41; src/pages/Register.jsx:38,51,53,66,77,81; src/api/base44Client.js:17-27; src/lib/AuthContext.jsx:4,33-43; src/lib/signOutCore.js:16,18 | **VERIFIED** |
| 2 | Auth: backend | 24 `base44.auth.me()` (all functions except appleStoreNotification) + 1 `asServiceRole.entities.User.delete` | (c) | Verify the provider JWT in a shared `clientFromRequest(req)`; admin-API user delete | in #1 | base44/functions/coachReply/entry.ts:57; base44/functions/deleteAccount/entry.ts:58 `await base44.asServiceRole.entities.User.delete(user.id);` | **VERIFIED** |
| 3 | Entities: browser | 79 direct (71 RecompContext + 8 injected). Ops: filter 28, create 18, update 16, delete 10, get 7. Also 4 dynamic `entities[stage.name].updateMany/get` with `$set/$unset`, and 1 `subscribe` loop over 2 entities | (b) | Postgres tables + RLS `created_by_id = auth.uid()`. JS shim with `filter(query, sort, limit, skip)/get/create/update/delete/updateMany/deleteMany/subscribe` translating `$gte/$gt/$lt/$lte/$set/$unset`. tests/security/fakeBase44Client.js:44-84 already models it | 2 (DDL+RLS) + 3 (shim+realtime) | src/lib/RecompContext.jsx:341-354, 1341-1518; src/lib/planSettings.js:95,155,161,171,183; src/lib/nutritionReportHook.js:25 | **VERIFIED** |
| 4 | Entities: backend | 44 direct (18 in functions, 26 in shared) + 8 dynamic `entities[name]` (6 `ownedRecords` helpers). `asServiceRole` in 16 functions directly (21 via shared loaders) | (b) | Same shim; service key only inside functions | in #3 | base44/functions/coachReply/entry.ts:27-33; base44/shared/accountDeletionDomain.js:111 `await entities[step.entity].deleteMany(step.query)`; base44/shared/entitlementAccess.js:82 | **VERIFIED** |
| 5 | Base44 system columns | `created_by_id` 36, `created_date` 114, `updated_date` 19 occurrences in src + base44/functions + base44/shared | (a) if columns are kept verbatim | Keep the column names and values in the new schema | in #3 | base44/shared/ownerScope.js:20-23 `return { ...(query ?? {}), created_by_id: owner };` (writer re-counted) | **VERIFIED** |
| 6 | Realtime | 1 site (DailyLog + FoodLogEntry) | (b) | Supabase Realtime filtered by owner | in #3 | src/lib/nutritionReportHook.js:19,23-25 | **VERIFIED** |
| 7 | Backend function runtime | 25 `export default async function` handlers, 25 `createClientFromRequest`, 25 × `npm:@base44/sdk@0.8.48` (line 1); invoked by name from 25 sites / 22 names / 18 files | (b) | `Deno.serve(handler)` wrapper + `clientFromRequest(req)` returning `{auth.me, entities, asServiceRole.entities, integrations}`; frontend `functions.invoke(name, body)` becomes `fetch('/functions/v1/'+name)` | 3 | base44/functions/appleStoreNotification/entry.ts:1; src/lib/RecompContext.jsx:385,802,933,1721 | **VERIFIED** |
| 8 | Platform-injected request headers | `createClientFromRequest` reads `Authorization`, `Base44-Service-Authorization`, `Base44-App-Id`, `Base44-Api-Url`, `Base44-Functions-Version`, `Base44-State`, `X-Data-Env` | (b) | Gone with #7; service key from env | in #7 | node_modules/@base44/sdk/dist/client.js:412-419 (writer opened) | **VERIFIED** (0.8.57 source) |
| 9 | LLM (`Core.InvokeLLM`) | 5, all service role | (c) | Direct provider API (Gemini/OpenAI/Anthropic) with JSON-schema structured output; vision input for the 2 photo functions | 2-3 + eval | coachReply/entry.ts:155-158; lifestyleCoachReply/entry.ts:152; generateAdaptiveMealPlan/entry.ts:148-157; analyzeFoodPhoto/entry.ts:121-126; analyzeBodyComposition/entry.ts:162-167 | **VERIFIED** (sites) |
| 10 | File storage | `UploadPrivateFile` ×1, `CreateFileSignedUrl` ×2 (body scan signs 3 poses in a loop) | (b) | Private bucket + presigned GET (TTL 300 s); **add file deletion** to the cascade | 1 | uploadAnalysisPhoto/entry.ts:56; analyzeFoodPhoto/entry.ts:115-118; analyzeBodyComposition/entry.ts:151-160 | **VERIFIED** |
| 11 | Email | 0 code sites. Gmail connector declared, unused. OTP and reset emails are sent by Base44 | (c) for auth mail, delete the connector | Auth provider SMTP (Resend/Postmark) and templates | in #1; <1h connector | base44/connectors/gmail.jsonc:2-5; src/pages/Register.jsx:38,66; src/pages/ForgotPassword.jsx:19 | **VERIFIED** |
| 12 | Push | 0 senders; `registerPushToken` has no caller | delete | Nothing to replace | <1h | base44/functions/registerPushToken/entry.ts:50-64 | **VERIFIED** |
| 13 | Secrets/env | `Deno.env.get` 11 sites/2 names/9 fns; `secrets.get` (`base44:runtime`) 9 sites/7 names/3 fns; `VITE_*` 14 reads/11 names/4 files | (a)/(b) | Replace `import { secrets } from 'base44:runtime'` with `Deno.env` behind one `config.ts` | <1h | base44/functions/appleStoreNotification/entry.ts:2 `import { secrets } from 'base44:runtime';` (writer re-counted all three) | **VERIFIED** |
| 14 | SDK analytics (implicit) | 0 explicit calls; on by default | (a) remove | `analytics: { enabled: false }` now; nothing on migration | <1h | src/api/base44Client.js:6-13 passes no `analytics`; node_modules/@base44/sdk/dist/client.js:213 defaults `enabled` to `true` | **VERIFIED** |
| 15 | Vite plugin / `@/` alias | 693 alias references in 139 files (648 static, 44 dynamic `import("@/…")`, 1 side-effect); alias supplied only by the plugin | (b) | Drop the plugin; `resolve.alias {'@': path.resolve('src')}`; optional dev `/api` proxy | <1h | vite.config.js:1,15-25; node_modules/@base44/vite-plugin/dist/index.js:59-62 | **VERIFIED** |
| 16 | Hosting: SPA + same-origin `/api` + SEO prerender + custom domain + headers | client `serverUrl: ''` makes every call same-origin `/api/...`; 64 sitemap URLs; prerender and meta injection are dashboard settings | (c) | Cloudflare Pages/Vercel/Netlify; prerender/SSG the SEO routes; own headers (CSP `frame-ancestors`); CI deploy job | 2-3 | src/api/base44Client.js:10; `rg -c "<loc>" public/sitemap.xml` → 64; docs/base44-seo-configuration.md:9-21,76-79 | **VERIFIED** (repo); platform behaviour **SUSPECTED** |
| 17 | Android release | Base44-managed wrapper: `packagingProvider:"base44"`, Base44 upload cert, managed manifest, `expectedWrapperType:"base44-webview"`; CI script enforces the provider | (c) | Bubblewrap TWA or Expo Android build keeping `com.base6a68bb922bf88da5ec767da3.app`; Play upload-key reset | 3-5 + Google calendar time | android/play-release.json:3-12; scripts/verify-android-release.mjs:108 | **VERIFIED** |
| 18 | iOS shell | `APP_ORIGIN = "https://recomp-iq.base44.app"`; `BASE44_AUTH_HOSTS` and the provider-login path regex | (b) | Move origin to EAS build config; new auth hosts; new build + App Review. Keep the bundle id (also the appAccountToken domain) | 1-2 + review | expo-ios/src/bridgeProtocol.ts:4; expo-ios/src/nativeAuth.ts:24-25; expo-ios/app.json:14 | **VERIFIED** |
| 19 | Apple ASC webhook | URL is the Base44 function route | (b) | Re-point ASC to the new function URL | in #7 | base44/functions/appleStoreNotification/entry.ts:6-8 | **VERIFIED** (comment); ASC config **SUSPECTED** (U28) |
| 20 | Native bridge naming | `window.wixMobileNativeBridge` (iOS shell injects it) and `WixBrandedLiteApp` UA check (Android wrapper) | (a) iOS / goes away with Android wrapper | Optional rename | <1h | src/lib/nativeStoreShell.js:1,15; src/lib/nativeIapBridge.js:45; expo-ios/src/injectedBridge.ts:73-91 | **VERIFIED** |
| 21 | Dead Base44 artifacts | OAuthConsent.jsx (MCP consent, unrouted, calls `/api/apps/*/mcp/*`), Gmail connector, `legacySDKImports` option | delete | — | <1h | src/pages/OAuthConsent.jsx:40,91; base44/connectors/gmail.jsonc; vite.config.js:18 | **VERIFIED** |
| 22 | Data migration | 25 entities + built-in User; ids, owner columns and timestamps must be preserved | (c) | Bulk export → transform → import with ids preserved → verify counts/hashes | 3-5 | depends on U22; only in-repo export is per-user, capped at 20,000 rows per entity (base44/shared/accountExportDomain.js:12) | **SUSPECTED** |
| 23 | Tests | e2e mocks `**/api/apps/**` (tests/e2e/support/base44.js, 485 lines); 51 of 581 source-regex asserts pin Base44/Deno idioms | (b) | Rewrite the mock layer against the new API; replace source-text pins with executed handler tests | 2-3 | tests/e2e/support/base44.js:34,48,59,255; tests/security/release-configuration.test.js:40-41 | **VERIFIED** |
| — | **Total** | | | | **~28-38 + LLM eval** | Excludes Base44 export lead time, Play key reset, App Review | **SUSPECTED** |

---

## 3. Per-backend-function classification

Universal to all 25: line 1 `import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';` → replace with the `clientFromRequest` adapter (row #7). "SR" = `base44.asServiceRole`. Line numbers are in that function's `entry.ts` unless a path is given. All rows **VERIFIED** (F §2.2 and B §3, both re-opened by their verifiers).

| Function (LOC) | In-repo caller | Base44 APIs used | Non-Base44 deps | Class | Port note |
|---|---|---|---|---|---|
| analyzeBodyComposition (179) | src/components/progress/BodyCompositionScan.jsx:100 | auth.me :67; `entities[...]` :48; SR CoachRequestUsage :123, AnalysisUpload :146; CreateFileSignedUrl ×3 :151-160; InvokeLLM `gemini_3_flash` + `file_urls` :162-167; Deno.env :28, :97 | — | (c) LLM + files, (b) rest | Vision model direct + storage presign |
| analyzeFoodPhoto (139) | src/components/nutrition/FoodPhotoScan.jsx:131 | auth.me :42; Deno.env :72; SR CoachRequestUsage :83, AnalysisUpload :106; CreateFileSignedUrl :115-118; InvokeLLM `gemini_3_flash` :121-126 | — | (c)/(b) | No server kill switch (B44-22) |
| appleStoreNotification (87) | none: ASC webhook (:6-8) | no user auth; SR PremiumEntitlement :68, :79; `secrets.get("APPLE_BUNDLE_ID")` :64 | Apple JWS verify (pure, base44/shared/appleJwsVerify.js) | (b) | Public route; re-point the ASC URL. Service-token injection on an unauthenticated call is **SUSPECTED** (U12) |
| barcodeLookup (52) | src/components/nutrition/BarcodeScanner.jsx:89 | auth.me :12 | Open Food Facts v2 product (8 s timeout) | (a) except auth | — |
| coachReply (169) | src/pages/Coach.jsx:166 | auth.me :57; `entities[...]` :28 (7 reads of 6 entities :96-98, :141-144); SR CoachRequestUsage :37; Deno.env :119; InvokeLLM, no model → dashboard default, :155-158 | — | (c) LLM, (b) rest | Model unknown (U8) |
| decideWeeklyCheckIn (58) | src/lib/RecompContext.jsx:1721 (v2 flag only) | auth.me :27; user entities via base44/shared/weeklyCheckInPersistence.js:152-187 | — | (b) | No server flag (BE-17) |
| deleteAccount (65) | src/pages/Profile.jsx:255 | auth.me :13; SR cascade :39 (26 steps, base44/shared/accountDeletionDomain.js:25-62, `deleteMany` :111); SR `User.delete` :58 | — | (b) data, (c) user removal | Auth admin delete + storage delete |
| ensureDefaultHabits (47) | src/lib/RecompContext.jsx:385 | auth.me :30; U + SR Habit (base44/shared/defaultHabitsProvisioning.js:61, :65); in-process Map :5 | — | (b) | UNIQUE(created_by_id, system_key) |
| exportAccountData (35) | src/pages/YourData.jsx:57 | auth.me :19; SR accessor :30 (base44/shared/accountExportDomain.js:47, cap :12) | — | (b) | — |
| generateAdaptiveMealPlan (187) | src/pages/AdaptiveMealPlan.jsx:110 | auth.me :62; `entities[...]` :42; Deno.env :85; SR CoachRequestUsage :122; InvokeLLM `automatic` :148-157 | deterministic fallback :159-162 | (c) LLM path, (b) rest | Deterministic path portable |
| generateAdaptiveTrainingBlock (116) | src/pages/AdaptiveTrainingBlock.jsx:91 | auth.me :52; `entities[...]` :33 (6 entities :81-86); Deno.env :74 | — | (b) | Client writes TrainingBlock |
| generateWeeklyAutopilot (114) | src/pages/WeeklyAutopilot.jsx:100 | auth.me :52; `entities[...]` :33 (8 entities :81-88); Deno.env :74 | — | (b) | — |
| getOrCreateReferralCode (64) | src/pages/Referrals.jsx:19 | auth.me :25; SR ReferralCode :36, :47, :56 | — | (b) | UNIQUE(code), UNIQUE(owner_id) (BE-24) |
| getPremiumAccess (56) | src/lib/PremiumAccessContext.jsx:70 | auth.me :33; Deno.env :6, :46; SR PremiumEntitlement (base44/shared/entitlementAccess.js:82) | — | (b) | — |
| getReferralStats (45) | src/pages/Referrals.jsx:20 | auth.me :12; SR ReferralCode :23, Referral :30 | — | (b) | — |
| lifestyleCoachReply (188) | src/pages/LifestyleCoach.jsx:165 | auth.me :60; `entities[...]` :35; SR CoachRequestUsage :40; Deno.env :80; InvokeLLM default :152; LifestyleProfile update/create :168, :170 | compile-time kill switch base44/shared/lifestyleCoachDomain.js:16 | (c)/(b), dormant | — |
| recordReferralSignup (78) | src/lib/referralAttribution.js:31 | auth.me :24; SR ReferralCode :48, Referral :67; `user.created_date` (base44/shared/referralDomain.js:38) | — | (b) | Needs the auth user's `created_date` preserved (U3) |
| registerPushToken (77) | **none** (0 hits in src, expo-ios, public, scripts, tests) | auth.me :24; SR PushDevice :50, :58, :64 | — | delete | Nothing sends pushes (BE-14). A call from the Android wrapper is **SUSPECTED**-unlikely |
| reportAiContent (108) | src/pages/Coach.jsx:435 | auth.me :40; SR AiContentReport :73 | — | (b) | — |
| searchFoods (54) | src/components/nutrition/FoodSearchCard.jsx:47 | auth.me :12 | Open Food Facts `cgi/search.pl` :36 | (a) except auth | Throttling gap (BE-09) |
| swapAdaptiveMeal (50) | src/pages/AdaptiveMealPlan.jsx:146 | auth.me :20; Deno.env :25 | — | (b) | 401 mapped to 500 (BE-V2) |
| uploadAnalysisPhoto (68) | src/lib/analysisImages.js:36 | auth.me :31; `UploadPrivateFile` :56; SR AnalysisUpload.create :58 | — | (c) storage | No premium/flag/quota gate (B44-V1) |
| upsertTrackingRecord (85) | src/lib/RecompContext.jsx:802, 933; src/lib/foodNutritionSync.js:26, 35 | auth.me :40; base44/shared/trackingRecordPersistence.js:34, 48-54, `updateMany` :113; in-process Map :10 | — | (b) | UNIQUE(created_by_id, date[, habit_id]) |
| verifyApplePurchase (237) | src/components/premium/PremiumPaywall.jsx:47 | auth.me :138; `secrets.get` ×6 :42-45, :125, :201; SR PremiumEntitlement :215, :227, :229 | Apple App Store Server API :90-110 (no timeout, BE-15) | (b) | Keep user ids (B44-02) |
| verifyGooglePlayPurchase (237) | **none** (docs/premium-testing-and-launch.md:57-60 only; source-text test) | auth.me :169; `secrets.get` :121-122; SR PremiumEntitlement via bind :221; Map :17 | Google OAuth2 + Play Developer API | (b), dormant | Gaps listed in BE-06 |

Totals: (a) except auth: 2 · (b): 16 · touches (c) (LLM or storage): 6 · delete: 1. **VERIFIED** (count of the rows above).

---

## 4. Per-entity / data classification

### 4.1 Groups

| Group | Entities | RLS in repo | Class | Replacement | Tag |
|---|---|---|---|---|---|
| U, user-owned (17) | CoachConversation, CurrentStrategy, DailyLog, DecisionLedger, ExerciseSession, FoodItem, FoodLogEntry, Habit, HabitEntry, LifestyleProfile, MealTemplate, Recipe, StrengthLog, TrainingBlock, UserPreferences, UserProfile, WeeklyCheckIn | Every op `$or:[{created_by_id:"{{user.id}}"},{user_condition:{role:"admin"}}]`, e.g. base44/entities/DailyLog.jsonc:103-112. Field rule `Habit.system_key` read true / write admin (base44/entities/Habit.jsonc:20-27) | (b) | `created_by_id = auth.uid()` policies. Decide whether to keep the admin clause, which grants every app admin CRUD on all health data (U2). Column privilege or trigger for `system_key` | **VERIFIED** (repo); deployed RLS = U1 |
| O, owner-read (2) | AiContentReport, AnalysisUpload | admin write; read `data.owner_id == {{user.id}}` or admin (base44/entities/AnalysisUpload.jsonc:36-42) | (b) | Owner-select policy; writes through service key | **VERIFIED** |
| A, admin-only (6) | CoachRequestUsage, PremiumEntitlement, PushDevice, Referral, ReferralCode, WaitlistEntry | admin-only CRUD (base44/entities/PremiumEntitlement.jsonc:62-83) | (b) | No client policies; service key only | **VERIFIED** |
| Built-in | User (role admin/user). Schema file added 773ff44, deleted 6530f55 | not in repo | (c) | Auth-provider users + `role` claim; preserve `id`, `email`, `full_name`, `created_date` (§1.2) | **VERIFIED** (deletion, consumed fields); deployed shape = U3 |

### 4.2 Per entity

"Browser ops" from A §5.1 (RecompContext.jsx unless noted). "Backend modules" = files under base44/functions and base44/shared that name the entity (`rg -lw`, writer run; text mentions, not only calls). Every entity is also in the deletion/export cascade (base44/shared/accountDeletionDomain.js:25-62).

| Entity | RLS | Browser ops (line) | Backend modules naming it | Class | Migration note | Tag |
|---|---|---|---|---|---|---|
| AiContentReport | O | none | reportAiContent, aiReportRateLimitDomain | (b) | No moderation reader (U26) | **VERIFIED** |
| AnalysisUpload | O | none | uploadAnalysisPhoto, analyzeFoodPhoto, analyzeBodyComposition, analysisUploadDomain | (b) + files (c) | Rows hold Base44 `file_uri`s; copy files or drop rows (U9) | **VERIFIED** |
| CoachConversation | U | none (export label src/pages/YourData.jsx:32) | cascade only | drop | No writer anywhere (BE-13); export existing rows (U27) | **VERIFIED** |
| CoachRequestUsage | A | none | 5 AI functions + coachRateLimitDomain, aiReportRateLimitDomain | (b) | Every read filters on `requested_at` (BE-29), so only the last day of rows matters | **VERIFIED** |
| CurrentStrategy | U | filter 343; get 581, 698; create 662; update 661, 702; planSettings.js | 7 functions + weeklyCheckInDomain/Persistence, lifestyleCoachDomain | (b) | "Latest row wins": keep `created_date` ordering | **VERIFIED** |
| DailyLog | U | filter 344, 424, 497, 792; subscribe (nutritionReportHook.js:25); writes via `upsertTrackingRecord` | coachReply, generateWeeklyAutopilot, lifestyleCoachReply, trackingRecordPersistence, weeklyCheckInPersistence, fitnessTrends | (b) | Add UNIQUE(created_by_id, date) after de-duplicating; duplicates are reconciled in code today (base44/shared/trackingRecordPersistence.js:57-69) | **VERIFIED** |
| DecisionLedger | U | filter 428; create 603, 711 | weeklyCheckInPersistence | (b) | FK `weekly_check_in_id` | **VERIFIED** |
| ExerciseSession | U | filter 345, 425, 501; create 994, 1044; delete 1067, 1134; update sessionEdit.js:22 | coachReply, generateAdaptiveTrainingBlock, generateWeeklyAutopilot, lifestyleCoachReply | (b) | — | **VERIFIED** |
| FoodItem | U | filter 347; create 1293 | cascade only (openFoodFacts.js:23,48 are comments) | (b) | Browser-only writer | **VERIFIED** |
| FoodLogEntry | U | filter 354, 431, 499; create 1341, 1479; update 1402, 1431; delete 1367, 1457, 1518; subscribe | cascade only | (b) | Browser-only writer; two-phase write with DailyLog totals (FE-19) | **VERIFIED** |
| Habit | U | filter 350; create 976; update 982, 988 | defaultHabitsProvisioning, trackingRecordPersistence, generateWeeklyAutopilot, weeklyAutopilotDomain | (b) | `system_key` field privilege | **VERIFIED** |
| HabitEntry | U | filter 351, 429, 502, 924; writes via function | defaultHabitsProvisioning, trackingRecordPersistence, generateWeeklyAutopilot | (b) | UNIQUE(created_by_id, date, habit_id) | **VERIFIED** |
| LifestyleProfile | U | none | lifestyleCoachReply (dormant) | (b) | Likely empty (kill switch) | **VERIFIED** (code); row count **SUSPECTED** |
| MealTemplate | U | filter 349; create 1583 | cascade only | (b) | Browser-only writer | **VERIFIED** |
| PremiumEntitlement | A | none | verifyApplePurchase, verifyGooglePlayPurchase, appleStoreNotification, entitlementAccess, appleNotificationDomain, googlePlayPurchaseDomain | (b) | `owner_id` must stay the Base44 user id (B44-02); UNIQUE(external_transaction_id) | **VERIFIED** |
| PushDevice | A | none | registerPushToken (uncalled), accountExportDomain (token redaction :17) | drop | BE-14 | **VERIFIED** |
| Recipe | U | filter 348; create 1624; update 1632, 1647; delete 1640 | cascade only | (b) | Browser-only writer | **VERIFIED** |
| Referral | A | none | recordReferralSignup, getReferralStats, referralDomain | (b) | Keyed `referrer_id`/`referee_id` = Base44 ids (base44/entities/Referral.jsonc:10-21); rewards never granted (BE-01, U31) | **VERIFIED** |
| ReferralCode | A | none | getOrCreateReferralCode, recordReferralSignup, getReferralStats | (b) | UNIQUE(code) | **VERIFIED** |
| StrengthLog | U | filter 346, 426, 1130; create 1046, 1575; delete 1065, 1133; sessionEdit.js:14-28 | generateAdaptiveTrainingBlock | (b) | — | **VERIFIED** |
| TrainingBlock | U | filter 352; create 1004; update 1002, 1031 | cascade only | (b) | Browser-only writer; "one active block" unenforced (FE-19) → partial UNIQUE | **VERIFIED** |
| UserPreferences | U | filter 342; get 580; create 651; update 650, 685; planSettings.js | 6 functions + weeklyCheckInPersistence | (b) | — | **VERIFIED** |
| UserProfile | U | filter 341; get 579; create 642; update 641, 674, 834; planSettings.js:121, 155 | 5 functions + weeklyCheckInPersistence | (b) | — | **VERIFIED** |
| WaitlistEntry | A | none | cascade only (keyed by `email`, accountDeletionDomain.js:54-62) | export, then drop | Writer `joinWaitlist` deleted e7e92e0; may still be deployed (U13) | **VERIFIED** |
| WeeklyCheckIn | U | filter 427; create 1668 | 5 functions + weeklyCheckInDomain/Persistence | (b) | v1 path writes from the browser (BE-10) | **VERIFIED** |

### B44-18 Core business writes run in the browser against the Base44 entity API with Mongo-style operators
- Tag: **VERIFIED**
- Severity: Medium (migration surface)
- Evidence: 79 browser entity calls, 71 in src/lib/RecompContext.jsx (1,947 LOC), e.g. :341-354 (13 parallel boot reads) and :1341-1518 (FoodLogEntry create/update/delete with rollback). `$gte/$lt` at :344-354 and :424-431. src/lib/planSettings.js:95 builds `$set/$unset`, and :155 and :183 run `updateMany` expecting `{success, updated}` (:156). Writer check: 13 entities are written directly from the browser, and 5 of them (FoodItem, FoodLogEntry, MealTemplate, Recipe, TrainingBlock) have no backend writer at all (§4.2).
- Impact: the frontend is the main consumer of Base44 query semantics. A backend swap needs a faithful client shim or moving these flows server-side. Any server-side validation for browser writes today comes from Base44 enforcing the jsonc schema (enums, `maxLength`, `required`), which is **SUSPECTED** (U1). On Postgres that has to become CHECK constraints.
- Fix: introduce an `entities` adapter interface (shape already in tests/security/fakeBase44Client.js:44-84) before migrating. Effort: >1d (~3 days)

### B44-16 / BE-18 Uniqueness relies on in-process Maps and rank-after-insert because entities lack unique constraints and transactions
- Tag: **VERIFIED** (code); multi-instance behaviour **SUSPECTED**
- Severity: Medium as a migration item (the schema must replace these with constraints). As a runtime defect on Base44 it is Low, which is how 01 rates BE-18
- Evidence: Maps at base44/functions/ensureDefaultHabits/entry.ts:5, upsertTrackingRecord/entry.ts:10 and verifyGooglePlayPurchase/entry.ts:14-17 (comment admits per-instance scope). Insert-then-rank at base44/shared/coachRateLimitDomain.js:189-255 ("no count method" :238-241), referralDomain.js:109-139, googlePlayPurchaseDomain.js:86-147 and aiReportRateLimitDomain.js:84-107. docs/security-audit.md:48-52 lists cross-instance uniqueness as an open release blocker (doc claim). `getOrCreateReferralCode` is plain check-then-create (BE-24).
- Impact: duplicate-row windows across instances today. On Postgres, the three rank-after-insert modules (544 LOC: coachRateLimitDomain 255, googlePlayPurchaseDomain 148, referralDomain 141) shrink to UNIQUE constraints plus transactions.
- Fix: on migration add UNIQUE(created_by_id, date[, habit_id]), UNIQUE(code), UNIQUE(purchase token), and use transactions. Effort: <1d

### B44-23 / BE-13 / BE-14 Three functions and three entities have no in-repo producer or consumer
- Tag: **VERIFIED** (repo); off-repo callers **SUSPECTED**
- Severity: Low
- Evidence: `registerPushToken`, `verifyGooglePlayPurchase` and `appleStoreNotification` have 0 `functions.invoke` sites (the last is an Apple webhook by design). CoachConversation has 0 create sites; coach history lives in component state (src/pages/Coach.jsx:103). WaitlistEntry's writer was deleted (e7e92e0). PushDevice is written only by the uncalled `registerPushToken` (:50-64). expo-ios/package.json has no `expo-notifications`.
- Impact: data collected with no purpose; migration scope is unclear until Base44 row counts are known (U27).
- Fix: delete `registerPushToken` and PushDevice unless push is planned; export, then drop WaitlistEntry and CoachConversation. Effort: <1h code + owner decision

---

## 5. Auth & session

Flow as implemented (**VERIFIED** by reading the repo and the SDK 0.8.57 source, F §3):
- **Client:** src/api/base44Client.js:6-13 `createClient({ appId, token, functionsVersion, serverUrl: '', requiresAuth: false, appBaseUrl })`. Empty `serverUrl` makes every call same-origin `/api/...`, so whatever origin serves the SPA must also serve or proxy Base44's `/api`. :17-27 wrap `loginWithProvider` and `redirectToLogin` to set a same-tab CSRF marker.
- **Token bootstrap:** src/lib/app-params.js:41-73 accepts `?access_token=` only when the sessionStorage marker exists, is same-origin and is ≤10 min old (:52-54), then writes it to `localStorage.base44_access_token` and `localStorage.token` (:67-68). Bootstrap params are stripped (:91-92) and legacy `base44_app_*` keys purged (:95-97). Runtime config comes only from `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION` and `VITE_BASE44_APP_BASE_URL` (default `window.location.origin`) (:102-107). The bearer token sits in localStorage, readable by any XSS. FE-22: `history.replaceState({}, …)` at module load (:18, :92) drops React Router's history state.
- **Cookies too:** SDK `logout()` redirects to `${appBaseUrl}/api/apps/auth/logout` "to clear HTTP-only cookies" (SDK modules/auth.js:170-186). Cookie scope and lifetime are unknown (U5).
- **Session check:** src/lib/AuthContext.jsx:33-43 GETs `/api/apps/public/prod/public-settings/by-id/{appId}` through a deep-imported SDK axios client. It maps 403 `extra_data.reason` to `auth_required`/`user_not_registered` (:59-70), then calls `base44.auth.me()` (:105).
- **Provider login:** SDK builds `${appBaseUrl}/api/apps/auth[/<provider>]/login?app_id=..&from_url=..` (auth.js:145-159). The UI offers Google and Apple only (src/pages/Login.jsx:36-42; src/pages/Register.jsx:76-82).
- **Email/password:** SDK `loginViaEmailPassword/register/verifyOtp/resendOtp/resetPasswordRequest/resetPassword`. Register → OTP → `setToken` (src/pages/Register.jsx:38-56). Reset link `/reset-password?token=` (src/pages/ResetPassword.jsx:11-12). Email content is produced by Base44 (U7).
- **Native iOS:** expo-ios/src/nativeAuth.ts:50-56 detects provider-login URLs, rewrites `from_url` to `/auth/native-return.html?next=` (:76-85), and runs `ASWebAuthenticationSession` (expo-ios/src/RecompOneWebView.tsx:356). public/auth/native-return.html:28-44 forwards `access_token` to `recompone://auth`, and the shell `replace()`s the WebView to `<origin><next>?access_token=`. This depends on Base44 honouring an arbitrary same-origin `from_url` path (U4).
- **Built-in User fields the code reads:** `id`, `email` (tester allowlist match at base44/shared/entitlementAccess.js:60-61; deletion of WaitlistEntry by email at accountDeletionDomain.js:59), `full_name`, `role` (src/lib/PageNotFound.jsx:43) and `created_date` (7-day referral window at base44/shared/referralDomain.js:38). **VERIFIED** (writer `rg`). Because `PREMIUM_TESTER_EMAILS` grants Premium by email match, the replacement provider must only expose verified emails. **SUSPECTED** risk.

### B44-02 Apple subscriptions are cryptographically bound to Base44 user ids, so a migration must preserve ids verbatim
- Tag: **VERIFIED** (code); effect on live subscribers **SUSPECTED** (depends on whether paying users exist)
- Severity: High (migration blocker)
- Evidence: base44/shared/appleAppAccountToken.js:1 `const TOKEN_DOMAIN = "com.base6a68bb922bf88da5ec767da3.app:storekit-account:v1:";` and :22-27 SHA-256 of `TOKEN_DOMAIN + normalizedUserId`. base44/functions/verifyApplePurchase/entry.ts:191-194 returns 409 "Purchase is already linked to another account" on mismatch. src/components/premium/PremiumPaywall.jsx:17,101 derives the same token client-side. 24 of 25 entities key rows on Base44 user ids (`created_by_id` ×17, `owner_id` ×6, Referral `referrer_id`/`referee_id`); WaitlistEntry is keyed by email.
- Impact: new auth ids would make every existing subscriber's purchase or restore fail with 409 and orphan all rows.
- Fix: import Base44 user ids as the auth primary key (or a `legacy_id` used for token derivation) and keep the domain string forever. Effort: <1d (design), within the auth migration

### B44-12 Microsoft and Facebook sign-in are enabled server-side but not offered in the UI, and Google uses Base44's default OAuth mode
- Tag: **VERIFIED** (config/UI); identity-portability consequences **SUSPECTED**
- Severity: Medium
- Evidence: base44/auth/config.jsonc:4-5 `"enableMicrosoftLogin": true`, `"enableFacebookLogin": true`; :9-10 `"googleOAuthMode": "default"`, `"googleOAuthClientId": null`. src/pages/Login.jsx:36-42 and src/pages/Register.jsx:76-82 offer only Google and Apple; `rg -i "microsoft|facebook" src` → 0. expo-ios/src/nativeAuth.ts:1 lists Microsoft/Facebook as supported.
- Impact: two unadvertised login paths widen the attack and support surface. Apple `sub` values and private-relay emails are team-scoped. If they belong to a Base44-owned Services ID, Apple users cannot be matched after a migration. Google `sub` is account-global, so Google is less at risk (U4).
- Fix: disable unused providers and configure your own Google and Apple OAuth clients before any migration. Effort: <1d

### B44-15 / FE-21 / FE-16 Startup blocks on a Base44-internal endpoint via an undocumented SDK deep import, with no timeout
- Tag: **VERIFIED** (code); breakage on SDK refactor **SUSPECTED**
- Severity: Low
- Evidence: src/lib/AuthContext.jsx:4 `import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';`. It works only because SDK 0.8.57 ships no `exports` map, and the declared range is `^0.8.57` (package.json:23). :33-43 GETs the public-settings endpoint, then (if a token exists) awaits `auth.me()` (:47-48). src/App.jsx:75-79 renders the splash until both resolve, on every route including public SEO pages. The SDK axios client sets no `timeout` (node_modules/@base44/sdk/dist/utils/axios-client.js:118-126). `appPublicSettings`, `navigateToLogin`, `checkAppState` and AuthContext's `logout` have 0 consumers.
- Impact: an extra serial round trip on every cold start; a hung Base44 API shows the splash indefinitely, crawlers included; an SDK release that adds an `exports` map breaks boot.
- Fix: replace with `auth.me()` only (or plain `fetch` with a timeout) and render public routes without waiting on auth; drop it on migration. Effort: <1d

### FE-V1 A transient network or 5xx failure at boot is treated as "signed out", with no retry
- Tag: **VERIFIED** (code trace); frequency **SUSPECTED**
- Severity: Medium
- Evidence: src/lib/AuthContext.jsx:114-127: any `auth.me()` failure sets `isAuthenticated=false`, `authChecked=true`, and sets `authError` only for 401/403 (:121). ProtectedRoute then renders `<Navigate to="/login" replace />` (src/App.jsx:107; src/components/ProtectedRoute.jsx:25-34), and its retry effect fires only while `!authChecked` (:15-19).
- Impact: a signed-in user on a flaky connection sees the login screen. The auth rewrite should carry an explicit "auth unknown" state.
- Fix: keep a retryable error state for network/5xx instead of routing to /login. Effort: <1d

### B44-14 `signOut()` without a redirect still navigates away
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/signOut.js:17 and src/lib/signOutCore.js:11 say "omit to only drop the token", but src/lib/signOutCore.js:16 calls `auth.logout()`, and SDK modules/auth.js:179-186 always sets `window.location.href` to `/api/apps/auth/logout` in a browser. All real callers pass a redirect (src/pages/More.jsx:208; src/pages/Profile.jsx:278,579).
- Impact: misleading API; harmless today.
- Fix: delete the no-redirect branch or implement a local-only token drop. Effort: <1h

### B44-19 The iOS README claims native code never receives the access token; it does
- Tag: **VERIFIED**
- Severity: Low
- Evidence: expo-ios/README.md:10 "Native code never receives or stores the Base44 access token." expo-ios/src/nativeAuth.ts:98-107 parses `access_token` from the callback and builds the WebView URL with it; expo-ios/src/RecompOneWebView.tsx:356-363 receives it from `openAuthSessionAsync`.
- Impact: inaccurate security documentation; the token is not persisted natively.
- Fix: reword to "receives transiently during provider sign-in; never stores". Effort: <1h

### FE-10 The 404 page is unmodified Base44 boilerplate with its own `auth.me()` call
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/PageNotFound.jsx:10-20 runs a react-query `auth.me()` (the only `useQuery` in the app, FE-09). :43-56 shows admins "This could mean that the AI hasn't implemented this page yet. Ask it to implement it in the chat." :23 hard-codes light `slate` colours.
- Impact: Builder-facing copy in a shipped store app; a redundant network call; it is one of the 24 files to touch on migration.
- Fix: replace with a themed 404 that uses `useAuth()`. Effort: <1h

---

## 6. Files/storage, integrations (LLM), email, push

Integration calls in code: `InvokeLLM` ×5, `CreateFileSignedUrl` ×2, `UploadPrivateFile` ×1, all in base44/functions via `asServiceRole`; 0 in src. `SendEmail`, `UploadFile`, `GenerateImage` and connector reads: 0. **VERIFIED** (writer re-ran `rg -o "integrations\.Core\.[A-Za-z]+" base44`).

### B44-V1 `uploadAnalysisPhoto` stores 10 MB private files for any signed-in account with no premium, feature-flag or quota check
- Tag: **VERIFIED** (code); platform storage quotas and cost **SUSPECTED**
- Severity: Medium
- Evidence: base44/functions/uploadAnalysisPhoto/entry.ts:19-62 checks only method, size (:23-26; 10 MB at base44/shared/analysisUploadDomain.js:11), `auth.me()` (:31) and file type (:50, :55), then runs `await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });` (:56) and `AnalysisUpload.create` (:58). `rg "Premium|premium|quota|reserve|ENABLE_|Deno\.env|rate"` over the function and analysisUploadDomain.js → 0 hits. Compare analyzeFoodPhoto/entry.ts:72-77 (premium) and :82-88 (quota). The only gates on photo features are build-time UI flags (src/lib/featureFlags.js:11-18).
- Impact: any free account can script unlimited permanent uploads into Base44 private storage, whether or not photo features are enabled.
- Fix: require the matching premium feature, a backend flag and `reserveFeatureRequest` quota before `UploadPrivateFile`. Effort: <1h

### B44-04 / BE-19 Uploaded analysis photos are never deleted from Base44 storage; account deletion removes only the index rows
- Tag: **VERIFIED** (no delete call; SDK 0.8.57 has no delete endpoint); retention and existence of production photos **SUSPECTED** (U9, U11)
- Severity: Medium (BE-19 rated Low; Medium adopted, §1.2)
- Evidence: the SDK Core types expose only `UploadFile`, `ExtractDataFromUploadedFile`, `UploadPrivateFile` and `CreateFileSignedUrl` (node_modules/@base44/sdk/dist/modules/integrations.types.d.ts:237,305,341,360). base44/shared/accountDeletionDomain.js:46 deletes `AnalysisUpload` rows only. `rg -i "deletefile|DeletePrivateFile|removeFile" base44 src node_modules/@base44/sdk/dist` → 0. Disclosed at src/pages/Privacy.jsx:61-64 and src/pages/Profile.jsx:594-595. Flags default off (src/lib/featureFlags.js:11-18).
- Impact: any body or food photo ever uploaded outlives account deletion for an unknown period. Play's account-deletion policy may not accept "cannot delete" for physique photos.
- Fix: get Base44's retention and deletion guarantee in writing, or keep both photo features off; on migration use storage with delete. Effort: <1d (vendor), <1d on new storage

### B44-05 / BE-21 / BE-V1 Backend SDK pinned at 0.8.48 while the Builder bumps the frontend SDK; the API surface and model ids differ
- Tag: **VERIFIED** (pins, bump history, method lists, strings); runtime effect **SUSPECTED**
- Severity: Medium
- Evidence: 25/25 entries import `npm:@base44/sdk@0.8.48` (line 1) vs package.json:23 `^0.8.57`. .github/dependabot.yml covers npm `/`, `/expo-ios` and actions, so `npm:` specifiers inside .ts files are invisible to it. 15 "Update base44 packages" Builder commits on main (2026-07-30 → 2026-10-22). SDK 0.8.48 has no `entities.count()`; 0.8.57 has it (node_modules/@base44/sdk/dist/modules/entities.js:135). Builder commit 5824d0b added `usage.count(...)` to `reserveFeatureRequest` and a matching test fake; 1093787 replaced it with a bounded `filter` (base44/shared/coachRateLimitDomain.js:238-248). Model ids: `gemini_3_flash` (analyzeFoodPhoto/entry.ts:123, analyzeBodyComposition/entry.ts:164) is in the 0.8.48 union but was dropped from the 0.8.57 union. `automatic` (generateAdaptiveMealPlan/entry.ts:156) is in neither. coachReply :155-158 and lifestyleCoachReply :152-155 pass no model and use the "app-level model setting" (§1.2).
- Impact: between 12:19Z and 16:53Z on 2026-10-23, `main` held code in which all four AI features' quota path would throw. Whether it was published is unknown (U14). The model behind every AI feature is invisible in git, and a retired id could break both photo features with no repo change.
- Fix: one import map / re-export with a single version string plus a parity test; generate test fakes from the pinned SDK's method list; record provider and model per call; on migration, call the provider directly with explicit ids. Effort: <1d

### B44-22 / BE-17 Body scan has a server kill switch; food photo and Weekly Check-In v2 do not
- Tag: **VERIFIED** (code); production values **SUSPECTED** (U11)
- Severity: Medium (F rated Low; Medium per 05 SEC-13: the Bundle grants `food_photo`, base44/shared/premiumDomain.js:42-49, and BE-07 makes the Bundle free for testers)
- Evidence: base44/functions/analyzeBodyComposition/entry.ts:27-28 and getPremiumAccess/entry.ts:5-6 read `ENABLE_BODY_COMPOSITION_SCAN`. `VITE_ENABLE_FOOD_PHOTO_SCAN` (src/lib/featureFlags.js:11-13) has no backend counterpart: analyzeFoodPhoto gates only on premium (:72-77) and quota (:82-88). decideWeeklyCheckIn/entry.ts:19-58 has no flag, while the UI flag is build-time (featureFlags.js:39).
- Impact: a premium user calling `functions.invoke("analyzeFoodPhoto")` runs paid vision inference with the UI flag off (bounded by quota); any user can call the v2 apply path.
- Fix: add `ENABLE_FOOD_PHOTO_SCAN` and `ENABLE_WEEKLY_CHECK_IN_V2` backend checks. Effort: <1h

### B44-11 / BE-11 A Gmail connector with send scope is declared but unused
- Tag: **VERIFIED** (declared, no consumer); grant still active **SUSPECTED** (U20)
- Severity: Low
- Evidence: base44/connectors/gmail.jsonc:2-5 `"type": "gmail"`, scope `"https://www.googleapis.com/auth/gmail.send"`. Added by the Builder in eb32616. `rg "connectors|getConnection" base44/functions base44/shared src expo-ios/src scripts` → 0. The historical consumer `asServiceRole.connectors.getConnection("gmail")` was in joinWaitlist (ed9ab25), deleted in e7e92e0.
- Impact: a standing OAuth grant (if active) lets any future function send mail as the connected account, with no feature behind it.
- Fix: delete the connector file and revoke the grant in Base44 and in the Google account. Effort: <1h

### Email
No app email path exists in code. All mail the app depends on (OTP, password reset) is sent by Base44 Auth (src/pages/Register.jsx:38,66; src/pages/ForgotPassword.jsx:19). Sender, SPF/DKIM and templates are unknown (U7). On migration: provider SMTP plus templates, inside the auth row. **VERIFIED** (absence in code); Base44 behaviour **SUSPECTED**.

### Push
Nothing sends, nothing registers (BE-14, B44-23). The replacement cost is zero; delete `registerPushToken` and PushDevice. **VERIFIED**.

### Non-Base44 external services (portable as-is, class a)
Open Food Facts product and search (base44/shared/openFoodFacts.js:54-67; searchFoods/entry.ts:36), Apple App Store Server API (verifyApplePurchase/entry.ts:90-110), Google OAuth2 and Play Developer API (verifyGooglePlayPurchase/entry.ts:102-110, 130-137). Only the OFF User-Agent string names the Base44 host (base44/shared/openFoodFacts.js:60 `"RecompOne/1.0 (+https://recomp-iq.base44.app)"`). **VERIFIED**.

---

## 7. Secrets / env

| Mechanism | Names | Sites | Evidence | Tag |
|---|---|---|---|---|
| `Deno.env.get` | `ENABLE_BODY_COMPOSITION_SCAN`, `PREMIUM_TESTER_EMAILS` | 11 sites in 9 functions | analyzeBodyComposition/entry.ts:28,97; getPremiumAccess/entry.ts:6,46; analyzeFoodPhoto:72; coachReply:119; generateAdaptiveMealPlan:85; generateAdaptiveTrainingBlock:74; generateWeeklyAutopilot:74; lifestyleCoachReply:80; swapAdaptiveMeal:25 | **VERIFIED** (writer re-counted) |
| `secrets.get` from `'base44:runtime'` | `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_SANDBOX_ALLOWED_USER_IDS`, `PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SA_JSON` | 9 sites in 3 functions (import at line 2 of appleStoreNotification, verifyApplePurchase, verifyGooglePlayPurchase) | verifyApplePurchase/entry.ts:42-45,125,201; verifyGooglePlayPurchase/entry.ts:121-122; appleStoreNotification/entry.ts:64 | **VERIFIED** (writer re-counted) |
| Documented, never read | `APPLE_APP_ID` | comment only | verifyApplePurchase/entry.ts:20; docs/apple-premium-launch.md:62 | **VERIFIED** |
| Frontend `import.meta.env` | `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL`, `VITE_ENABLE_FOOD_PHOTO_SCAN`, `VITE_ENABLE_BODY_COMPOSITION_SCAN`, `VITE_ENABLE_TELEMETRY`, `VITE_ENABLE_WEEKLY_CHECK_IN_V2`, `VITE_TELEMETRY_ENDPOINT`, `VITE_APP_VERSION`, `VITE_GOOGLE_PLAY_URL`, `VITE_APP_STORE_URL` | 14 reads in 4 files | src/lib/app-params.js:78-81,103-106; src/lib/featureFlags.js:12,17,22,39; src/lib/telemetry.js:10-11; src/lib/storeLinks.js:21-29 | **VERIFIED** (writer re-counted) |
| Platform-injected headers | 7 (see §2 row #8) | every function call | node_modules/@base44/sdk/dist/client.js:412-419 | **VERIFIED** (0.8.57 source) |
| Build tooling | `BASE44_LEGACY_SDK_IMPORTS`; plugin reads `MODAL_SANDBOX_ID`, `BASE44_HMR_HOST`, `BASE44_BUILD_STATUS_ENABLED` | — | vite.config.js:18; node_modules/@base44/vite-plugin/dist/index.js:11,99,222 | **VERIFIED** |

Migration: (a) for `Deno.env` and `VITE_*` except the 3 `VITE_BASE44_*` names, which go away; (b) for `base44:runtime`, which does not resolve off-platform. Production values for all of these live only in the dashboard (U10, U11).

### B44-06 / BE-20 Two secret mechanisms coexist; `base44:runtime` is unresolvable off-platform
- Tag: **VERIFIED** (code); whether both read one store **SUSPECTED** (U10)
- Severity: Low
- Evidence: table above. Tooling knip-configured.txt:21,43,45 lists `base44` as an unlisted dependency at line 2 of the 3 purchase/webhook functions. tests/security/entitlement-loader.test.js:199-202 asserts the shared loader has no `Deno.|process.env|base44:runtime`.
- Impact: there is no single list of required config. If the two stores are not mirrored, one family reads `undefined` and fails closed ("feature mysteriously off"). Off-platform, the 3 purchase/webhook functions will not load.
- Fix: one `config.ts` reading `Deno.env`, with startup validation. Effort: <1h

### BE-07 Apple sandbox purchases grant Premium while `APPLE_SANDBOX_ALLOWED_USER_IDS` is unset
- Tag: **VERIFIED** (code); production secret value **SUSPECTED** (U10)
- Severity: Medium (Low if TestFlight stays internal)
- Evidence: base44/shared/premiumDomain.js:147 `if (allowlist.size === 0) return { allowed: true, sandbox: true, unconfigured: true };`. Deliberate per the comments at premiumDomain.js:130-133 and verifyApplePurchase/entry.ts:24-27. Only a `console.warn` at :203-207. docs/deploy-1-5.md:39 lists setting it as a to-do.
- Impact: anyone who can run a sandbox or TestFlight build of this bundle id gets Premium on their real account without paying.
- Fix: set the secret now, then fail closed when the list is empty. Effort: <1h

---

## 8. Deployment / hosting / Builder workflow

Facts (**VERIFIED** in repo unless tagged):
- **Build:** base44/config.jsonc:4-7 `"installCommand": "npm install"`, `"buildCommand": "npm run build"`, `"serveCommand": "npm run dev"`, `"outputDirectory": "./dist"`. Base44 owns the production build env, including `VITE_*` (tooling build.txt warns `VITE_BASE44_APP_ID` unset locally).
- **Publish is manual:** README.md:79-85 "After pushing your changes to git, open the Base44 dashboard and publish the app". docs/deploy-1-5.md:3 "Base44 publishes from the dashboard, and merging only synced the code"; :6 "Note the current live version in the Base44 dashboard"; :28 "Never publish the frontend before step 2". .github/workflows/ci.yml has no deploy step.
- **SEO hosting:** platform meta-tag injection is enabled, and SEO routes must be registered under "Per-page indexing so the platform pre-renders it" (docs/base44-seo-configuration.md:9-21). Hosting exposes no path redirects or response headers (:76-79). Doc claims, platform behaviour **SUSPECTED** (U21).
- **Domains:** canonical `https://fitnesstrackerapps.com` (index.html:13); `recomp-iq.base44.app` hard-coded in 14 files, 5 of them code or config (android/play-release.json:7; base44/functions/appleStoreNotification/entry.ts:8; base44/shared/openFoodFacts.js:60; expo-ios/src/bridgeProtocol.ts:4).
- **Builder:** 110 of 280 main commits; 18 Builder commits landed after #155 (§1.2).

### B44-03 / BE-04 / BE-08 The Builder and the owner commit straight to `main`, the Builder PR workflow is inert, and live deploys are manual and untracked
- Tag: **VERIFIED** (history, config, branch rule)
- Severity: High (the deploy-tracking part on its own, BE-08, is Medium in 01)
- Evidence: 110/280 main commits are `base44-builder[bot]`/`base44-bot`, all first-parent, including 28 "File changes" and 15 "Update base44 packages" (writer re-ran `git log --first-parent --author=base44`). .github/workflows/base44-builder-pr.yml:3-5 assumes "With `main` protected, pointing it at this branch instead turns each Builder edit into a reviewable pull request", and :24-27 triggers on push to `base44-builder`. That branch is still at 2fb3a21, 0 ahead / 40 behind (tooling branches.tsv), so the workflow has never fired. `gh api repos/aaronjcole/recomp-iq-app/branches/main` → `{"protected":true,"rsc":{"checks":[],"contexts":[],"enforcement_level":"off"}}`: protected, nothing required (00 C2). Since 2026-09-15T13:40Z, main received 13 Builder and 11 owner (`Aaron Cole`) direct commits against 11 PR merges. Direct pushes touched payment and paid-inference code: 43cb895 (verifyGooglePlayPurchase, googlePlayPurchaseDomain), 5824d0b and 1093787 (coachRateLimitDomain), 5c2e4f9 and 3316516 (owner). 3ddb424 (Builder, 2026-10-23) bumped `vite` ^6.1.0 → ^8.3.5 directly on main and dropped `esbuild` from the lockfile, which is why Playwright cannot load any spec (tooling e2e.txt). The Builder re-added src/pages/OAuthConsent.jsx after two human deletions (46ef650, 4336ca3). Deploys: see facts above.
- Impact: unreviewed, untested changes, including dependency majors and payment code, land on main while CI is red and not gating (BE-05). Human deletions get reverted. Nobody can tell from git what is live (U14).
- Fix: point the Builder at `base44-builder` (or disconnect it), require PRs and checks on main for everyone, and record each published version (tag or CHANGELOG line with the Base44 version id). Effort: <1d (settings + process; plus Base44 dashboard work, matching GIT-03)

### BE-05 CI on `main` is red before the test steps, so backend, security and e2e checks never run on main
- Tag: **VERIFIED** (GitHub Actions API, per B verifier)
- Severity: High
- Evidence: all 14 main push runs #531-#547 concluded `failure` (re-queried in QA; #529 was the last success). #531 and #540-#547 failed at "Validate Expo configuration" (ci.yml:52-53, `expo-doctor`: "expo expected ~57.0.31 found 57.0.30"), #533-#539 at "Typecheck" (01 §1.2 #1). Steps 11-17 (tests, Android verify, build, e2e; ci.yml:55-74) were `skipped`.
- Impact: Base44-coupled backend code has no gate at all on main; an upstream Expo release turns main red with no repo change.
- Fix: run the gating doctor step with `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` and the online doctor as a scheduled non-blocking job. Merging Dependabot #196 alone does not turn main green: it fails earlier, at ci.yml:49-50, until DEP-24 is fixed (00 C3). Effort: <1h

### BE-03 No backend function source is ever executed, type-checked or linted
- Tag: **VERIFIED**
- Severity: High
- Evidence: `rg -i deno .github package.json scripts playwright.config.js` → 0; no deno.json, lock or import map. tsc reaches 0 of 25 entry.ts files (tooling tsc-files.txt). 26 test files read entry sources as text and none imports one. E2E mocks all `**/api/apps/**` (tests/e2e/support/base44.js:255). Incident: BE-V1.
- Impact: typos, wrong imports (`base44:runtime`), SDK misuse and request-shape bugs in 2,595 lines of handlers surface only in production. On migration this is also the only safety net for the adapter, and it does not exist.
- Fix: CI job running `deno check base44/functions/*/entry.ts` plus a smoke `deno test` per handler with a fake client whose method surface matches the pinned SDK. Effort: <1d

### BE-12 The Base44 site build runs `npm install`, not `npm ci`
- Tag: **VERIFIED** (config); whether the platform honours it as written **SUSPECTED**
- Severity: Low
- Evidence: base44/config.jsonc:4 `"installCommand": "npm install"`; CI uses `npm ci` (.github/workflows/ci.yml:35).
- Impact: a production build can resolve different versions from the ones CI tested.
- Fix: `"installCommand": "npm ci"`. Effort: <1h

### B44-07 The `@/` import alias exists only because of the Base44 Vite plugin
- Tag: **VERIFIED**
- Severity: Low
- Evidence: node_modules/@base44/vite-plugin/dist/index.js:59-62 `alias: { "@/": "/src/" }`. vite.config.js:13-41 defines no alias. 693 alias references in 139 files (e.g. dynamic imports at src/App.jsx:22-40; side-effect import src/main.jsx:4). jsconfig.json `paths` covers tsc only.
- Impact: removing the plugin fails the build loudly on every import.
- Fix: add `resolve: { alias: { '@': path.resolve('src') } }`. Effort: <1h

### B44-08 Builder dev tooling does not ship to production; the runtime coupling left is the SDK's iframe postMessage
- Tag: **VERIFIED** (local build); Base44's own build env **SUSPECTED**
- Severity: Info (plugin); postMessage exposure belongs to the security slice
- Evidence: node_modules/@base44/vite-plugin/dist/html-injections-plugin.js:57-66 marks the hmr/navigation notifiers `mode:"dev"`; :221-244 adds the visual-edit agent only in `devTags()`; :286-293 production emits `tagsFor("production")`, which holds only `analyticsTracker` (off at vite.config.js:23). 0 files in the tooling `dist/` match `visual-edit|sandbox-bridge|setupVisualEditAgent`. The SDK axios client posts URL, method, body and response to `window.parent` with target `"*"` when framed (node_modules/@base44/sdk/dist/utils/axios-client.js:147-160,173-182). `serveCommand: "npm run dev"` (base44/config.jsonc:6) means dev-only injections would load if Base44 ever serves the dev server (U32).
- Impact: `visualEditAgent: true` is harmless in production builds. The postMessage leak depends on frame-ancestors/XFO headers the repo cannot set.
- Fix: set `visualEditAgent`/`hmrNotifier`/`navigationNotifier` to false if the Builder is retired; drop `legacySDKImports`. Effort: <1h

### B44-01 Base44 SDK analytics is ON in production and sends user-identified events, despite the stated policy
- Tag: **VERIFIED** (code trace); compliance impact **SUSPECTED**
- Severity: High
- Evidence: src/api/base44Client.js:6-13 passes no `analytics` option; node_modules/@base44/sdk/dist/client.js:213 defaults `enabled` to `true` (writer opened). modules/analytics.js:14 `heartBeatInterval: 60 * 1000`; :51 posts to `/api/apps/${appId}/analytics/track/batch`; :291 `user_id: user.id`. Contradicts vite.config.js:21-23 ("Keep authenticated page-view telemetry off until … Play Data Safety disclosures are explicitly approved") and src/pages/Privacy.jsx:76-77 ("Aggregated, de-identified analytics").
- Impact: every session, iOS WebView included, posts the Base44 user id, session id, page paths, referrer and 60 s heartbeats to Base44.
- Fix: `createClient({ …, analytics: { enabled: false } })`. Effort: <1h

### B44-09 The Android app is entirely a Base44/Wix artifact (wrapper, upload key, assetlinks, manifest)
- Tag: **VERIFIED** (repo contract); ownership specifics **SUSPECTED** (U17)
- Severity: Medium (exit cost)
- Evidence: android/play-release.json:3 `"packagingProvider": "base44"`, :6 `base44UploadCertificateSha256`, :9 `"/api/apps/manifests/6a68bb922bf88da5ec767da3/manifest.json"`, :12 `"expectedWrapperType": "base44-webview"`. scripts/verify-android-release.mjs:108 `check(config.packagingProvider === "base44", …)`. src/lib/nativeStoreShell.js:1 `/WixBrandedLiteApp/i`. `public/.well-known/` does not exist (writer `ls`). `window.handleAndroidBack` (src/components/AndroidBackHandler.jsx:10-27) has no in-repo caller; the wrapper is assumed to call it (**SUSPECTED**). docs/android-play-release.md:3-5,105-115 say permissions are not editable (doc claim).
- Impact: leaving Base44 needs a new Android build pipeline and a Play upload-key reset; Android IAP is unbuilt (`verifyGooglePlayPurchase` has no caller).
- Fix: plan a TWA or Expo Android build that keeps the package name; confirm who owns the Play Console and upload key. Effort: >1d (~3-5 days)

### B44-10 The Base44 origin is hard-coded into the iOS binary, the webhook config and the Android contract, while the web canonical is a different domain
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: expo-ios/src/bridgeProtocol.ts:4 `export const APP_ORIGIN = "https://recomp-iq.base44.app";`. expo-ios/src/nativeAuth.ts:24-25 `BASE44_AUTH_HOSTS = new Set(["base44.app", "app.base44.com"])` and the `/api/apps/…/login` regex. base44/functions/appleStoreNotification/entry.ts:8; android/play-release.json:7; index.html:13 canonical `https://fitnesstrackerapps.com/`.
- Impact: any host or auth change needs an App Store release plus ASC and Play changes. iOS users run on the base44.app origin, so their storage is separate from web users on the custom domain.
- Fix: move `APP_ORIGIN` to build config (EAS env) and pick one canonical origin before migrating. Effort: <1d + review

### B44-13 / FE-11 OAuthConsent.jsx is unrouted, depends on missing MCP config, and keeps being regenerated
- Tag: **VERIFIED**; future Builder behaviour **SUSPECTED**
- Severity: Low
- Evidence: not routed in src/App.jsx:85-138; tooling knip-configured.txt:10 lists it unused. src/pages/OAuthConsent.jsx:8 cites `base44/mcp/config.json` (no `base44/mcp` directory). It calls `/api/apps/${appId}/mcp/authorize-grant` (:91). History: added by a human (#55, cb39d78), deleted (#86 1c99808; #172 921fa4f), re-added by the Builder (46ef650; 4336ca3).
- Impact: dead code that signals an MCP server may be enabled on the Base44 app (U19).
- Fix: confirm the MCP server is off in the dashboard; stop the Builder template injection. Effort: <1h

### B44-21 Tests pin Base44/Deno source text and mock the Base44 HTTP API
- Tag: **VERIFIED**
- Severity: Medium (migration cost)
- Evidence: 51 of 581 single-line `assert.match/doesNotMatch` calls mention Base44/Deno idioms, e.g. tests/security/release-configuration.test.js:40-41 `/Deno\.env\.get\(["']ENABLE_BODY_COMPOSITION_SCAN["']\)/`, tests/security/entitlement-loader.test.js:191,201. tests/e2e/support/base44.js (485 lines) routes `**/api/apps/**` (:34, :48, :59, :255).
- Impact: any platform change breaks the security suite on string shape, not behaviour.
- Fix: move ordering checks into executed handler tests (docs/test-inventory.md:13 proposes this). Effort: >1d (~2-3 days)

---

## 9. What is already portable

### 9.1 `base44/shared`: 34 modules, 6,608 LOC, 0 platform imports
Every `from` is `./*.js`; 0 hits for `Deno.|process.env|base44:|npm:|jsr:|require(|import(` (writer re-ran). **VERIFIED**. Caveats: base44/shared/ownerScope.js:22 hard-codes the Base44 column `created_by_id`; base44/shared/openFoodFacts.js:60 sends a `recomp-iq.base44.app` User-Agent.

**Pure: 23 modules, 5,007 LOC, class (a).** LOC from `wc -l` (writer):

| Module | LOC | Module | LOC | Module | LOC |
|---|---|---|---|---|---|
| adaptiveMealPlanDomain | 994 | weeklyCheckInDomain | 304 | foodPhotoDomain | 111 |
| lifestyleCoachDomain | 404 | trackingRecordDomain | 302 | appleNotificationDomain | 98 |
| appleJwsVerify | 399 | fitnessTrends | 201 | fitnessAdherence | 92 |
| weeklyAutopilotDomain | 382 | fitnessAdjustments | 194 | openFoodFacts | 67 |
| coachDomain | 371 | bodyCompositionDomain | 173 | aiReportDomain | 53 |
| adaptiveTrainingBlockDomain | 350 | premiumDomain | 150 | appleAppAccountToken | 34 |
| — | — | defaultHabitsDomain | 143 | ownerScope | 28 |
| — | — | applePurchaseDomain | 121 | coachDayContext, httpUtils | 18 each |

19 do no I/O. 4 use Web globals only: openFoodFacts (`fetch`), appleJwsVerify and appleAppAccountToken (WebCrypto), httpUtils (`Response.json`).

**Store-injected: 11 modules, 1,601 LOC, class (b).** They take the entity accessor as a parameter, so a shim with the same methods (`filter(q, sort, limit, skip)`, `create`, `update`, `delete`, `deleteMany`, `updateMany`, `get`) ports them unchanged:

| Module | LOC | Base44 methods relied on (path:line) |
|---|---|---|
| coachRateLimitDomain | 255 | `deleteMany`/`create`/`filter` with `$lt/$gte` (:197-250); rank-after-insert, replaceable by constraints (B44-16) |
| weeklyCheckInPersistence | 187 | user entities (:43-183) |
| defaultHabitsProvisioning | 149 | `base44.entities` and `base44.asServiceRole.entities` (:19-136; SR at :61, :65) |
| googlePlayPurchaseDomain | 148 | :86-147 (rank-after-insert) |
| referralDomain | 141 | :109-139 (rank-after-insert) |
| trackingRecordPersistence | 141 | :34, :54, `updateMany` :113 |
| analysisUploadDomain | 131 | :126 |
| accountDeletionDomain | 122 | `deleteMany` :111 |
| entitlementAccess | 116 | `base44.asServiceRole.entities.PremiumEntitlement` :82 |
| aiReportRateLimitDomain | 110 | :84-107 |
| accountExportDomain | 101 | `filter(q, sort, limit, skip)` :47 |

### 9.2 Frontend
- **201 of 233 `src` JS/JSX files, 24,304 of 32,267 LOC (75%), have no SDK import and no injected Base44 handle.** They depend only on React contexts (`useAuth`, `useRecomp`, `usePremiumAccess`), so they port unchanged as long as those context interfaces are kept. Exception: dead src/pages/OAuthConsent.jsx (240 LOC) calls `/api/apps/*/mcp/*` with raw `fetch` (:40, :91). **VERIFIED** (writer: `comm` of all src files against the coupled list below).
- **Coupled: 32 files, 7,963 LOC.** 24 import `@/api/base44Client` (7,414 LOC; RecompContext.jsx alone is 1,947). 8 take or build the client: src/api/base44Client.js, src/lib/app-params.js, sessionEdit.js, planSettings.js, nutritionReportData.js, analysisImages.js, foodNutritionSync.js, signOutCore.js (549 LOC). Most of the 24 are pages with a single `functions.invoke` call; the heavy rewrite is RecompContext.jsx, AuthContext.jsx, app-params.js and the 4 auth pages. **VERIFIED**.
- src/lib/fitness (22 files, 2,333 LOC) and src/lib/seo (4 files, 1,846 LOC): 0 Base44 imports (writer `rg`). 21 src files import 14 `base44/shared` modules by relative path (25 statements), so domain code is already shared between browser and server. **VERIFIED**.
- Portable non-Base44 integrations: native IAP bridge (src/lib/nativeIapBridge.js), speech bridge `window.recompOneSpeech` (src/lib/nativeSpeechBridge.js:26-30), telemetry (src/lib/telemetry.js, off unless configured), store links. **VERIFIED** (A §6).

---

## 10. UNKNOWNS on Base44's side to export or document

Each item is state that lives only in the Base44 dashboard or runtime. All are **SUSPECTED** unless marked. U1-U30 come from F §7; U6, U12, U14, U17 and U21 add evidence from B and A; U31-U33 are new (from B's findings and its Could-not-assess list).

1. **U1: Deployed entity schemas and RLS** actually enforced, against the 25 repo jsonc files; Builder drift; whether jsonc constraints (enum, `maxLength`, `required`) are enforced server-side on browser writes. Depends: all 123 direct + 12 dynamic entity sites; base44/shared/ownerScope.js:3-7; B44-18.
2. **U2: Which accounts hold `role: admin`**, which grants CRUD on every user's health data under every RLS block. Depends: base44/entities/DailyLog.jsonc:103-112 (pattern in all 25); src/lib/PageNotFound.jsx:43.
3. **U3: Built-in User table:** fields, password-hash algorithm and exportability, email-verified flags, `created_date`. Depends: base44/shared/referralDomain.js:33-41; base44/functions/deleteAccount/entry.ts:58; base44/shared/entitlementAccess.js:60-61 (email match); deleted `User.jsonc` (6530f55).
4. **U4: OAuth providers:** owner of the Google client in `googleOAuthMode:"default"` (consent screen/branding); Apple Services ID and team (team-scoped `sub` and relay emails, the real portability risk); Microsoft/Facebook enabled but unused; redirect-URI and `from_url` allowlist rules. Depends: base44/auth/config.jsonc:3-10; src/pages/Login.jsx:36-42; expo-ios/src/nativeAuth.ts:76-85.
5. **U5: Token format, lifetime, refresh, revocation; HTTP-only cookie** name, scope, lifetime. Depends: src/lib/app-params.js:56,67-68; SDK modules/auth.js:170-186; src/pages/OAuthConsent.jsx:42.
6. **U6: App visibility and registration mode** (`auth_required`, `user_not_registered`, public); whether signup is open, which BE-02's app-wide AI ceilings assume. Depends: src/lib/AuthContext.jsx:59-70; src/components/ProtectedRoute.jsx:25-27; base44/shared/coachRateLimitDomain.js:32-33, 61-66.
7. **U7: Auth emails (OTP, reset):** sender, SPF/DKIM, templates, reset-link format. Depends: src/pages/Register.jsx:38,66; src/pages/ForgotPassword.jsx:19; src/pages/ResetPassword.jsx:11-12.
8. **U8: InvokeLLM:** the dashboard "app-level model" for coachReply and lifestyleCoachReply; what `gemini_3_flash` and `automatic` resolve to today; temperature; provider data retention/DPA/region; credit cost; rate limits. Depends: coachReply/entry.ts:155; lifestyleCoachReply/entry.ts:152; generateAdaptiveMealPlan/entry.ts:156; analyzeFoodPhoto/entry.ts:123; analyzeBodyComposition/entry.ts:164.
9. **U9: Private file storage:** location, retention, backup, deletion path (none in SDK 0.8.57), size limit, whether the LLM provider copies signed-URL content; count of stored files. Depends: uploadAnalysisPhoto/entry.ts:56; analyzeFoodPhoto/entry.ts:115-118; src/pages/Privacy.jsx:61-64.
10. **U10: Secret values and which are set**, including `APPLE_SANDBOX_ALLOWED_USER_IDS` (fails open when unset, base44/shared/premiumDomain.js:146-147) and `PREMIUM_TESTER_EMAILS`; whether `Deno.env` and `base44:runtime` read the same store. Depends: §7.
11. **U11: Production build-time `VITE_*` values** (which feature flags are on, functions version). Depends: src/lib/featureFlags.js:11-39; src/lib/app-params.js:103-106.
12. **U12: Function runtime:** Deno vs workerd (the plugin's runtime header says the bundler "threads a context through `globalThis.Base44`", node_modules/@base44/vite-plugin/dist/base44-runtime-plugin.js:15-23); wall-clock timeout (store and LLM calls have no client timeout, verifyApplePurchase/entry.ts:101-110); memory; instance count (in-memory Maps); body-size limit; public reachability of `/functions/<name>`; service-token injection on unauthenticated calls. Depends: ensureDefaultHabits/entry.ts:5; upsertTrackingRecord/entry.ts:10; verifyGooglePlayPurchase/entry.ts:14-17; appleStoreNotification/entry.ts:27.
13. **U13: Deployed function list.** `joinWaitlist` (deleted in repo e7e92e0) may still be live with a Gmail send path. Depends: `git show ed9ab25:base44/functions/joinWaitlist/entry.ts` :99-135 (`getConnection("gmail")` :102).
14. **U14: What is live:** which commit/version of frontend, functions and entities; the rollback point; whether 5824d0b (`usage.count()`) was ever published. Depends: docs/deploy-1-5.md:6; BE-V1.
15. **U15: Scheduled jobs, automations, webhooks** configured in the dashboard. **VERIFIED** absent in repo (`rg -i "cron|schedule|automation" base44` → only data fields and copy text); dashboard **SUSPECTED**.
16. **U16: SDK analytics data already collected** (user_id, session, page paths, heartbeats): retention, access, export, deletion. Depends: node_modules/@base44/sdk/dist/client.js:213; modules/analytics.js:51,291.
17. **U17: Android managed wrapper (`WixBrandedLiteApp`):** bridge API; whether it calls `window.handleAndroidBack` and honours `false`; permissions; upload key and Play Console ownership; assetlinks content; managed-manifest branding; whether it calls any backend function. Depends: android/play-release.json:3-12; src/lib/nativeStoreShell.js:1,15; src/components/AndroidBackHandler.jsx:10-27.
18. **U18: Whether realtime subscriptions honour RLS**; the code drops other owners' events client-side. Depends: src/lib/nutritionReportHook.js:19,23-25.
19. **U19: MCP server for the app:** enabled? tools/entities exposed to AI clients? `consent_path`? Depends: src/pages/OAuthConsent.jsx:7-11,40-42,91.
20. **U20: Gmail connector:** which Google account; whether the grant is still active. Depends: base44/connectors/gmail.jsonc:1-7.
21. **U21: Custom domain and SEO hosting:** DNS/TLS; `/api` routing on fitnesstrackerapps.com; per-page prerender list and meta-tag injection settings; response headers (XFO/CSP). Depends: src/api/base44Client.js:10; index.html:13; docs/base44-seo-configuration.md:9-21,76-79.
22. **U22: Bulk export/backup of all entity rows** with `id`, `created_by_id`, `created_date`, `updated_date`. The only in-repo export is per-user, capped at 20,000 rows per entity. Depends: base44/shared/accountExportDomain.js:10-12,38-47.
23. **U23: Platform quotas, rate limits, AI credit budget, billing plan.** Depends: all InvokeLLM sites; base44/shared/coachRateLimitDomain.js:241-253.
24. **U24: Test-data environment** (`X-Data-Env dev/prod`) and the `/prod/` public-settings path. Depends: node_modules/@base44/sdk/dist/client.js:419; src/lib/AuthContext.jsx:43.
25. **U25: Builder-only state:** unpushed Builder edits; the Builder's target-branch setting (main). Depends: 110 bot commits on main (§8).
26. **U26: Moderation workflow for AiContentReport.** **VERIFIED** that no code reads reports for moderation (only the submitter's dedupe/rate limit and per-user export); the workflow is **SUSPECTED**. Depends: base44/functions/reportAiContent/entry.ts:73-78; base44/shared/aiReportRateLimitDomain.js:91-95; src/pages/YourData.jsx:33.
27. **U27: Existing rows in writer-less entities:** CoachConversation, WaitlistEntry, PushDevice. Depends: §4.2.
28. **U28: App Store Connect:** notification URL, Sign in with Apple service config, sandbox tester ids. Depends: appleStoreNotification/entry.ts:6-8; verifyApplePurchase/entry.ts:13-27.
29. **U29: Base44 server-side logging** of `X-Origin-URL` (full URL including query) and request bodies. Depends: node_modules/@base44/sdk/dist/utils/axios-client.js:136-138.
30. **U30: Whether a user-scoped token may call `integrations.Core.*` directly** (InvokeLLM, UploadPrivateFile). The browser client exposes the module (node_modules/@base44/sdk/dist/client.js:176, writer opened) and src makes 0 such calls. If the platform allows it, every premium and quota gate in the functions is bypassable from devtools.
31. **U31: Manual referral reward process.** The UI promises a free month and 30% off (src/pages/Referrals.jsx:77-78,156-162). No code moves a Referral past `pending` (base44/shared/referralDomain.js:114-119). PremiumEntitlement has an `admin` source (base44/entities/PremiumEntitlement.jsonc:27-35), so rewards could be granted by hand in the dashboard. Whether anyone does, and which rows exist, is unknown (BE-01).
32. **U32: Hosted dev or preview environments.** Whether any Base44-hosted environment serves `serveCommand: "npm run dev"` (base44/config.jsonc:6), which would load the dev-only plugin injections, including the visual-edit agent (vite.config.js:19-24).
33. **U33: SDK 0.8.48 runtime resolution.** Whether the function runtime resolves `npm:@base44/sdk@0.8.48` exactly as written, or injects its own accessor (the 1093787 comment says "the entity accessor bundled into the function runtime has no count method", base44/shared/coachRateLimitDomain.js:238-241). Depends: line 1 of all 25 entry.ts files.

---

## 11. Could not assess

- **Base44 dashboard and runtime state:** deployed schemas/RLS, secrets, admins, OAuth providers, live version, function list, MCP server, analytics data, storage retention and quotas, Android wrapper, custom-domain/SEO settings, function timeouts and isolate model. All listed in §10. No dashboard access.
- **docs.base44.com:** blocked for the original F author (WebFetch ENOTFOUND) and not retried. All SDK semantics come from the installed 0.8.57 source and, for entity methods and the InvokeLLM model union only, the 0.8.48 tarball in the scratchpad. `createClientFromRequest`, auth and analytics behaviour in 0.8.48 were not read.
- **Live endpoints:** no requests to recomp-iq.base44.app or fitnesstrackerapps.com, so frame-ancestors/XFO headers, `/api` proxying on the custom domain and assetlinks content are unverified.
- **Execution:** Deno was not run and no function was invoked. expo-ios/node_modules is not installed, so `expo-web-browser` `openAuthSessionAsync` behaviour was not inspected. Playwright e2e cannot load (tooling e2e.txt).
- **GitHub branch protection:** only the required-checks part was read (`gh api …/branches/main`: none required). Review requirements and the bypass list were not readable.
- **Data volumes:** row counts per entity, number of paying Apple subscribers and number of stored photos are unknown. They decide whether B44-02 and B44-04 are live-data constraints or design rules, and they size the data-migration row (#22).
- **Effort estimates:** engineering judgement under the Supabase assumption. They exclude Base44 export lead time, the Play upload-key reset, App Review turnaround, an LLM output-parity eval, and any surprises from §10 (U1, U3, U4 and U22 can each add days).
- **Android wrapper and Base44 Builder internals:** not in the repo; behaviour is inferred from android/play-release.json, scripts and docs.
