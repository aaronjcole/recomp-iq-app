# 05 — General Health Sweep

Audit date: 2026-10-28 · Commit: 1093787 (origin/main) · Read-only audit

Sources: verified dossiers H (security), I (reliability/performance), J (quality/testing/a11y/config) and C (dependencies), plus the orchestrator tooling digest. `tooling/<file>` means `/tmp/claude-0/-home-user-recomp-iq-app/363ad519-3bee-54f6-bf9e-e120665568ef/scratchpad/tooling/<file>`. Finding IDs (SEC-, REL-, PERF-, QUAL-, TEST-, A11Y-, CFG-, DEP-) match the dossiers and the other audit documents. Where two dossiers reported the same thing, the entries are merged under one ID and the others are listed as "also". Conflicts between dossiers were settled by opening the code or querying GitHub; see [Dossier conflicts resolved](#dossier-conflicts-resolved).

## Top findings

1. **CI has failed on main for 14 consecutive pushes (#531 to #547, 2026-10-21 to 2026-10-23), and nothing gates main.** The Expo doctor step fails on live upstream data and skips every test after it. The Base44 Builder bot pushes quota and purchase code straight to main. See TEST-02.
2. **The Playwright e2e suite cannot load any test.** A spec imports `esbuild`, which the Vite 8 upgrade stopped installing. This is the only suite that renders UI, and the CI failure above hides it. See TEST-01.
3. **AI cost and abuse controls depend on platform behaviour or fail open.** Base44 Core integrations may be callable straight from the browser (SEC-01). Apple sandbox purchases grant production Premium (SEC-03). About 25 free accounts can take the coach offline app-wide for 24 h (SEC-04, SEC-V1). Food-photo analysis has no server-side kill switch (SEC-13).
4. **The client is fragile on bad networks.** Requests have no timeouts, and the 13 boot requests succeed or fail together (REL-02). A transient error at launch sends the user to /login (REL-01). Every refresh unmounts the whole UI (REL-03). The stale-chunk reload can loop (REL-04).
5. **The quality gates measure little.** ESLint applies 9 rules to 131 of 300 product files (QUAL-01, QUAL-02). The typecheck include matches 1 component file (QUAL-03). No backend handler or React component is executed by any test (TEST-05, TEST-07).

---

## 1. Security

**Verdict:** I found no hardcoded secrets, no browser-side LLM calls, no unsafe HTML sinks and no client writes to server-owned entities. The real exposure is platform-dependent integration access, fail-open Premium configuration, AI ceilings that are cheap to exhaust, an unmetered upload endpoint, and analysis photos that are never deleted.

### SEC-01 Server-side AI quotas hold only if Base44 refuses direct client calls to `Core.InvokeLLM` and the other Core integrations
- Tag: **SUSPECTED** (depends on Base44 platform authorization, which the repo does not show)
- Severity: High
- Evidence:
  - node_modules/@base44/sdk/dist/modules/integrations.js:68 sends `axios.post(`/apps/${appId}/integration-endpoints/Core/${endpointName}`, ...)` with the caller's token. The shipped bundle contains it: `grep -c integration-endpoints tooling/dist/assets/base44Client-DdFcsVrV.js` = 1.
  - node_modules/@base44/sdk/dist/modules/ai-gateway.js:14 adds a second LLM path, `${serverUrl}/api/apps/${appId}/ai/${providerPath}/v1`. It is wired in at node_modules/@base44/sdk/dist/client.js:198 and present in the bundle.
  - The repo never calls an integration from the browser. `rg -n 'InvokeLLM|integrations' src` returns 0 hits. All 5 `InvokeLLM` sites are backend `asServiceRole` calls (see "Checked and fine").
  - The usage counter is admin-only (base44/entities/CoachRequestUsage.jsonc:47-68). That protects the counter, not a direct `POST /integration-endpoints/Core/InvokeLLM` made with an end-user token.
- Impact: If Base44 accepts end-user tokens on Core endpoints, which is its documented frontend pattern, any signed-up user can call InvokeLLM, UploadFile, SendEmail or CreateFileSignedUrl from devtools. That spends app credits with no limit and skips every ceiling in base44/shared/coachRateLimitDomain.js. `requiresAuth: false` (src/api/base44Client.js:11) is only a client-side redirect switch and proves nothing either way.
- Fix: Ask Base44 whether frontend integration access can be disabled for this app and disable it, since nothing in src needs it. Otherwise add a credit-spend alarm. Effort: <1d (verification alone is <1h)

### SEC-03 Apple sandbox (free) purchases grant production Premium while `APPLE_SANDBOX_ALLOWED_USER_IDS` is unset
- Tag: **VERIFIED** (code; I reopened base44/shared/premiumDomain.js:146-147). **SUSPECTED** (secret state; only a doc claim is available).
- Severity: Medium
- Evidence:
  - base44/shared/premiumDomain.js:146-147: `const allowlist = parseIdAllowlist(allowlistRaw); if (allowlist.size === 0) return { allowed: true, sandbox: true, unconfigured: true };`
  - base44/functions/verifyApplePurchase/entry.ts:198-210 only calls `console.warn(... "APPLE_SANDBOX_ALLOWED_USER_IDS is not set")` and then writes the entitlement at :212-232.
  - docs/apple-premium-launch.md:64 marks the secret "⬜ set before launch". The TestFlight shell talks to the production origin (expo-ios/src/bridgeProtocol.ts:4, `APP_ORIGIN = "https://recomp-iq.base44.app"`).
- Impact: Every TestFlight tester can make a free, repeatable sandbox purchase and get the full `recompone_premium` bundle on their production account. That also makes the Premium AI ceilings (SEC-04) and food-photo analysis (SEC-13) free to abuse.
- Fix: Fail closed, denying sandbox purchases when the allowlist is empty, once the App Review demo account id is listed. Effort: <1h

### SEC-04 Whole-app daily AI ceilings are cheap to exhaust, which gives an attacker a kill switch for the coach and paid features
- Tag: **VERIFIED**
- Severity: High. Resolution: this dossier rated it Medium; High matches BE-02 (01) and 00 C6, because 25 free accounts lock paying users out for 24 h and SEC-03 makes Premium free for testers.
- Evidence:
  - base44/shared/coachRateLimitDomain.js:36-39 sets `FREE_COACH_QUOTA = { hourly: 5, daily: 20 }`.
  - :61-66 sets the `AI_FEATURE_DAILY_CEILINGS`: coach 500, meal_plan_ai_variety 200, body_composition 100, food_photo 800.
  - :242-251 rejects every account once `window.length > ceiling`.
  - Signup is open with 5 methods (base44/auth/config.jsonc:2-6).
  - coachReply requires only client-writable onboarding rows (base44/functions/coachReply/entry.ts:104-106).
  - The arithmetic: 500/20 = 25 free accounts lock the coach for everyone for a rolling 24 h. Food photo needs 800/60 = 14 Premium accounts, which SEC-03 makes free. SEC-V1 lets the photo ceilings be burned with no upload.
- Impact: The ceiling bounds the bill but hands any attacker a 24 h outage switch on the main free feature and the paid ones.
- Fix: Count ceilings separately for paying and free accounts (or exempt entitlement holders), and alert on ceiling hits. Effort: <1d

### SEC-05 Private analysis photos (food and front/side/back physique photos) are never deleted, not even on account deletion
- Tag: **VERIFIED** (no code deletes files). **SUSPECTED** (Base44 retention behaviour).
- Severity: Medium
- Evidence:
  - base44/functions/uploadAnalysisPhoto/entry.ts:56 calls `await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });`.
  - `rg 'DeleteFile|deleteFile|removeFile|DeletePrivateFile|DeleteUploaded|deleteUpload'` over the repo returns 0 hits.
  - The deletion cascade removes only the AnalysisUpload rows (base44/shared/accountDeletionDomain.js:46).
  - base44/functions/analyzeFoodPhoto/entry.ts:115-127 and base44/functions/analyzeBodyComposition/entry.ts:151-167 sign the file, run inference and return with no cleanup.
  - The gap is disclosed: src/pages/Privacy.jsx:61-64 says support "cannot currently request immediate deletion of a private file uploaded for optional photo analysis".
- Impact: Sensitive body images outlive both the analysis and the account. App and Play Store data-deletion answers must match the Privacy caveat.
- Fix: Get a delete-file API from Base44 and call it after analysis and in the cascade. Keep both photo flags off until then. Effort: <1d once an API exists

### SEC-07 `uploadAnalysisPhoto` has no Premium gate, no quota and no content sniffing, so a free account can upload unlimited 10 MB files
- Tag: **VERIFIED** (code). **SUSPECTED** (whether Base44 imposes its own storage caps).
- Severity: Medium
- Evidence:
  - base44/functions/uploadAnalysisPhoto/entry.ts:19-68 checks only the method, Content-Length and auth. `grep -c 'loadPremiumAccessRecords\|reserveFeatureRequest'` on the file returns 0.
  - The MIME check trusts the client's declared type (base44/shared/analysisUploadDomain.js:43).
  - `req.formData()` (entry.ts:44) buffers the body before validation (:55). The Content-Length pre-check runs only when the header is present (:23-26).
- Impact: Storage-cost abuse that never gets cleaned up (SEC-05), and arbitrary bytes stored under an image MIME type. The files are private, so the XSS impact is nil.
- Fix: Gate on the same Premium feature and quota as the analysis that follows, and check JPEG/PNG/WebP magic bytes. Effort: <1h

### SEC-13 `analyzeFoodPhoto` has no server-side release switch, so the "disabled" food-photo flow is reachable by API (also: CFG-03)
- Tag: **VERIFIED** (I reopened base44/functions/analyzeFoodPhoto/entry.ts and base44/shared/premiumDomain.js:42-49)
- Severity: Medium. Resolution: H rated this Low and J rated it Medium. Medium stands because the Bundle grants `food_photo` (base44/shared/premiumDomain.js:42-49, `"food_photo"` in `BUNDLE_FEATURES`) and SEC-03 makes the Bundle free for any TestFlight tester.
- Evidence:
  - src/lib/featureFlags.js:8-13 hides food photo "until the deployed environment has accepted that data flow" (`VITE_ENABLE_FOOD_PHOTO_SCAN`, default off). The flag is client-only.
  - README.md:74-75 says to keep the flow disabled until the private-upload, deletion, provider-retention, consent and Play Data Safety review is complete.
  - base44/functions/analyzeFoodPhoto/entry.ts reads only `Deno.env.get("PREMIUM_TESTER_EMAILS")` (:72), checks the entitlement and quota (:82), then calls `InvokeLLM` (:121). There is no ENABLE flag: grepping `ENABLE_FOOD_PHOTO` over base44 returns 0 hits.
  - Body composition, by contrast, has a server gate: base44/functions/analyzeBodyComposition/entry.ts:27-28, `Deno.env.get("ENABLE_BODY_COMPOSITION_SCAN") !== "true"`.
- Impact: Any Bundle subscriber or tester can send food photos to `gemini_3_flash` (entry.ts:123) while the product decision is "not enabled".
- Fix: Add an `ENABLE_FOOD_PHOTO_SCAN` check before the quota reservation in analyzeFoodPhoto and uploadAnalysisPhoto, and expose it through getPremiumAccess `releaseFlags`. Effort: <1h

### SEC-02 When the app is framed, the Base44 SDK posts every API request and response body to `window.parent` with target `"*"`, and nothing in the repo enforces frame protection
- Tag: **SUSPECTED** (live headers are served by Base44 and could not be fetched). **VERIFIED** (SDK behaviour).
- Severity: Medium
- Evidence:
  - node_modules/@base44/sdk/dist/utils/axios-client.js:148-160 posts `api-request-start` with `body: config.data`, and :174-181 posts `api-request-end` with `response: response.data`. Both go to `"*"`, guarded by `isInIFrame`. The bundle contains `window.parent.postMessage({type:`api-request-end`,...},`*`)`.
  - index.html has no CSP, X-Frame-Options or `http-equiv` meta (grep returns 0). vite.config.js has no headers config.
  - The live framing check exists (scripts/verify-android-release.mjs:160-176) but runs only under `verify:android:live` (package.json:17). CI runs only `verify:android` (.github/workflows/ci.yml:64-65).
- Impact: A third-party page that frames the app receives the JSON of every entity read and function response (weight, intake, coach messages, exports) whenever the framed app holds a session.
- Fix: Get Base44 to emit `frame-ancestors 'self' <editor origins>`, and add `verify:android:live` (or a curl header assertion) to a scheduled CI job. Effort: <1d (plus a Base44 ticket)

### SEC-08 The Premium tester bypass is an email allowlist in a secret, read through `Deno.env` in 9 functions
- Tag: **SUSPECTED** (secret contents and Base44 email-verification guarantees are platform-side)
- Severity: Medium
- Evidence:
  - base44/shared/entitlementAccess.js:46-51 parses the list. :114 has `if (isPremiumTester(user, options?.testerEmails)) return [TESTER_FULL_RECORD];`. :33 says "Clear the secret before production launch."
  - The secret is read through `Deno.env.get("PREMIUM_TESTER_EMAILS")` in analyzeBodyComposition:97, analyzeFoodPhoto:72, coachReply:119, generateAdaptiveMealPlan:85, generateAdaptiveTrainingBlock:74, generateWeeklyAutopilot:74, getPremiumAccess:46, lifestyleCoachReply:80 and swapAdaptiveMeal:25 (each in base44/functions/<name>/entry.ts). Every other secret uses `secrets.get` from `base44:runtime`.
  - docs/apple-premium-launch.md:63 says the secret is "✅ already set".
- Impact: Whoever controls an account with a listed email gets the full bundle. This is safe only if all 5 login methods verify email ownership before creating or linking an account, and nothing enforces the "clear before launch" step.
- Fix: Key the bypass on user ids, read it through `secrets.get`, and add a release-checklist gate. Effort: <1h

### SEC-V1 Food-photo and body-scan quotas are reserved before the photo-ownership check, so fake photo references burn per-user and whole-app ceilings with no upload and no inference
- Tag: **VERIFIED** (I reopened the ordering)
- Severity: Low (amplifies SEC-04)
- Evidence:
  - base44/functions/analyzeFoodPhoto/entry.ts:82 calls `reserveFeatureRequest(` before `verifyPhotoReferenceOwnership(` at :105. A bogus `photoUri` then returns 403 (:129).
  - base44/functions/analyzeBodyComposition/entry.ts:122 reserves before the check at :145.
  - base44/shared/coachRateLimitDomain.js:179-181 says "an allowed one is kept even if the paid call later fails".
- Impact: 14 Premium or tester accounts sending `{"photoUri":"x"}` 60 times each disable food-photo analysis app-wide for 24 h, at zero inference cost.
- Fix: Verify ownership before reserving quota, or delete the reservation when ownership fails. Effort: <1h

### SEC-06 `verifyGooglePlayPurchase` is deployed and callable, but grants non-expiring Premium with no acknowledgement, refund handling or test-purchase check (latent)
- Tag: **VERIFIED** (code). **SUSPECTED** (that nothing outside the repo acknowledges purchases).
- Severity: Low (latent: there is no caller in the repo; becomes Medium when Android billing ships)
- Evidence:
  - base44/functions/verifyGooglePlayPurchase/entry.ts:144 checks `purchase.purchaseState === 0`. :146-148 leave `expiresAt` null unless `expiryTimeMillis` exists.
  - There is no `:acknowledge` call, no RTDN or voided-purchases function, and `rg verifyGooglePlayPurchase` outside the function hits only docs and tests.
  - docs/android-play-release.md:123-126 marks the Play secrets as TODO.
- Impact: Once wired, unacknowledged purchases are auto-refunded by Google after 3 days while Premium stays. Refunds and chargebacks also keep Premium.
- Fix: Acknowledge purchases server-side, reject test `purchaseType`, bind `obfuscatedExternalAccountId`, and add an RTDN job. Alternatively, delete the function until Android billing ships. Effort: >1d (~2-3 days, matches BE-06), or <1h to remove

### SEC-09 The Apple webhook has no replay or freshness controls, and `REFUND_REVERSED` is unhandled
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - base44/functions/appleStoreNotification/entry.ts:40-80 verifies the JWS and applies the plan with no `notificationUUID` dedupe and no `signedDate` age check. The body is read unbounded (`req.text()`, :31).
  - base44/shared/appleJwsVerify.js:371-376 checks certificate validity at the payload's own `signedDate`.
  - base44/shared/appleNotificationDomain.js:12 has `REVOKE_TYPES = new Set(["REFUND", "REVOKE"])` and no reversal path.
- Impact: Only genuine Apple payloads can be replayed, and the outcomes are monotonic, so the practical risk is low. A refund reversal leaves the user revoked.
- Fix: Store the last `notificationUUID`/`signedDate` per entitlement, reject stale notifications, and handle `REFUND_REVERSED`. Effort: <1d

### SEC-11 Four side endpoints are unmetered: Apple verification, the Open Food Facts proxy, export and push registration (also: QUAL-17)
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - base44/functions/verifyApplePurchase/entry.ts:87-128 signs a JWT and makes 1-2 Apple calls per request, with no throttle.
  - base44/functions/searchFoods/entry.ts:29-37 and base44/functions/barcodeLookup/entry.ts:29-36 proxy Open Food Facts with no throttle.
  - base44/functions/exportAccountData/entry.ts:30 reads 26 cascade steps of up to 20,000 rows each (base44/shared/accountExportDomain.js:12), unthrottled.
  - base44/functions/registerPushToken/entry.ts:34-70 has no body cap and no per-user device cap. `rg registerPushToken` hits only the function and docs/features/reminders-and-integrations.md:7 ("No app code calls the function").
- Impact: One account can burn the app's Apple API limit, get the shared egress IP throttled by Open Food Facts (food search goes down for everyone), drive heavy service-role reads, or bloat PushDevice.
- Fix: Reuse `reserveFeatureRequest` with small quotas, and delete registerPushToken/PushDevice unless push is planned. Effort: <1d

### SEC-12 Coach prompts accept client-forged `role:"coach"` history
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - base44/shared/coachDomain.js:144-154 acknowledges that client history is untrusted. The transcript is embedded verbatim at :314-341.
  - Inputs are bounded at :11-14: 1,000-char message, 12 turns, 9,000 chars total.
  - Context is limited to the caller's own records (base44/functions/coachReply/entry.ts:95-145).
  - base44/functions/lifestyleCoachReply/entry.ts:162-171 persists LLM output to LifestyleProfile, but the function is hard-disabled (base44/shared/lifestyleCoachDomain.js:16).
- Impact: Self-only. A user can jailbreak their own coach within 20/40 requests a day. No cross-user data reaches a prompt.
- Fix: Accept the risk. Before enabling the lifestyle coach, keep the regex gate on persisted updates. Effort: <1h

### SEC-14 State-changing functions may be open to CSRF if Base44 also accepts cookie sessions
- Tag: **SUSPECTED** (cookie auth for functions is platform behaviour)
- Severity: Low
- Evidence: base44/functions/deleteAccount/entry.ts:24-32 parses `req.json()` regardless of Content-Type, and its only guard is `body?.confirmation !== "DELETE"` (:30). src/pages/OAuthConsent.jsx:33-34 says platform endpoints accept "the session (cookie + bearer token)".
- Impact: If functions honour a `SameSite=None` cookie, a malicious page could delete a logged-in user's account.
- Fix: Require `Content-Type: application/json` on deleteAccount, exportAccountData and the verify* functions. Effort: <1h

### SEC-V2 `public/auth/native-return.html` forwards any `access_token` it receives to the non-exclusive custom scheme `recompone://`
- Tag: **SUSPECTED** (needs Base44 to auto-redirect a signed-in user to `from_url`, plus a second iOS app claiming the scheme)
- Severity: Low
- Evidence:
  - public/auth/native-return.html:29-44 reads `access_token` from the query string and calls `window.location.replace(...)` to `recompone://auth?access_token=...`, with no nonce.
  - expo-ios/app.json:11 registers `"scheme": "recompone"`.
  - The safety claim at expo-ios/src/nativeAuth.ts:12-14 holds only inside ASWebAuthenticationSession.
- Impact: A malicious app registered for `recompone://` could receive a full bearer token.
- Fix: Add a shell-generated nonce to `from_url`, or move to an HTTPS associated-domain callback. Effort: <1d

### SEC-10 The iOS shell's IAP `sendResponse` lacks the origin guard that the speech bridge has
- Tag: **VERIFIED**
- Severity: Low (matches IOS-15 in 04, which covers the same `sendResponse` gap)
- Evidence: expo-ios/src/RecompOneWebView.tsx:117-125 has no `isTrustedAppUrl` check, while `sendSpeechResponse` at :90-98 has one. Listener and timer paths are reset by `onLoadStart` (:417-423). The residual window is the awaited restore/finish paths (:301-311, :320-331).
- Impact: Product and transaction ids could reach a Base44 auth-host page during a navigation race. The data value is low.
- Fix: Add `if (!isTrustedAppUrl(currentUrlRef.current)) return;` to `sendResponse`. Effort: <1h

### SEC-16 Admins can read every user's health records by design, and the Gmail connector (`gmail.send`) is orphaned
- Tag: **VERIFIED** (RLS; no repo consumer of the connector). **SUSPECTED** (admin roster; any platform-side connector use).
- Severity: Low (the Gmail half matches BE-11 / B44-11 / DEAD-12; admin read access alone would be Info)
- Evidence: All 17 user-owned entities allow `{"user_condition":{"role":"admin"}}` for C/R/U/D (for example base44/entities/DailyLog.jsonc:103), which base44/shared/ownerScope.js:3-7 acknowledges. base44/connectors/gmail.jsonc:1-7 requests `gmail.send`. Its only consumer, joinWaitlist, was deleted in e7e92e0.
- Impact: Any app admin or collaborator can read every user's weight and intake. The orphaned send scope widens the blast radius if the connector token leaks.
- Fix: Document the admin roster and remove the gmail connector. Effort: <1h

### SEC-17 Sign-out leaves on-device health data behind
- Tag: **VERIFIED**
- Severity: Info
- Evidence: src/lib/signOutCore.js:13-20 clears only onboarding drafts. Progress photos stay in IndexedDB `recompiq_progress_photos` (src/lib/progressPhotos.js:6). Plan caches (src/lib/planCache.js:42) and the workout session (src/components/training/WorkoutTracker.jsx:78) stay in localStorage.
- Impact: On a shared device, the data stays readable from devtools after sign-out. The unscoped `recomp_active_workout` key is worse: the next account resumes and can save the previous account's workout (FE-12 in 01, Medium).
- Fix: Clear user-scoped IndexedDB and localStorage keys in `signOutWith`. Effort: <1h

### SEC-18 Dead `OAuthConsent.jsx` navigates to an unvalidated, server-supplied `redirect_url`
- Tag: **VERIFIED** (dead). **SUSPECTED** (impact if revived).
- Severity: Info
- Evidence: src/pages/OAuthConsent.jsx:124 runs `window.location.href = data.redirect_url;`, and the scheme test at :125 runs after the navigation. The file is not routed in src/App.jsx, and knip lists it as unused (tooling/knip-configured.txt:10).
- Impact: None today.
- Fix: Do not delete it: the Builder re-adds it (FE-11 / DEAD-04); knip-ignore it instead. If it is ever routed, validate `redirect_url` against the app origin before navigating. Effort: <1h

### SEC-20 Security docs make stale claims
- Tag: **VERIFIED**
- Severity: Info
- Evidence:
  - docs/improvement-plan.md:152 and :370 say coachReply has "no throttle", but base44/functions/coachReply/entry.ts:123 calls `reserveCoachRequest`.
  - docs/improvement-plan.md:233 says BodyCompositionScan calls InvokeLLM in the browser. It invokes `analyzeBodyComposition` (src/components/progress/BodyCompositionScan.jsx:100).
  - docs/security-audit.md:53-55 discusses a deleted function.
  - docs/security-audit.md:61 ("`main` requires pull requests, an up-to-date branch, `verify`...") is false (TEST-02).
- Impact: Readers mis-prioritise issues that are already fixed and miss open ones.
- Fix: Refresh docs/security-audit.md from this document. Effort: <1h

SEC-15 (unreviewed bot commits to main with CI red) is merged into TEST-02 and CFG-05.

### Checked and fine (VERIFIED)
- **Secrets.** A `git ls-files` sweep for sk-/AIza/AKIA/ghp_/xox/`BEGIN … PRIVATE KEY` hits only tests/fixtures/apple-jws/*.pem. That fixture is generated by tests/fixtures/apple-jws/generate.sh:76 and used only by tests/security/apple-jws-verify.test.js:42. No .env or credential files are tracked. `import.meta.env` reads only non-secret `VITE_` flags.
- **LLM calls.** There are exactly 5 `InvokeLLM` sites, all backend `asServiceRole`, and each is Premium-gated or quota-reserved before inference:
  - base44/functions/coachReply/entry.ts:155
  - base44/functions/lifestyleCoachReply/entry.ts:152 (disabled)
  - base44/functions/analyzeFoodPhoto/entry.ts:121
  - base44/functions/analyzeBodyComposition/entry.ts:162
  - base44/functions/generateAdaptiveMealPlan/entry.ts:148

  No Anthropic or other LLM key or endpoint appears in src or the bundle.
- **Unsafe HTML.** dangerouslySetInnerHTML, innerHTML, outerHTML, document.write, eval(, new Function, insertAdjacentHTML and srcdoc have 0 hits across src, expo-ios/src, public, scripts and index.html. Return paths are validated (src/lib/authReturnTo.js:11-33). URL `access_token` is accepted only with a same-tab marker under 10 minutes old (src/lib/app-params.js:41-73).
- **Entity writes from the client.** `rg 'entities\.(PremiumEntitlement|CoachRequestUsage|Referral|ReferralCode|AiContentReport|AnalysisUpload|PushDevice|WaitlistEntry)' src expo-ios/src` returns 0. The dynamic `entities[stage.name]` (src/lib/planSettings.js:155) is limited to 3 user-owned entities (:143-145).
- **Apple purchase.** The JWS chain is pinned to Apple Root G3 (base44/shared/appleJwsVerify.js:304, :336-379). Account binding uses `appAccountToken` (base44/functions/verifyApplePurchase/entry.ts:191-194). The client finishes the transaction only after server verification (src/components/premium/PremiumPaywall.jsx:46-52).
- **Deletion completeness.** The cascade covers 25/25 entities. Empty filters throw (base44/shared/accountDeletionDomain.js:80-94). The only gap is files (SEC-05).
- **@base44/vite-plugin options.** `visualEditAgent`, `hmrNotifier` and `navigationNotifier` (vite.config.js:19-24) are injected in dev only (node_modules/@base44/vite-plugin/dist/html-injections-plugin.js:57-66, :286-293).

### Function authorization and input validation (all 25)
All rows are **VERIFIED** (H opened each file). Line numbers refer to base44/functions/&lt;name&gt;/entry.ts.

| Function | Auth | Owner scoping | Input validation | Gap | Tag |
|---|---|---|---|---|---|
| analyzeBodyComposition | auth.me :67 | `created_by_id` :47-53 | 10 KB cap :59 | quota before ownership (SEC-V1) | **VERIFIED** |
| analyzeFoodPhoto | auth.me :42 | AnalysisUpload ref :105-109 | 4 KB cap :34 | no release switch (SEC-13); SEC-V1 | **VERIFIED** |
| appleStoreNotification | Apple JWS :40 (webhook) | `external_transaction_id` | no body cap :31 | replay (SEC-09) | **VERIFIED** |
| barcodeLookup | auth.me :12 | n/a | barcode regex :30 | unmetered (SEC-11) | **VERIFIED** |
| coachReply | auth.me :57 | `ownedQuery` :27-33 | 24 KB cap :49 | none | **VERIFIED** |
| decideWeeklyCheckIn | auth.me :27 | `ownedQuery` | 8 KB cap :37 | none | **VERIFIED** |
| deleteAccount | auth.me :13 | cascade bound to user.id | `confirmation==="DELETE"` :30 | CSRF unknown (SEC-14) | **VERIFIED** |
| ensureDefaultHabits | auth.me :30 | `ownedQuery` | no body | none | **VERIFIED** |
| exportAccountData | auth.me :19 | deletion-plan filters | no body | heavy, unmetered (SEC-11) | **VERIFIED** |
| generateAdaptiveMealPlan | auth.me :62 | `created_by_id` :41-47 | 2 KB cap :54 | none | **VERIFIED** |
| generateAdaptiveTrainingBlock | auth.me :52 | `created_by_id` :33-34 | 2 KB cap :44 | none | **VERIFIED** |
| generateWeeklyAutopilot | auth.me :52 | `created_by_id` :33-34 | 2 KB cap :44 | none | **VERIFIED** |
| getOrCreateReferralCode | auth.me :25 | `owner_id` | no body | filter-then-create (REL-17) | **VERIFIED** |
| getPremiumAccess | auth.me :33 | loader `owner_id` | no body | none | **VERIFIED** |
| getReferralStats | auth.me :12 | `owner_id`/`referrer_id` | no body | count capped at 100 (REL-15) | **VERIFIED** |
| lifestyleCoachReply | auth.me :60 | `created_by_id` :34-36 | 48 KB cap :52 | hard-disabled :71 | **VERIFIED** |
| recordReferralSignup | auth.me :24 | referee = user.id | 4 KB cap :16 | none | **VERIFIED** |
| registerPushToken | auth.me :24 | `owner_id` | token ≤512 :44, no body cap | no caller, unbounded rows (SEC-11) | **VERIFIED** |
| reportAiContent | auth.me :40 | `owner_id` | 4 KB cap :32 | none (10/h) | **VERIFIED** |
| searchFoods | auth.me :12 | n/a | query ≤100 :29 | unmetered (SEC-11) | **VERIFIED** |
| swapAdaptiveMeal | auth.me :20 | via loader | normalizeSwapRequest :34; no method or size check | 401 becomes 500 (:46-48) | **VERIFIED** |
| uploadAnalysisPhoto | auth.me :31 | `owner_id` :57 | declared MIME/size only | no gate or quota (SEC-07) | **VERIFIED** |
| upsertTrackingRecord | auth.me :40 | normalizeTrackingRequest(body, user.id) :59 | 16 KB cap :32 | cross-instance race (REL-07) | **VERIFIED** |
| verifyApplePurchase | auth.me :138 | appAccountToken :191-194 | 4 KB cap :150; product allowlist :166 | sandbox fail-open (SEC-03) | **VERIFIED** |
| verifyGooglePlayPurchase | auth.me :169 | first-come token binding | 4 KB cap :181; product allowlist :196 | latent revenue holes (SEC-06) | **VERIFIED** |

Entity RLS (**VERIFIED** for the repo, **SUSPECTED** for what is deployed): 8 server-owned entities are admin-create-only. They are PremiumEntitlement (base44/entities/PremiumEntitlement.jsonc:62-82), CoachRequestUsage (:47-68), PushDevice (:46-66), Referral (:55-75), ReferralCode (:27-47), WaitlistEntry (:45-65), AiContentReport (:59-86) and AnalysisUpload (:30-58). The other 17 are creator-or-admin. No user-owned entity holds a privilege field. Three things cannot be checked from the repo: whether the deployed RLS matches it, whether `created_by_id` is immutable, and whether `auth.updateMe` can change `role`.

### npm audit
Merges SEC-19 and DEP-15.

| Tree | Result | Packages | Tag |
|---|---|---|---|
| root | 0 vulnerabilities (tooling/npm-audit.txt: `found 0 vulnerabilities`) | 523 (prod 294, dev 227, optional 28, peer 1; tooling/npm-audit.json) | **VERIFIED** |
| expo-ios (lockfile-only audit; node_modules not installed) | 9 vulnerabilities: 4 high, 5 low (tooling/expo-npm-audit.txt) | 493 | **VERIFIED** |

| Advisory | Severity | Locked version and path (expo-ios/package-lock.json) | Fix | Tag |
|---|---|---|---|---|
| node-forge ≤1.4.0, GHSA-86w9-cpqp-85rv (RSA PKCS#1 v1.5 signature check) | high | 1.4.0, from `@expo/code-signing-certificates@0.0.6` and `expo/node_modules/@expo/cli@57.0.31` (`^1.3.3`) | `npm audit fix` (no `--force`) lifts it to 1.4.2, already published inside `^1.3.3` | **VERIFIED** |
| zod <4.6.6, GHSA-mrhx-c7xc-m3w5 (memory exhaustion) | high | 3.25.76, from @expo/cli only | wait for Expo to move to zod 4 (3.25.76 is the newest 3.x) | **VERIFIED** |
| deepmerge ≥4.2.0, GHSA-gcqx-w48m-w2h4 (prototype poisoning) | low (dependents listed) | 4.3.1, from `@expo/config@57.0.10` | wait for an Expo patch | **VERIFIED** |
| expo, @expo/cli, @expo/config, @expo/metro-config, @expo/prebuild-config, @expo/local-build-cache-provider | listed as dependents only | — | npm's `--force` fix installs expo@51.0.39, a downgrade. Do not apply it. | **VERIFIED** |

- Exposure: these are CLI, prebuild and Metro-config packages. The shell's runtime imports are only expo, expo-speech-recognition, expo-status-bar, expo-web-browser, react, react-native, react-native-iap and react-native-webview (import sweep of expo-ios/App.tsx, index.ts, src). That they are absent from the shipped bundle is **SUSPECTED**, because no Metro bundle was produced. Severity: Low.
- PR #196 (expo 57.0.31) still locks node-forge 1.4.0, zod 3.25.76 and deepmerge 4.3.1.
- Fix: run `npm audit fix` in expo-ios now. Effort: <1h

---

## 2. Reliability

**Verdict:** All 25 backend handlers return JSON errors with explicit statuses. The client is fragile. Requests have no timeouts, boot is all-or-nothing across 13 requests, a transient error routes to /login, every refresh unmounts the UI, the chunk-reload guard can loop, and 5 mutation paths fail silently. CI being red on main is the biggest reliability risk to the codebase; it is covered under TEST-02.

### REL-01 A transient non-auth error at launch sends a signed-in user to /login
- Tag: **VERIFIED** (traced end to end; I reopened src/lib/AuthContext.jsx:77-86 and :114-127)
- Severity: Medium
- Evidence:
  - When public settings fail with anything other than a 403 with a reason, src/lib/AuthContext.jsx:77-86 sets `type: 'unknown'`, `setIsAuthenticated(false)` and `setAuthChecked(true)`.
  - When `auth.me()` fails, the catch at :114-127 sets `setIsAuthenticated(false)` and records an `authError` only for 401/403 (:121). Offline, timeouts and 5xx record nothing.
  - src/components/ProtectedRoute.jsx:25-34 returns `<Navigate to="/login" replace />` (src/App.jsx:107) for any `authError` or `!isAuthenticated`.
  - There is no retry: the re-check runs only while `!authChecked` (ProtectedRoute.jsx:15-19), and both failure paths set it to true.
  - src/pages/Login.jsx:13-34 does not redirect a user who is already authenticated.
- Impact: On a flaky mobile network or during a Base44 5xx, the user lands on the login form even though the token is still in localStorage (src/lib/app-params.js:21-28). No data is lost.
- Fix: Treat non-auth statuses as "offline", show a retry screen with backoff, and route to /login only on 401/403. Effort: <1d

### REL-02 Client requests never time out, and the blocking initial load is all-or-nothing across 13 requests with no automatic retry
- Tag: **VERIFIED** (code). **SUSPECTED** (how long a hung request lasts in each WebView).
- Severity: Medium
- Evidence:
  - node_modules/@base44/sdk/dist/utils/axios-client.js:118-126 calls `axios.create({ baseURL, headers })` with no `timeout`, and axios defaults to 0 (never). src/api/base44Client.js:6-13 adds none.
  - src/lib/RecompContext.jsx:340-356 runs `Promise.all([` over 13 queries, and only TrainingBlock has `.catch(() => [])` (:352). Any other rejection shows the full-screen "We couldn't load your data" (:1926-1943), which offers a manual Try again only.
  - React Query's `retry: 1` (src/lib/query-client.js:8) does not apply, because data loading does not use React Query.
  - The public-settings GET and `auth.me()` (AuthContext.jsx:43, :105) also have no timeout, and `<AppSplash />` stays up while either is pending (src/App.jsx:78-80).
- Impact: One slow query out of 13 holds the app behind a spinner indefinitely. One failed query replaces the whole app with an error screen.
- Fix: Wrap SDK calls with an AbortSignal timeout, use `Promise.allSettled` for non-critical datasets, and retry once with backoff. Effort: <1d

### REL-03 Every `reload()` unmounts the whole authenticated UI: pull-to-refresh, More > Refresh data, and the deleteSession failure path
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - src/lib/RecompContext.jsx:333 calls `setLoading(true)` at the start of every `loadInitial`. While loading, :1919-1924 renders a fixed spinner instead of `<Outlet />`.
  - That unmounts AppLayout, the keep-alive tab cache (src/components/AppLayout.jsx:20, :25, :60-64) and every page's local state.
  - `reload()` is called from Today.jsx:70, Nutrition.jsx:336, Training.jsx:66, Progress.jsx:126, More.jsx:191 and RecompContext.jsx:1152-1154 (all in src/pages except the last).
- Impact: A pull-to-refresh flashes a full-screen spinner and remounts every tab, losing scroll positions, open sheets and unsaved input. If the refresh fails, the error screen replaces the app.
- Fix: Split `initialLoading` (gates first render) from `refreshing` (keeps the outlet mounted), and toast on refresh failure. Effort: <1d

### REL-04 The stale-chunk recovery can reload in a loop, despite its "can never loop" comment
- Tag: **VERIFIED** (logic; I reopened src/lib/lazyWithRetry.js and src/main.jsx). **SUSPECTED** (how often the trigger occurs).
- Severity: Medium
- Evidence:
  - src/lib/lazyWithRetry.js:5-6 says "ONE hard reload ... guarded so it can never loop". The guard is a sessionStorage key set in `hardReloadOnce` (:25-37).
  - src/main.jsx:10 calls `markChunksLoaded()` unconditionally when the entry evaluates, which removes the key (lazyWithRetry.js:41-48) before any lazy route chunk loads. The in-memory `reloadedThisLoad` (:13) resets on every page load.
  - `vite:preloadError` (:57) feeds the same function.
  - No e2e test greps for `preloadError|chunk`. tests/security/observability.test.js:152-153 checks only that the function does not throw.
- Impact: When index.html and the entry load but a route chunk keeps failing (a cached shell offline, a partial deploy, a CDN 404), the WebView reloads endlessly, with 3 import attempts per cycle.
- Fix: Clear the guard only after a lazy chunk resolves, or allow one reload per N minutes using a timestamp. Effort: <1h

### REL-05 RouteErrorBoundary sits above AppLayout and RecompGate, so a crash on one screen also removes the tab bar and resets all app data
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - src/App.jsx:158-162 wraps `<RouteErrorBoundary><Suspense ...><AuthenticatedApp />`. AppLayout (:111) and RecompGate (:108) are descendants.
  - src/components/RouteErrorBoundary.jsx:4-5 claims the nav stays interactive, but the bottom nav lives inside AppLayout (src/components/AppLayout.jsx:81-120).
  - "Try again" only clears `hasError` (src/components/ErrorBoundary.jsx:36-39), which remounts RecompProvider and runs a full reload.
  - Only 2 boundaries exist (App.jsx:151, :158).
  - Tab switches use `replace` (AppLayout.jsx:89), so there is no history entry to swipe back to. iOS back-swipe (expo-ios/src/RecompOneWebView.tsx:436) rescues only pushed sub-pages.
- Impact: A deterministic render crash on a tab root, such as Today at launch, strands an iOS user on "This screen hit a snag" with no tab bar. Only killing the app gets them out.
- Fix: Put a RouteErrorBoundary keyed on the pathname around `{outlet}` and each cached tab inside AppLayout.jsx:60-79. Effort: <1h

### REL-06 Five UI mutation paths produce unhandled rejections and show the user nothing
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - src/components/today/HabitsCard.jsx:91 and :99 call `upsertHabitEntry(...)` with no catch. It rolls back and rethrows (src/lib/RecompContext.jsx:948-968).
  - src/components/today/HabitEditor.jsx:149 `onClick={() => archiveHabit(h.id)}` has no catch and no busy state.
  - src/components/training/SessionHistory.jsx:154 `onClick={() => deleteSession(s.id)}` has no catch and no in-flight guard. On failure, `deleteSession` calls `reload()` (REL-03) and rethrows (RecompContext.jsx:1152-1155).
  - src/pages/More.jsx:175-183 wraps `runCheckIn()` in `try { ... } finally {` with no catch.
  - The global handlers (src/lib/telemetry.js:120-126) only `console.error` unless telemetry is enabled (REL-18).
- Impact: The UI silently reverts, or nothing happens, and production keeps no trace.
- Fix: Add a toast-on-catch at all 5 sites, and disable Delete while the request is in flight. Effort: <1h

### REL-07 DailyLog nutrition increments can be lost when two devices write the same day concurrently and hit different function instances
- Tag: **VERIFIED** (code, self-documented). **SUSPECTED** (frequency, which depends on Base44 instance routing).
- Severity: Medium
- Evidence:
  - base44/shared/trackingRecordPersistence.js:107-109 says: "This is not distributed CAS; independent function instances retain the existing race."
  - The record is read via `readRecords()` (:58, :71) and written with a plain `entity.update(canonical.id, fields)` (:110).
  - Writes are serialized only per instance (an in-memory Map, base44/functions/upsertTrackingRecord/entry.ts:10-25) and per tab (src/lib/RecompContext.jsx:226, :788).
  - No repair job rebuilds totals from FoodLogEntry rows.
- Impact: Logging food on phone and web in the same window can drop an increment, after which FoodLogEntry rows and DailyLog totals disagree permanently.
- Fix: Add a revision field with a guarded `updateMany({id, revision})` retry (the pattern at src/lib/planSettings.js:155), or recompute totals server-side. Effort: <1d

### REL-08 A getPremiumAccess failure locks Premium for the whole session, and gated pages tell paying users they need Premium
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - src/lib/PremiumAccessContext.jsx:74-79 sets `EMPTY_PREMIUM_ACCESS` and `setIsUnavailable(true)` on failure.
  - The refresh runs only on `[isAuthenticated, user?.id]` changes (:85-87) and from the iOS purchase and restore handlers (src/components/premium/PremiumPaywall.jsx:111, :143).
  - `isUnavailable` is read only by src/pages/Premium.jsx:95 and PremiumPaywall.jsx:252. The gated pages show "requires verified Premium access" instead (src/pages/AdaptiveMealPlan.jsx:215-219; same gate at src/pages/AdaptiveTrainingBlock.jsx:152 and src/pages/WeeklyAutopilot.jsx:133).
- Impact: One transient failure at launch locks every Premium feature for paying users, with the wrong copy, until restart. Restore on iOS is the only workaround.
- Fix: Show an "unavailable, retry" state when `isUnavailable`, and retry with backoff and on focus. Effort: <1h

### REL-09 Day rollover and resume are not handled: the selected date and the data freeze at mount time
- Tag: **VERIFIED** (code). **SUSPECTED** (how long the WebView keeps the JS context alive).
- Severity: Medium
- Evidence:
  - src/lib/LoggingDateContext.jsx:22 uses `useState(() => sanitizeDateParam(urlDate))`, which evaluates `todayStr()` once (src/lib/loggingDateUtils.js:43-45).
  - `todayLog` is memoized on `[logs]` only (src/lib/RecompContext.jsx:559).
  - Only nutritionReportHook.js, nativeSpeechBridge.js and WorkoutTracker.jsx listen for `visibilitychange` in src. The iOS AppState handler only cancels speech (expo-ios/src/RecompOneWebView.tsx:108-112).
- Impact: A user who reopens the app the next morning is on yesterday's date under a "Log" heading (src/pages/Today.jsx:75) and can log breakfast into yesterday.
- Fix: On `visibilitychange`, reset `selectedDate` to today if it equalled the old today, and run a non-blocking refresh. Effort: <1d

### REL-10 Backend calls to Apple and Google have no timeouts
- Tag: **VERIFIED** (code). **SUSPECTED** (Base44 function wall-clock limit).
- Severity: Low
- Evidence:
  - base44/functions/verifyGooglePlayPurchase/entry.ts:102-109 and :135-137, and base44/functions/verifyApplePurchase/entry.ts:101-110, use plain `fetch`.
  - Grepping `signal|AbortController|timeout` across base44/functions/*/entry.ts returns 0 hits. Only Open Food Facts has a timeout (8 s, base44/shared/openFoodFacts.js:5, :54-67).
  - The Google OAuth token is minted on every call (verifyGooglePlayPurchase/entry.ts:126).
- Impact: An Apple slowdown holds the purchase spinner until the platform kills the function, and the user then sees "Purchase incomplete" (PremiumPaywall.jsx:115) after StoreKit has already charged them. The Google half is latent because nothing calls that function.
- Fix: Use a shared 8-10 s AbortController helper for all outbound fetches, and cache the Google token. Effort: <1h

### REL-11 Background history merges can bring back sessions and strength logs the user just deleted
- Tag: **VERIFIED** (logic). **SUSPECTED** (frequency).
- Severity: Low
- Evidence: src/lib/RecompContext.jsx:440-447 merges sessions and strength logs using an "id not in prev" rule, so a snapshot fetched before a delete (:1135-1137) puts the rows back. `ensureDateLoaded` merges the same way (:519-523). Only FoodLogEntry has a tombstone set (`deletedFoodIds`, :223).
- Impact: A deleted session can reappear until the next reload, and any later edit to it fails.
- Fix: Keep per-entity tombstones and version-stamp history requests. Effort: <1d

### REL-12 Purchase entitlement races
- Tag: **SUSPECTED** (depends on Base44 read-after-write consistency)
- Severity: Low
- Evidence: Google uses rank-after-insert. When the caller's own row is not yet visible, it loses (base44/shared/googlePlayPurchaseDomain.js:46-49) and gets a 409 (base44/functions/verifyGooglePlayPurchase/entry.ts:229-231). Apple uses filter-then-create (base44/functions/verifyApplePurchase/entry.ts:215-230).
- Impact: Read lag could produce a false "linked to another account" error for a Google buyer, and duplicate Apple rows.
- Fix: Re-read once before giving up, and dedupe Apple rows. Effort: <1d

### REL-13 Default-habit provisioning is check-then-create across instances and blocks the first app load
- Tag: **VERIFIED** (blocking and check-then-create). **SUSPECTED** (race frequency).
- Severity: Low
- Evidence: base44/shared/defaultHabitsProvisioning.js:76-86 checks `if (habits.length === 0)` and then creates 3 habits. At 3 calls each plus 4 reads, that is about 13 sequential backend calls. The client awaits it inside the blocking load (src/lib/RecompContext.jsx:383-396).
- Impact: A new account's first Today render waits on about 13 serial calls. Two tabs can briefly show 6 starter habits.
- Fix: Run it after first render and parallelize the creates. Effort: <1h

### REL-14 AI quota is charged even when the paid call fails
- Tag: **VERIFIED**
- Severity: Low
- Evidence: The quota is reserved at base44/functions/coachReply/entry.ts:123-135. An LLM failure returns 502 at :166-168 and does not release it, as designed (base44/shared/coachRateLimitDomain.js:179-181).
- Impact: During an LLM outage, a free user pressing Retry (src/pages/Coach.jsx:194-202) burns the 5/h allowance and the app-wide ceiling.
- Fix: Delete the reservation when the upstream call throws before producing output. Effort: <1h

### REL-16 Decision history shows a false empty state before history loads, and after a failed history load it and the weekly check-in stay stuck
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - loadHistory gives up after 3 retries with only `console.warn` (src/lib/RecompContext.jsx:37, :476-484).
  - src/components/common/DecisionLedgerTimeline.jsx:52-61 renders "No plan changes yet" without checking `historyLoaded`.
  - After a final failure, the More check-in subtitle stays "Loading your history…" (src/pages/More.jsx:230-231).
- Impact: Users are told they have no history, and the check-in is silently disabled.
- Fix: Read `historyLoaded`, expose `historyError`, and add a retry. Effort: <1h

### REL-17 Referrals: one failure hides both the code and the stats, and the zeros look real
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/pages/Referrals.jsx:17-29 uses `Promise.all` with a catch commented "the page still renders with a retry option", but no retry control exists. The fallback is text at :115, and the stats default to 0 (:68-70). Code creation is filter-then-create (base44/functions/getOrCreateReferralCode/entry.ts:36-59).
- Impact: A stats-only failure hides a working link, and a failed call shows "0 signups".
- Fix: Use `allSettled`, add a Retry button, and render "—" on failure. Effort: <1h

### REL-18 Crash and rejection telemetry is off by default
- Tag: **SUSPECTED** (the Base44 build environment is not in the repo)
- Severity: Low
- Evidence: src/lib/featureFlags.js:22 enables telemetry only for `VITE_ENABLE_TELEMETRY === "true"`, and delivery also needs `VITE_TELEMETRY_ENDPOINT` (src/lib/telemetry.js:10, :74-76). Neither is set anywhere in the repo. Without them, the global handlers only `console.error` (:101).
- Impact: The failures in REL-01, REL-02, REL-06 and REL-08 cannot be measured in production.
- Fix: Enable crash-only delivery after the Data Safety update. Effort: <1d

### REL-20 Multi-record writes are serial client-side sequences with compensation, not atomic
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - saveTrainingSession runs 1 + N creates and deletes them all on error (src/lib/RecompContext.jsx:1043-1071).
  - logFoodEntries runs N creates and then the totals update (:1338-1348).
  - saveTrainingBlock swallows the archive error (`.catch(() => undefined)`, :1002).
- Impact: An app kill mid-sequence leaves orphaned partial sessions or unapplied FoodLogEntry totals (feeding REL-07), and can leave two active training blocks.
- Fix: Move the sequences into a backend function that writes and compensates server-side. Effort: >1d (~2-3 days, matches FE-19)

### REL-V1 A failed on-demand load for a past date is silent, and the day renders as empty with zero totals
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/RecompContext.jsx:493-494 marks the date as loaded immediately. On failure it only unmarks it and calls `console.warn` (:532-536). src/pages/Today.jsx:89 renders `selectedLog?.calories ?? 0`.
- Impact: On a flaky connection, users see days that look empty and may re-log food, which over-counts once the real data loads.
- Fix: Track per-date loading and error state, and render a skeleton plus Retry. Effort: <1d

### REL-19 Offline support is a banner only
- Tag: **VERIFIED** (repo). **SUSPECTED** (whether the host injects a service worker).
- Severity: Info
- Evidence: src/components/OfflineBanner.jsx:18-24 shows "You're offline — changes are not saved." Grepping `serviceWorker|workbox|sw.js` in src, index.html, public and vite.config.js returns 0.
- Impact: Behaviour matches the banner. Offline cold starts are poor because of REL-01 and REL-04.
- Fix: None beyond REL-01 and REL-04. Effort: n/a

### Error-handling inventory
| Scope | Sites | Unhandled | Evidence | Tag |
|---|---|---|---|---|
| UI → context actions / base44.* | ~75 (count not re-derived) | 5 | REL-06 sites: src/components/today/HabitsCard.jsx:91, :99; src/components/today/HabitEditor.jsx:149; src/components/training/SessionHistory.jsx:154; src/pages/More.jsx:175-183 | **VERIFIED** (5 sites); **SUSPECTED** (total) |
| RecompContext actions | 37 (src/lib/RecompContext.jsx:1752-1789) | 0 internal; each rolls back and rethrows to the caller | src/lib/RecompContext.jsx:403-405, :472-485, :532-536 | **VERIFIED** |
| `.then(` chains excluding `import()` | 9 | 0 | e.g. src/components/progress/ProgressPhotos.jsx:258 and src/components/premium/PremiumPaywall.jsx:76 have `.catch` | **VERIFIED** |
| Backend entry.ts | 25 | 0 known reachable. 7 rethrow non-domain normalization errors outside the JSON path (e.g. base44/functions/coachReply/entry.ts:81), and swapAdaptiveMeal maps 401 to 500 (:46-48) | per-file `grep -c 'try {'` = 2-5 | **VERIFIED** (code); **SUSPECTED** (reachability) |

### Loading / empty / error states (pages with gaps; full table in dossier I)
| Page | Loading | Empty | Error | Evidence | Tag |
|---|---|---|---|---|---|
| Today | inherited from RequireOnboarding; own skeleton is dead code | none: shows 0 kcal (REL-V1) | inherited only | src/pages/Today.jsx:49-62, :89 | **VERIFIED** |
| More | "Loading your history…", permanent after a history failure (REL-16) | n/a | check-in has none (REL-06) | src/pages/More.jsx:230-231, :175-183 | **VERIFIED** |
| DecisionHistory / Plan | none | false empty (REL-16) | none | src/components/common/DecisionLedgerTimeline.jsx:55-61; src/pages/Plan.jsx:34 | **VERIFIED** |
| Referrals | spinner | stats show 0 | text only, no retry (REL-17) | src/pages/Referrals.jsx:88-116 | **VERIFIED** |
| AdaptiveMealPlan / AdaptiveTrainingBlock / WeeklyAutopilot | accessLoading gate | "no plan" state | inline alert; wrong copy when access is unavailable (REL-08) | src/pages/AdaptiveMealPlan.jsx:215, :268, :277 | **VERIFIED** |
| Progress | inherited; BodyComposition Suspense | "Trend data unavailable…" | share `.catch(() => {})` only | src/pages/Progress.jsx:195, :256, :329 | **VERIFIED** |
| Nutrition, Coach, YourData, Premium, VisualProgressCheck, Onboarding, auth pages | present | present | present | src/pages/Nutrition.jsx:555; src/pages/Coach.jsx:181-202; src/pages/Premium.jsx:94-99; src/pages/Onboarding.jsx:335, :347 | **VERIFIED** |

The scanner and BodyComposition Suspense fallbacks (src/pages/Nutrition.jsx:706, :716; src/pages/Progress.jsx:256) have no local error boundary, so a chunk failure escalates to the root boundary (REL-05).

### Fine (VERIFIED, one line each)
- The settings refresh race is guarded by `referenceWriteVersion` (src/lib/RecompContext.jsx:358-361), and plan saves use a CAS-style guarded `updateMany` (src/lib/planSettings.js:155).
- Nutrition increments are idempotent through per-operation receipts (base44/shared/trackingRecordPersistence.js:90-111; src/lib/foodNutritionSync.js:22-53).
- Double-submit guards exist on the composer, quick-add, coach, meal planner, recipe library and paywall (e.g. src/components/nutrition/FoodEntryComposer.jsx:125-128).
- The AI rate limiter is insert-then-rank, so there is no counter race (base44/shared/coachRateLimitDomain.js:189-231).

---

## 3. Performance

**Verdict:** Every query is bounded and the two heaviest chunks are lazy. Still, /today needs ~301 KiB gz behind a 5-step serial waterfall. Progress and BarcodeScanner are ~120 kB gz each, mostly library code. The 4-context split does not isolate re-renders. The nutrition report issues an estimated 12-20 GETs per food log. FoodItem and Recipe lists are silently capped with no pagination.

### Bundle at a glance (PERF-01)
- Tag: **VERIFIED**
- Severity: Info
- Source: tooling/build.txt, with the `vite build` output in the scratchpad and route closures re-run by dossier I. The build has 155 assets, about 2.8 MB of JS uncompressed, and 57.29 kB of CSS (11.40 kB gz).

| Chunk / route | Raw | Gzip | Loaded when | Evidence | Tag |
|---|---|---|---|---|---|
| Progress-C504AZrH.js | 453.71 kB | 122.35 kB | Progress tab (lazy) | tooling/build.txt; recharts tree ≈81% (PERF-03) | **VERIFIED** |
| BarcodeScanner-DK_Y47P9.js | 446.38 kB | 118.86 kB | first scan (lazy, src/pages/Nutrition.jsx:31) | @zxing/library 398.9 KiB (PERF-04) | **VERIFIED** |
| react-vendor | 179.07 kB | 59.08 kB | every route | tooling/build.txt | **VERIFIED** |
| base44Client | 135.03 kB | 45.37 kB | every route | axios 48.5 + realtime stack ≈45 KiB (PERF-06) | **VERIFIED** |
| proxy (framer-motion) | 109.50 kB | 36.15 kB | first authenticated route | PERF-05 | **VERIFIED** |
| RecompContext | 77.72 kB | 24.39 kB | after auth | tooling/build.txt | **VERIFIED** |
| index (entry) | 73.15 kB | 23.62 kB | every route; includes @tanstack/query-core 23.9 KiB | PERF-06 | **VERIFIED** |
| Entry closure (8 chunks = 7 modulepreloads + entry) | 418.3 KiB | 138.0 KiB | every route | tooling/dist/index.html | **VERIFIED** |
| /today closure (65 chunks) | 895.8 KiB | 301.0 KiB | first app screen | closure.cjs re-run | **VERIFIED** |
| /progress closure | 1,219.2 KiB | 380.9 KiB | Progress tab | closure.cjs | **VERIFIED** |
| /coming-soon (public landing) | 444.9 KiB | 148.3 KiB | marketing | closure.cjs | **VERIFIED** |

Parse cost on a mid-range Android WebView is **SUSPECTED** (not measured).

### PERF-02 Boot is a 5-step serial waterfall, and route chunks are requested only after all data has loaded
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - The public-settings GET and `auth.me()` run serially (src/lib/AuthContext.jsx:43, :48).
  - The RecompContext chunk is lazy and requested only after auth (src/App.jsx:61-66).
  - Next come 13 queries plus `ensureDefaultHabits` (src/lib/RecompContext.jsx:340-396).
  - `<Outlet/>` renders only when `loading` is false (:1919-1946), so the lazy AppLayout and Today imports (src/App.jsx:22, :28) start last. That is ~137 KiB gz.
  - Grepping `prefetch|preload` in src and index.html finds only the preloadError listener.
- Impact: Time to Today is 2 RTT, plus the context chunk, plus the slowest of 13 queries, plus the route-chunk RTTs.
- Fix: Fire-and-forget `import()` of AppLayout and Today when RecompGate mounts, and fetch public settings and `auth.me` in parallel. Effort: <1h

### PERF-03 The Progress chunk (453.7 kB / 122 kB gz) is mostly recharts and loads eagerly, although the default tab draws no chart (also: DEP-12)
- Tag: **VERIFIED** (I reopened src/pages/Progress.jsx:14, :61, :228-236)
- Severity: Medium. Resolution: C rated DEP-12 Low and I rated this Medium. Medium stands because the eager import is avoidable with a <1h change.
- Evidence:
  - Attribution of the 443.1 KiB chunk: recharts 232.5 KiB (52%). With lodash, react-smooth, decimal.js-light and the d3-* packages, that rises to ≈360 KiB (≈81%). App code is 48.7 KiB.
  - recharts enters only through 3 chart files (src/components/progress/{WeightTrendChart,CalorieAdherenceChart,StrengthProgressChart}.jsx:2), all imported by TrendsDashboard.jsx:7-9.
  - src/pages/Progress.jsx:14 imports TrendsDashboard statically. It renders only when `section === "trends"` (:228-236), and the default is `"overview"` (:61).
- Impact: The first visit to Progress downloads ~120 kB gz of charting code that the overview never uses.
- Fix: Use `lazyWithRetry(() => import("@/components/progress/TrendsDashboard"))` behind Suspense. Recharts 3 or hand-rolled SVG would be a later step. Effort: <1h

### PERF-05 /today pulls ~45 KiB gz of code for editors that are closed at first paint, plus ~35 KiB gz of framer-motion for two small animations (also: DEP-08)
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - The select chunk (21.0 KiB gz) and adaptive-select/vaul (9.7 KiB gz) arrive only through TodayChecklist.jsx:9 → HabitsCard.jsx:7 → HabitEditor.jsx:13 (src/components/today).
  - FoodEntryComposer (14.2 KiB gz) arrives through TodayMacroCard.jsx:10 → QuickMealsCard.jsx:8.
  - framer-motion has 3 call sites in src: src/components/AppLayout.jsx:3 (route transition), src/components/common/ConfidenceRing.jsx:1 (`motion.circle`, visible on Today) and src/components/nutrition/BarcodeScanner.jsx:5. The first two are on the /today path.
  - docs/improvement-plan.md:236 and docs/codex-handoff.md:130 wrongly say there is a single use.
- Impact: About 15% of /today JS is UI that is not shown on load, and another ~12% is framer-motion for one fade and one ring stroke.
- Fix: Lazy-load HabitEditor and FoodEntryComposer on open, replace the 3 framer-motion uses with CSS, then `npm rm framer-motion` and update tests/security/reduced-motion.test.js:12. Effort: <1d

### PERF-07 The 4-context split does not isolate updates: actions change on every log write, and food writes also change the reference context
- Tag: **VERIFIED** (mechanism). **SUSPECTED** (real-device jank magnitude).
- Severity: Medium
- Evidence:
  - `actionsValue` (src/lib/RecompContext.jsx:1751-1830) includes callbacks whose deps include `logs` (:1694, :1713) and `[recipes]` (:1635, :1642, :1650). That contradicts the comment "Actions are stable across data changes" (:1748-1750).
  - Each upsertDailyLog writes `logs` twice (:782, :822).
  - `refValue` includes `foodLogEntries` (:1845).
  - `useRecomp()` merges all three contexts (:118) and is used by 26 files.
- Impact: One food log causes at least 2 re-render waves across every `useRecomp`/`useRecompActions` consumer, hidden keep-alive tabs included (PERF-08).
- Fix: Read the changing state through refs in those 5 callbacks, give `foodLogEntries` its own context, and migrate the `useRecomp()` callers to the narrow hooks. Effort: <1d

### PERF-08 The keep-alive tab cache keeps up to 5 tab pages mounted, and hidden pages still re-render and refetch
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: src/components/AppLayout.jsx:25 caches each tab root, and :60-64 renders every cached tab inside `className="hidden"`. Hidden Today, Nutrition, Progress and More stay subscribed to `useRecomp`, and a hidden Progress tab keeps the nutrition report mounted (PERF-09).
- Impact: The PERF-07 cost is multiplied by the number of visited tabs, and hidden network work continues.
- Fix: Provide a per-tab `active` flag so heavy consumers skip work while hidden, or evict tabs hidden for more than N minutes (`<Activity>` needs React 19.2). Effort: <1d

### PERF-09 The nutrition report refetches a full paginated range, and blanks to "Loading…", on every log change, focus, visibility change and realtime event
- Tag: **VERIFIED** (mechanism). **SUSPECTED** (per-write request count).
- Severity: Medium
- Evidence:
  - src/lib/nutritionReportHook.js:41-60 depends on `logs, foodLogEntries, loading, historyLoaded` with an 80 ms debounce (:56). It also refreshes on focus, visibilitychange and realtime events (:16-39).
  - Each run first sets `data: null, loading: true` (:43), which blanks src/components/progress/NutritionReport.jsx:54-56.
  - Paging continues "until an empty page", up to 200 pages or 20,000 rows per entity (src/lib/nutritionReportData.js:4-9, :29).
- Impact: An estimated 12-20 GETs per food log while the report is mounted, hidden or not, and the visible report flickers.
- Fix: Recompute locally for ranges already in context, keep the previous data visible while refetching, raise the debounce to ~1 s, and treat a short page as the end. Effort: <1d

### REL-15 Reference datasets are silently truncated with no pagination UI: FoodItem 200, Recipe 100, MealTemplate 200, history 500
- Tag: **VERIFIED** (caps). **SUSPECTED** (false-PR frequency).
- Severity: Medium (FoodItem/Recipe) / Low (history)
- Evidence:
  - src/lib/RecompContext.jsx:347-350 fetches `FoodItem.filter(own(), "-created_date", 200)`, Recipe 100, MealTemplate 200 and Habit 200, and nothing re-fetches them.
  - History caps (:424-431): DailyLog 500, StrengthLog 500, FoodLogEntry 500, and so on.
  - `newPersonalRecords` takes the max over the loaded logs only (src/lib/fitness/liftProgression.js:99-109, called at src/components/training/WorkoutTracker.jsx:395).
  - The referral count is capped at 100 (base44/functions/getReferralStats/entry.ts:30-35).
- Impact: The 201st saved food silently disappears from the library and quick-add, and the library has no search (src/pages/Nutrition.jsx:440, :555-556). PRs older than the newest ~700 strength logs can trigger a false "new PR".
- Fix: Page FoodItem and Recipe on demand with server-side search, and show when history is truncated. Effort: <1d

### PERF-04 The BarcodeScanner chunk (446.4 kB / 118.9 kB gz) ships the whole multi-format @zxing/library for 4 one-dimensional formats (also: DEP-13)
- Tag: **VERIFIED** (bytes, import). **SUSPECTED** (BarcodeDetector availability per WebView).
- Severity: Low
- Evidence:
  - @zxing/library accounts for 398.9 KiB and @zxing/browser for 25.5 KiB. Both are needed, because the library is the browser package's peer.
  - src/components/nutrition/BarcodeScanner.jsx:3 uses `BrowserMultiFormatReader` with hints limited to EAN-13, EAN-8, UPC-A and UPC-E (:18-24).
  - src/pages/Nutrition.jsx:28 says "~110KB", which matches only the gz size. The import uses plain `lazy`, not `lazyWithRetry` (:31).
- Impact: The first scan waits on ~119 kB gz, and the QR, PDF417, Aztec and DataMatrix decoders are dead weight.
- Fix: Use native `BarcodeDetector` where available, fall back to a 1D-only reader, and switch to `lazyWithRetry`. Effort: <1d

### PERF-06 The entry bundle carries React Query for one `useQuery` and the realtime stack for one subscriber (also: DEP-10, QUAL-11)
- Tag: **VERIFIED** (bytes). **SUSPECTED** (whether the SDK can omit socket.io).
- Severity: Low
- Evidence:
  - @tanstack/query-core is 23.9 KiB in the entry chunk. The only `useQuery` is src/lib/PageNotFound.jsx:10, which re-fetches `auth.me()` although AuthContext already holds the user.
  - engine.io-client, socket.io-client, partysocket and the two parsers total ≈45 KiB in base44Client. The only `.subscribe(` is src/lib/nutritionReportHook.js:25.
- Impact: About 70 KiB raw on the critical path does nothing for first paint.
- Fix: Drop QueryClientProvider (src/App.jsx:149), use `useAuth()` in PageNotFound, and ask Base44 about lazy realtime. Effort: <1h

### PERF-10 The fitness engine recomputes on every write
- Tag: **VERIFIED** (desktop timings, call sites). **SUSPECTED** (mobile multiplier).
- Severity: Low
- Evidence: On Node with 560 logs, `analyzeTrends` takes 4.4 ms, `buildWeeklyQuests` 2.5 ms and `calculateStreakStats` 2.0 ms. They run on every `logs` change (src/lib/RecompContext.jsx:553-558) and in StreakChip.jsx:16 plus the always-mounted StreakDetailSheet.jsx:19-20.
- Impact: About 22 ms of desktop CPU per write (2 log updates), likely 4-10x that on low-end Android.
- Fix: Compute streaks once in the provider, mount the sheet only when open, and skip the recompute when totals are unchanged. Effort: <1d

### PERF-11 Every query is bounded, but boot and refresh read up to 3,904 rows
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - Boot reads at most 1,504 rows (src/lib/RecompContext.jsx:341-355) and history at most 2,400 (:424-432). `reload` always runs both (:539-543).
  - Each AI request reads up to 501-801 CoachRequestUsage rows across all accounts for the global ceiling (base44/shared/coachRateLimitDomain.js:244-248).
  - There are 0 `.list()` calls, and every spot-checked `.filter()` passes a limit (full table in dossier I).
- Impact: Each pull-to-refresh runs 20 queries.
- Fix: Refresh only the current week plus a delta (`updated_date > lastSync`), and keep a daily counter row for the global ceiling. Effort: <1d

### PERF-12 Write paths cost extra round trips: serial creates and redundant pre-reads
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - The client pre-reads `DailyLog.filter(..., 10)` (src/lib/RecompContext.jsx:792), and the server reads again (base44/shared/trackingRecordPersistence.js:58, :71).
  - Creates run serially (src/lib/RecompContext.jsx:1338-1346, :1044-1051).
  - coachReply makes 8 sequential round trips before the LLM call (base44/functions/coachReply/entry.ts:56-145).
- Impact: A 3-item meal costs 5 sequential client round trips, and a 6-lift workout costs 9.
- Fix: Drop the pre-reads, `Promise.all` the independent creates, and parallelize the coachReply entitlement load. Effort: <1d

### DEP-11 Radix version skew bundles ~38-47 kB of duplicate Radix internals
- Tag: **VERIFIED** (bytes approximate)
- Severity: Low
- Evidence:
  - react-select@2.2.6 uses the old hoisted internals while 6 other Radix packages nest newer copies. package-lock.json has 17 @radix-ui names in 2 versions.
  - Sourcemaps show 6 `react-context` copies, and 47.3 kB of nested Radix code (38.1 kB overlapping top-level packages).
  - src/components/training/SessionEditSheet.jsx:12 opens a Select inside a Sheet, so both layer stacks run at once.
- Impact: ~38-47 kB min duplicated, and two dismiss-layer stacks are live together (behavioural edge cases **SUSPECTED**).
- Fix: Bump all `@radix-ui/*` to current minors in one PR, run `npm dedupe`, and close #159. Effort: <1h

### PERF-13 Brand PNGs (3.86 MB) never load at runtime; the maskable icon is a copy, and docs/ duplicates public/ assets
- Tag: **VERIFIED** (sizes, references, `cmp`; I re-ran `cmp`). **SUSPECTED** (maskable cropping).
- Severity: Info
- Evidence:
  - public/brand/*.png: recompone-logo-primary 1,191,745 B, recompone-mark-master 1,169,981 B, recompone-app-icon-ios 947,690 B, recompone-feature-1024x500 548,299 B.
  - These are referenced only by absolute og/JSON-LD URLs (index.html:22, :29, :45), expo-ios/app.json:10 and tests.
  - Runtime loads only /icons/recompone-32.png and recompone-192.png (36,781 B; index.html:5-6).
  - `cmp` shows public/icons/recompone-maskable-512.png is identical to recompone-512.png. It also shows docs/play-store/app-icon-512.png == public/icons/recompone-512.png and docs/play-store/feature-graphic-1024x500.png == public/brand/recompone-feature-1024x500.png (800 KB tracked twice).
- Impact: No first-paint cost. The costs are ~3.9 MB per web deploy, repo bloat, and possible launcher cropping of the PWA maskable icon.
- Fix: Recompress losslessly (oxipng/pngquant) and author a real maskable icon with a 10% safe zone. Keep the docs/play-store copies: they are load-bearing (android/play-release.json:17, scripts/verify-android-release.mjs:236; DEAD-14 in 02). Effort: <1h

---

## 4. Code quality

**Verdict:** The gates measure little: lint runs 9 rules on 131 of 300 product files, and typecheck skips the app shell and the payment domain. One provider is 1,947 lines, and date and UI helpers are copy-pasted. Turning on the intended ESLint presets finds 57 issues (0 `no-undef`), so the hidden debt is cheap to clear. There are 0 TODO markers.

### QUAL-01 ESLint enables only 9 rules: both "recommended" presets are spread into one object and then overwritten
- Tag: **VERIFIED** (I reopened eslint.config.js:9-37 and package.json:9)
- Severity: Medium
- Evidence:
  - eslint.config.js:15-16 spreads `...pluginJs.configs.recommended, ...pluginReact.configs.flat.recommended,`. The later `languageOptions` (:17), `plugins` (:32) and `rules` (:37) keys in the same object replace them.
  - `npx eslint --print-config src/pages/Nutrition.jsx` prints exactly 9 rules. `react-hooks/exhaustive-deps` is never configured.
  - package.json:9 runs `"lint": "eslint . --quiet"`, which hides 3 warnings and 4 unused-directive notices.
  - With the intended presets, the code has 57 rule hits: 47 `react/no-unescaped-entities`, 6 `react-hooks/exhaustive-deps` (e.g. src/lib/RecompContext.jsx:899, src/lib/AuthContext.jsx:24), 3 `no-empty`, 1 `no-control-regex`.
- Impact: "Lint green" (tooling/lint.txt exit 0; docs/codex-handoff.md:90) proves almost nothing.
- Fix: Put the presets in their own array entries, add `react-hooks/exhaustive-deps: "warn"`, and replace `--quiet` with `--max-warnings 0`. Effort: <1h (plus <1d to triage the 57)

### QUAL-02 Lint scope: 131 of 300 product files get any rule; backend, lib, shell and tests get none
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: eslint.config.js:9-14 lints only `src/components/**` and `src/pages/**` plus the nonexistent `src/Layout.jsx`, and ignores `src/lib/**` and `src/components/ui/**`. The 169 product files with no rules are: src/lib 78, src/components/ui 19, base44/shared 34, base44/functions 25, expo-ios/src 8, and App/main/hooks/api 5. Tests and scripts (140) get none either.
- Impact: The 1,947-line src/lib/RecompContext.jsx, all payment and auth code, and every Deno handler are never linted.
- Fix: Widen `files` to `src/**`, `base44/**` (with typescript-eslint for .ts) and `tests/**`. Effort: <1d

### QUAL-03 Typecheck scope: the include globs match 1 of 111 component files; the app shell and 18 backend modules are never checked
- Tag: **VERIFIED** (I reopened jsconfig.json:19-20)
- Severity: Medium
- Evidence:
  - jsconfig.json:19 includes `src/components/**/*.js` (1 .js file among 111), `src/pages/**/*.jsx` and the nonexistent `src/Layout.jsx`. :20 excludes src/lib, src/api and src/components/ui, and there is no `strict`.
  - tsc reaches 220 files through imports (tooling/tsc-files.txt). Never checked: 31 src files (src/App.jsx, src/main.jsx, src/components/AppLayout.jsx, src/lib/lazyWithRetry.js, ...), 18 of 34 base44/shared modules (appleJwsVerify.js, googlePlayPurchaseDomain.js, entitlementAccess.js, coachRateLimitDomain.js, ...), and 0 of 25 base44/functions. There is no deno.json and no `deno` CI step.
  - A widened include reports only 18 errors across 267 files.
- Impact: The routing shell and the payment domain have no type gate.
- Fix: Include `src/**/*` and `base44/shared/**/*`, fix the 18 errors, and add `deno check base44/functions/*/entry.ts` to CI. Effort: <1d

### QUAL-04 30 files over 300 lines; the top 5 are monoliths
- Tag: **VERIFIED** (`wc -l` matches tooling/loc-top.txt)
- Severity: Medium (top 5) / Low (rest)

| Lines | File | What makes it large | Split | Tag |
|---|---|---|---|---|
| 1947 | src/lib/RecompContext.jsx | One provider (190-1906): 18 useState, 25 useRef, 59 useCallback; loadInitial :329, loadHistory :416, runCheckIn :1652; 4 context values :1751-1889 | One hook per domain (`useFoodLog`, `useTraining`, `usePlanSettings`, `useCheckIn`, `useDataLoader`) | **VERIFIED** |
| 994 | base44/shared/adaptiveMealPlanDomain.js | MEAL_CATALOG 32-352 ships to the client (src/pages/AdaptiveMealPlan.jsx:27; found in the AdaptiveMealPlan chunk) | `mealCatalog.js` + `adaptiveMealPlanAi.js` | **VERIFIED** |
| 880 | src/components/training/WorkoutTracker.jsx | Component 88-693, ActiveExercise 733-813, ReviewExercise 814-880 | `useWorkoutSession`, shared `WorkoutReviewForm` | **VERIFIED** |
| 773 | src/pages/Nutrition.jsx | Page 43-729 with 10 useState; ScannerLoading 730-764 | `useFoodScanFlow`, `QuickAddForm` | **VERIFIED** |
| 622 | src/pages/Profile.jsx | Page 64-614 with 11 useState | 4 section components | **VERIFIED** |
| 502 | expo-ios/src/RecompOneWebView.tsx | speech 90-115, StoreKit 139-218, bridge from 219, auth 349-371 | `useStoreKitBridge`, `useSpeechBridge` | **VERIFIED** |
| 496 | src/components/nutrition/FoodEntryComposer.jsx | One component 48-496, 11 useState | `useFoodEntrySave` | **VERIFIED** |
| 486 / 456 | src/pages/Coach.jsx / src/pages/LifestyleCoach.jsx | 3 inline subcomponents each; LifestyleCoach is disabled | Move subcomponents out | **VERIFIED** |
| 812 / 581 | src/lib/seo/tipsData.js / comparisonsData.js | Static SEO data in their own chunks | Fine | **VERIFIED** |

The remaining 300-440-line files are listed in dossier J (QUAL-04). They are acceptable or cohesive domain modules.

- Fix: Split the top 5 along the "Split" column, RecompContext.jsx first (it blocks TEST-04 and FE-01). Effort: >1d (~3-5 days for the top 5)

### QUAL-05 Nine dead frontend files (823 lines), two of them guarded by tests
- Tag: **VERIFIED** (8 component/hook files). **SUSPECTED** (OAuthConsent.jsx, which a Base44 platform route could reach).
- Severity: Low
- Evidence:
  - tooling/knip-configured.txt:1-10 lists the 9 files: SignalStat 22, StepAbout 176, StepActivity 53, StepCoaching 70, StepWelcome 39, RatingDrawer 54, StreakBanner 141, src/hooks/use-size 28, src/pages/OAuthConsent.jsx 240.
  - `rg -l` finds no live importer, and src has no `import.meta.glob` and no template `import()`.
  - tests/security/local-plan-cache.test.js:113-131 checks error rings in the dead StepAbout.jsx instead of the live StepAboutActivity.jsx.
- Impact: The live step 2 has no test guard, and the review surface is inflated.
- Fix: Delete the 8 files, confirm OAuthConsent with Base44, and repoint the two tests. Effort: <1h

### QUAL-06 StepAboutActivity.jsx is a fork of the dead StepAbout.jsx
- Tag: **VERIFIED**
- Severity: Low
- Evidence: `diff src/components/onboarding/StepAbout.jsx src/components/onboarding/StepAboutActivity.jsx` (176 vs 205 lines) shows 87 changed lines. The rest is copy-paste. Entry points: StepAbout.jsx:23 `export default function StepAbout({ p, set, units, setUnits, showErrors })`, StepAboutActivity.jsx:25 (same props plus `showBaseline`); the live one is imported at src/pages/Onboarding.jsx:18.
- Impact: Two copies of the height, weight and metric-conversion UI.
- Fix: Delete StepAbout.jsx. Effort: <1h

### QUAL-07 Coach payload limits are duplicated between client and server under different names
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - The client limits are in src/lib/coachContract.js:1-7 and the server's in base44/shared/coachDomain.js:11-14, :36. Only the summary limit has a parity test (tests/security/coach-contract.test.js:102-106).
  - src/pages/LifestyleCoach.jsx:37-40 hard-codes `20 / 2400 / 18000 / 2000`.
  - The right pattern already exists: src/lib/featureFlags.js:1 imports from base44/shared.
- Impact: If either side drifts, the server returns 400s and the client shows a generic failure.
- Fix: Import the constants from base44/shared. Effort: <1h

### QUAL-08 Date helpers are hand-rolled at least 18 times
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - `todayStr` exists ×4 (src/lib/RecompContext.jsx:121, src/lib/loggingDateUtils.js:9, src/lib/progressPhotos.js:10, src/pages/WeeklyAutopilot.jsx:44).
  - `daysAgoStr` exists ×5.
  - `currentWeekStart` is byte-identical in src/pages/AdaptiveMealPlan.jsx:29-35 and src/pages/AdaptiveTrainingBlock.jsx:28-34.
  - `fmtDate` exists ×6, and there are 34 `toISOString().slice(0, 10)` sites.
  - date-fns is used in only 4 files.
- Impact: No single owner for the local-date rule, so a timezone fix has to land in 10+ places.
- Fix: Route everything through src/lib/loggingDateUtils.js (client) and one base44/shared date module (server). Effort: <1d

### QUAL-09 Copy-pasted UI blocks and helpers
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - `Macro` is byte-identical in src/components/nutrition/BarcodeScanner.jsx:412-422 and src/components/nutrition/FoodPhotoScan.jsx:314-324.
  - `TYPE_OPTIONS`/`MUSCLE_SUGGESTIONS` are identical in src/components/training/WorkoutTracker.jsx:44-54 and src/components/training/SessionEditSheet.jsx:21-31.
  - `errorMessage()` exists ×3 (e.g. src/pages/AdaptiveMealPlan.jsx:45).
  - The modal focus/scroll-lock code is written 3 times (BarcodeScanner.jsx:158-212, FoodPhotoScan.jsx:38-83, src/pages/Nutrition.jsx:730-748).
  - There are 2 speech-input components.
- Impact: Fixes land in one copy and not the other.
- Fix: Create `components/common/Macro.jsx`, a `useModalFocusTrap` hook and `lib/apiError.js`. Effort: <1d

### QUAL-10 Backend handlers re-declare `json()` and `statusOf()` although base44/shared/httpUtils.js exports both
- Tag: **VERIFIED**
- Severity: Low
- Evidence: base44/shared/httpUtils.js:4-12 exports both. `^function json(` is re-declared in 9 entry.ts files (e.g. base44/functions/analyzeBodyComposition/entry.ts:34) and `statusOf` in 8.
- Impact: The `Cache-Control: no-store` policy is copy-maintained in 9 places.
- Fix: Import both from ../../shared/httpUtils.js. Effort: <1h

### QUAL-11 Data fetching follows four patterns, and react-query is wired up but used only by the 404 page
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - The patterns are: the provider (78 direct SDK lines in src/lib/RecompContext.jsx), 17 other src files calling the SDK directly, one `useQuery` (src/lib/PageNotFound.jsx:10), and `useRecomp()`.
  - `useRecomp()` (src/lib/RecompContext.jsx:113-119) is consumed by 26 files, each subscribing to all three contexts.
- Impact: No shared caching, retry or dedupe, and each page reinvents its loading and error state.
- Fix: Remove react-query, or adopt it for the per-page function calls, and migrate to the narrow hooks. Effort: >1d (~3 days)

### QUAL-12 Error extraction is inconsistent across the SDK, server and client
- Tag: **VERIFIED** (SDK source, grep counts). **SUSPECTED** (user-visible effect per screen).
- Severity: Low
- Evidence:
  - `functions.invoke` rejects with a raw AxiosError (node_modules/@base44/sdk/dist/client.js:104, :121, `interceptResponses: false`). The entity interceptor ignores a string `data.error` (utils/axios-client.js:192-193).
  - `json({ error` appears 208 times in base44/functions, and only 20 of those include `message`.
  - Clients parse the error three ways (src/pages/AdaptiveMealPlan.jsx:45-50; src/pages/Coach.jsx:186; src/components/nutrition/FoodDiaryCard.jsx:244).
- Impact: Some server messages reach users; others become "Request failed with status code 4xx".
- Fix: Add one `apiErrorMessage()` helper, and return `{error, message}` from httpUtils. Effort: <1d

### QUAL-13 The optimistic nutrition increment skips the server's upper clamp
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/RecompContext.jsx:43-51 applies only `Math.max(0, ...)`. The server (base44/shared/trackingRecordDomain.js:296-298) also clamps to limits (:134-139, e.g. calories 20000).
- Impact: Above a cap, the optimistic total differs from the stored total until reload.
- Fix: Export the server function and import it on the client. Effort: <1h

### QUAL-16 The itemized-food-diary flag is a hard-coded constant, so its "off" branches are dead but still tested
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/lib/featureFlags.js:27 sets `itemizedFoodDiary: true` and reads no env var. Its false branches sit at 10 read sites (e.g. src/lib/RecompContext.jsx:353). tests/security/meal-food-lifecycle.test.js:407, :415 still run `itemized: false`, and playwright.config.js:67 sets an env var that nothing reads.
- Impact: Dead code paths, plus tests and config that look meaningful.
- Fix: Delete the flag and its false branches. Effort: <1h

### QUAL-17 `registerPushToken` is deployed and callable but has no caller in the repo
- Tag: **VERIFIED** (no caller in the repo, matching BE-14 / DEAD-09). **SUSPECTED** (an external caller: the Base44-managed Android shell, which is not in the repo, could call it).
- Severity: Low
- Evidence: base44/functions/registerPushToken/entry.ts writes PushDevice rows via `asServiceRole` (:50, :58, :64). The only references are docs/features/reminders-and-integrations.md:7, :30 and :133. See SEC-11.
- Impact: An authenticated write endpoint that stores device tokens for no purpose.
- Fix: Remove it or document its owner. Effort: <1h

### DEP-05 Three declared production dependencies are unused
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - The packages are `@hookform/resolvers` (package.json:25), `@radix-ui/react-accordion` (:26) and `cmdk` (:40).
  - `rg` over src, tests, scripts, base44, index.html, public and .github hits only config residue (eslint.config.js:55, tailwind.config.js:91-102). knip and depcheck agree.
  - PR #136 removed the first two, and the Builder re-added them in afd0fc4 (DEP-V1).
- Impact: 0 bytes shipped. They add install size, supply-chain surface and Dependabot noise.
- Fix: Run `npm rm @hookform/resolvers @radix-ui/react-accordion cmdk` and remove the residue. Effort: <1h

### DEP-09 Two bottom-sheet systems: vaul Drawer and Radix-Dialog Sheet
- Tag: **VERIFIED**
- Severity: Low
- Evidence: vaul is wrapped at src/components/ui/drawer.jsx:4 and used by adaptive-select (10 importers) and src/pages/Progress.jsx:36. The Radix Sheet (src/components/ui/sheet.jsx:3) has 9 importers, all `side="bottom"`. vaul adds 26.2 kB min.
- Impact: Inconsistent mobile sheet behaviour (only vaul has drag-to-dismiss) and two components to maintain.
- Fix: Standardise on one. Effort: <1d

### QUAL-14 Dead props: none found
- Tag: **SUSPECTED** (an absence claim from a heuristic JSX scanner)
- Severity: Info
- Evidence: passedprops.cjs and deadprops.cjs scanned 182 components and 1,722 call sites. They found 0 passed-but-undeclared props, and 3 declared-but-unread hits that are all `icon: Icon` renames (e.g. src/components/today/TodayChecklist.jsx:17).
- Impact: None found.
- Fix: None. Effort: n/a

### TODO / FIXME / HACK inventory (QUAL-15)
- Tag: **VERIFIED** (I re-ran the greps)
- Severity: Info

| Marker | Count | Locations | Tag |
|---|---|---|---|
| TODO / FIXME / HACK / XXX in code (src, base44, expo-ios/{src,tests,App.tsx,index.ts}, tests, scripts, root configs) | 0 | — | **VERIFIED** |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 | — | **VERIFIED** |
| `eslint-disable` | 4, all reported "unused" because the rules are off (QUAL-01) | src/lib/telemetry.js:100, :108 (`no-console`); src/components/nutrition/FoodPhotoScan.jsx:83, src/components/nutrition/BarcodeScanner.jsx:211 (`react-hooks/exhaustive-deps`) | **VERIFIED** |
| TODO in docs | 1 | docs/android-play-release.md:123 ("TODO (when ready): upload the Google Play verifier secrets") | **VERIFIED** |
| Unchecked checklist items (`- [ ]` / ⬜) in docs | 96 | docs/release-checklist.md 48, docs/deploy-1-5.md 22, docs/deploy-weekly-check-in-v2.md 19, docs/codex-handoff.md 6, docs/apple-premium-launch.md 1 (:64, the sandbox allowlist, SEC-03) | **VERIFIED** |

Deferred work is tracked in docs, not in code. The launch blockers SEC-03 and SEC-06 sit in those unchecked items.

---

## 5. Testing

**Verdict:** 852 node tests pass locally (345 fitness, 492 security, 15 contract), but nothing gates main. CI has been red for 14 pushes. The only UI suite cannot load. No backend handler or React component is executed by any test, and 18% of security blocks only regex the source.

> **CI is red on main.** Every push to main since 2026-10-21 has failed (14 runs, #531 to #547). The failing step skips every test, the production build and e2e. The Base44 Builder bot keeps pushing quota and purchase code to main without review.

### TEST-02 CI has failed on main for 14 consecutive pushes; no test gates main (also: DEP-02, SEC-15)
- Tag: **VERIFIED** (I queried the GitHub Actions API on 2026-10-28; .github/workflows/ci.yml opened; git log)
- Severity: High
- Evidence:
  - **Run history.** `gh api .../actions/workflows/325130981/runs?branch=main`: #529 (2026-10-20T17:27Z, e4ed4fa) was the last success. All 14 push runs from #531 (2026-10-21T15:14Z) to #547 (2026-10-23T16:53Z, head 1093787) failed.
  - **Failing steps.** Job step data shows #531 failed at "Validate Expo configuration", #533-#539 at "Typecheck" (spot-checked #533, #536, #539), and #540-#547 at "Validate Expo configuration" (spot-checked #540, #542, #547). Open issue #193 "CI is failing on main" was opened by the report-main-failure job.
  - **Mechanism.** .github/workflows/ci.yml:52-53 runs `npm run doctor --prefix expo-ios`, which runs expo-doctor 1.20.4. Its dependency check spawns `expo install --check`, which prefers remote Expo API versions over the lockfile (@expo/cli getVersionedPackages.js: "Prefer the remote versions over the bundled versions"). It fails with `expo expected ~57.0.31 found 57.0.30` (tooling/README.md). An upstream Expo patch therefore turns main red with no repo change.
  - **What is skipped.** Every later step: fitness, security and contract tests, Android verify, production build and e2e (ci.yml:55-74).
  - **Main is not gated.** ci.yml:76-77 says "Pushes straight to main are not gated by this workflow -- only pull requests are. main was red for 18 consecutive commits", so this is the second such episode. Branch protection has `required_status_checks.contexts: []` (dossier C, `gh api branches/main`). docs/codex-handoff.md:101-103 records that `Require status checks` was left off so the Builder can push. docs/security-audit.md:61 claims main "requires ... `verify`", which is false.
  - **Unreviewed changes.** base44-builder[bot] pushed 5 commits straight to main on 2026-10-23 (43cb895, 3ddb424, 50ed527, 5824d0b, 1093787). They include quota logic, Google purchase token binding (77 lines of base44/functions/verifyGooglePlayPurchase/entry.ts), and test edits: 1093787 removed the fake `count()` from tests/security/coach-rate-limit.test.js.
  - **PRs blocked too.** Doctor has failed `verify` on Dependabot PRs #159, #160, #170, #177, #192 and #195 since 2026-09-21. PR #196 (expo 57.0.31) fails earlier, at step 9 (DEP-24).
- Impact: Tests run only when someone remembers to run them locally. Bot changes to quota and purchase code and to their tests land unverified, and the red step masks real regressions (TEST-01, DEP-04).
- Fix: Set `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` on the gating doctor step (or `EXPO_OFFLINE=1`; whether that is sufficient is **SUSPECTED**), and move the online doctor to a scheduled non-blocking job. Fix DEP-24 and land #196. Add esbuild (TEST-01). Route the Builder through `base44-builder` and require `verify` on main (CFG-05). Effort: <1h (CI step) + <1d (Builder routing)

### TEST-01 The Playwright suite cannot run: one spec imports `esbuild`, which Vite 8 no longer installs, so no e2e test loads (also: DEP-01)
- Tag: **VERIFIED** (I reopened tests/e2e/meal-speech-input.spec.js:2 and confirmed `node_modules/esbuild` is absent)
- Severity: High
- Evidence:
  - tests/e2e/meal-speech-input.spec.js:2 has `import { build } from "esbuild";`, used at :9-21 (`stdin`, `bundle: true`, `format: "iife"`).
  - `ls node_modules/esbuild` fails. 3ddb424 (base44-builder[bot], 2026-10-23) bumped vite to `^8.3.5` (package.json:70). esbuild is now only an optional peer of vite, and that commit's lockfile diff deletes `node_modules/esbuild`. esbuild was never declared in package.json.
  - tooling/e2e.txt: `Error: Cannot find package 'esbuild' imported from .../meal-speech-input.spec.js`, `e2e exit=1`.
  - The suite has 34 spec files and 194 static `test("…")` declarations (resolution below). The spec was added on 2026-10-20 (5c2e4f9), when vite 6 still supplied esbuild, and CI #529 was green with it.
  - knip and depcheck both flag `esbuild` as unlisted or missing.
- Impact: The only tests that render React and drive the real UI have been dead since 2026-10-23. That includes the race and reliability specs (settings-refresh-race, food-commit-recovery, logging-reliability, nutrition-report-pagination). Once the doctor step is fixed, CI goes red on this next.
- Fix: Add `"esbuild": "^0.28.2"` to devDependencies (inside Vite 8's peer range). Effort: <1h

### TEST-05 No backend `entry.ts` handler is ever executed; auth, ordering, secrets and HTTP glue are covered only by source scans
- Tag: **VERIFIED**
- Severity: High
- Evidence:
  - `rg "import.*entry\.ts|import\(.*entry" tests` returns 0.
  - 26 test files read entry.ts as text, 2 of them through `readdirSync` over all 25 (tests/security/entitlement-loader.test.js:158-161, tests/security/owner-scoping.test.js:164-168).
  - Domain code is executed: 26 of 34 base44/shared modules are imported by tests/security, and 31 of 34 by some suite.
- Impact: Wrong status codes, missed auth checks, mishandled secrets or broken Apple and Google HTTP calls pass every test.
- Fix: Move each handler body into `base44/shared/<fn>Handler.js` as `handle(req, {client, secrets, fetch})`, keep entry.ts as a thin adapter, and drive it with a fake `Request` (proposed in docs/test-inventory.md:13). Effort: >1d (~4 days for all 25; ~1 day for payment, deletion and coach)

### DEP-24 The expo-ios security test depends on unlisted `xcode`@3, so the Expo patch PR #196 already fails CI on it
- Tag: **VERIFIED** (dossier C reproduced it: `Cannot find module 'uuid'`, `# pass 15 # fail 1`)
- Severity: Medium (it blocks the Expo patch that CI recovery depends on)
- Evidence: expo-ios/tests/dependencySecurity.test.ts:6-8 calls `require("xcode")` and resolves `uuid` from it, and :14 asserts `manifest.overrides["xcode@3.0.1"].uuid`. `xcode` is not in expo-ios/package.json:13-30. PR #196 moves to xcode 4.0.0, which has no uuid dependency. It runs in CI at .github/workflows/ci.yml:49-50.
- Impact: Every Expo bump that moves `xcode` fails CI.
- Fix: Delete the `xcode@3.0.1` override (expo-ios/package.json:31-35), drop the uuid assertions, and keep the `generateUuid()` test (:19-29). Effort: <1h

### TEST-03 Security suite composition: 80 of 452 blocks (18%) only read source text, and 27 (6%) mix real calls with source regex
- Tag: **VERIFIED** (classifier output plus hand checks). **SUSPECTED** (exact class boundaries, which are heuristic).
- Severity: Medium
- Evidence:
  - tests/security has 61 files and 452 `test()` blocks; 492 pass (tooling/test-security.txt). Of the blocks, 279 execute real code, 80 are text-only, 27 are mixed and 66 are unclassified.
  - 11 files are 100% source text (e.g. accessibility-semantics, touch-target-primitives, vendor-chunks).
  - docs/test-inventory.md:11 claims 348 tests, which is stale.
- Impact: At least 80 blocks prove only that a string exists. They pass after semantic breaks and fail on reformatting.
- Fix: Convert the payment and auth wiring regexes first (TEST-05), and refresh the inventory doc. Effort: >1d (~3 days for the payment/auth subset)

### TEST-04 36 test blocks run production code cut out of RecompContext.jsx and BarcodeScanner.jsx by string index and `new Function`
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: tests/security/meal-food-lifecycle.test.js:28-31 slices on `source.indexOf("  const foodOwnerActive = useCallback(")`, stubs `useCallback` (:85) and calls `new Function(...)` (:117). The same technique appears in daily-nutrition-increments.test.js:108-113, meal-daily-rollback.test.js:43-46, strategy-account-lifecycle.test.js:17, :68 and meal-camera-lifecycle.test.js:6-8.
- Impact: Renaming a callback or changing indentation breaks these tests, and hook semantics are never tested. This discourages splitting RecompContext (QUAL-04).
- Fix: Extract the callbacks into importable factories that take refs and the SDK. Effort: >1d (~2 days)

### TEST-06 The test fakes are not checked against the SDK the Deno runtime uses, which has already let one production bug through
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - 5824d0b (bot) added `usage.count(...)` to coachRateLimitDomain.js plus a fake `count()`. 1093787 removed both, with the comment at base44/shared/coachRateLimitDomain.js:238-241: "the entity accessor bundled into the function runtime has no count method".
  - All 25 entry.ts files pin `npm:@base44/sdk@0.8.48`, which has no `count(`. The frontend's 0.8.57 types it (node_modules/@base44/sdk/dist/modules/entities.types.d.ts:899).
  - The fakes (tests/security/fakeBase44Client.js:44-90) are hand-written.
- Impact: Green tests did not mean working production code, and it has happened once.
- Fix: Validate the fakes' method list against the pinned 0.8.48 typings, and add one `@deployed` smoke test per critical function. Effort: <1d

### TEST-07 No React component, page or context has a unit or render test
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: `rg -l "@testing-library|react-dom/server|react-test-renderer|renderToString|createRoot" tests` matches only e2e files. No test imports src/pages or src/components. package.json:11-15 defines only `node --test` suites and Playwright, and there is no vitest, jest or testing-library dependency (package.json:22-71). 29 test files read UI source as text.
- Impact: Render crashes, hook-order bugs and context-wiring regressions surface only through e2e, which is dead (TEST-01).
- Fix: Add vitest and @testing-library/react with a fake SDK, starting with RecompProvider load, AuthProvider and the paywall. Effort: >1d (~2 days)

### TEST-08 The e2e Base44 mock silently returns 200 for any function it does not know
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: In tests/e2e/support/base44.js, the `/functions/` branch (:347-460) falls through to `return json({ record });` (:457-460) for unknown names. The "Unhandled Base44 mock route" 404 (:462-465) covers non-function routes only. verifyApplePurchase, coachReply, searchFoods, barcodeLookup and others have no branch.
- Impact: A spec that forgets a mock sees a fake success.
- Fix: Return 404 for unhandled function names. Effort: <1h

### TEST-10 No automated test hits the real Base44 backend
- Tag: **VERIFIED**
- Severity: Medium
- Evidence: tests/e2e/deployed-smoke.spec.js:4-9 skips without `E2E_BASE_URL`. `grep -rn "E2E_\|deployed" .github` returns nothing, and `test:e2e:deployed` (package.json:15) is invoked by nothing.
- Impact: Platform behaviour is never verified, which is how the `count()` gap (TEST-06) shipped.
- Fix: Add a nightly workflow running `test:e2e:deployed` against a Base44 test app. Effort: <1d

### TEST-09 E2E runs on the Vite dev server in Desktop Chrome only, while production runs in iOS WKWebView and Android WebView
- Tag: **VERIFIED**
- Severity: Low
- Evidence: playwright.config.js:50-55 defines one `devices["Desktop Chrome"]` project, and :59 serves with `npm run dev`. 18 of 34 specs set a phone viewport themselves. There is no WebKit project.
- Impact: Production-bundle-only and WebKit-only bugs are not caught.
- Fix: Add a `webkit` project (`devices["iPhone 14"]`) against `vite preview`. Effort: <1d

### What is covered (TEST-11)
| Suite | Files / tests | Exercises | Notes | Tag |
|---|---|---|---|---|
| tests/fitness | 35 / 345 pass (tooling/test-fitness.txt) | 19 src/lib/fitness modules, 18 other src/lib modules, 7 base44/shared domains | pure logic, mostly executing | **VERIFIED** |
| tests/security | 61 + 2 fakes / 492 pass (tooling/test-security.txt) | 26 base44/shared modules, ~26 src/lib modules, expo-ios/src protocol modules, scripts | TEST-03, TEST-04 | **VERIFIED** |
| tests/contract | 3 / 15 pass (tooling/test-contract.txt) | @zxing decode, static scans of the FoodLogEntry enum and RecompContext consumers | no src module imported | **VERIFIED** |
| tests/e2e | 34 specs / 194 declarations | whole SPA with `/api/apps/**` mocked (tests/e2e/support/base44.js:255) | cannot load (TEST-01) | **VERIFIED** |
| expo-ios/tests | 2 / 19 declarations | speechCapture, dependencySecurity | runs in CI (.github/workflows/ci.yml:49-50) | **VERIFIED** |

Not covered by any executing test (**VERIFIED**):
- all 25 entry.ts handlers
- src/lib/app-params.js (`rg "app-params|consumeVerifiedAuthCallbackToken" tests` returns 0)
- src/lib/AuthContext.jsx (regex only)
- src/lib/nativeIapBridge.js (text only)
- src/lib/referralAttribution.js and src/lib/authReturnTo.js (0 references)
- RecompContext loading (src/lib/RecompContext.jsx:329-551)
- the legacy check-in
- every React component

The deletion cascade's entity coverage is tested (tests/security/account-deletion.test.js:17-21, :47).

### The 5 highest-risk untested paths (TEST-12)
Tag: **VERIFIED** (absence of executing coverage). **SUSPECTED** (likelihood).

1. **Payment glue.**
   - Where: base44/functions/verifyApplePurchase/entry.ts:41-237 (`makeAppleServerJwt` :41-86, `crypto.subtle.importKey` :66, StoreKit hosts :91-92); base44/functions/verifyGooglePlayPurchase/entry.ts:54-237 (token exchange :102, androidpublisher GET :131); expo-ios/src/RecompOneWebView.tsx:139-330 (listeners :141, :167; `finishTransaction` :320).
   - Why: Every paying user goes through it. A key-format or claim mistake means no entitlement or unfinished transactions. Bot commit 43cb895 rewrote 77 lines of the Google handler with CI red.
   - Today: Domain modules are executed; the handlers and the shell are regex-only (e.g. tests/security/apple-sandbox-purchases.test.js:35-39 uses `indexOf` ordering).
   - Test needed: A Deno test with stubbed `fetch` and the tests/fixtures/apple-jws keys, plus a hook test after extracting `useStoreKitBridge`.
2. **Legacy weekly check-in.**
   - Where: src/lib/RecompContext.jsx:1652-1694 (`runCheckIn`), called from src/pages/More.jsx:167-180.
   - Why: It is the default production path, because `weeklyCheckInV2` defaults off (src/lib/featureFlags.js:39) and nothing in the repo turns it on. It calls `WeeklyCheckIn.create` (:1668) and then `updateStrategy` (:1690) client-side, non-atomically, with no per-week idempotency key. More.jsx:168 guards double taps in one tab only. Two devices, or a re-run in the same week, can adjust twice (**SUSPECTED** in practice).
   - Today: `rg runCheckIn tests` returns 0, and e2e forces v2 on (playwright.config.js:68).
   - Test needed: A flags-off Playwright project, plus a unit test of an extracted runCheckIn asserting a single strategy update.
3. **Auth bootstrap.**
   - Where: src/lib/app-params.js:41-108 (URL token, redirect nonce, persistence) and src/lib/AuthContext.jsx:101-127 (a network error leaves `isAuthenticated=false` with no `authError`, REL-01).
   - Why: Every session goes through it.
   - Today: app-params has nothing. AuthContext has 2 regexes, and e2e mocks public settings (tests/e2e/support/base44.js:34-55).
   - Test needed: Unit tests for `consumeVerifiedAuthCallbackToken` (expired nonce, wrong origin, bad shape), plus an AuthProvider render test for 401, 403 and network errors.
4. **Data load pipeline.**
   - Where: src/lib/RecompContext.jsx:329-551 (loadInitial :329, loadHistory :416 with retries `[2000, 5000, 15000]` at :37, ensureDateLoaded :492).
   - Why: Every authenticated screen is gated on it (RecompGate :1908). The bugs in REL-02, REL-03, REL-11, REL-16 and REL-V1 all live here.
   - Today: No unit test; e2e only, and e2e is dead.
   - Test needed: An extracted loader with a fake SDK covering partial failure, retry, a stale load after a write, and an already-loaded date.
5. **Deletion and AI cost-gate wiring.**
   - Where: base44/functions/deleteAccount/entry.ts (cascade ~:39, `if (!cascade.ok)` ~:45, `User.delete` ~:58), and the auth → entitlement → quota → LLM order in coachReply, analyzeFoodPhoto and lifestyleCoachReply.
   - Why: Irreversible data loss, or unbilled paid inference. The ordering exists only in entry.ts, and SEC-V1 is already an ordering bug.
   - Today: Regex or `indexOf` only (tests/security/repository-policy.test.js:123-127, tests/security/account-deletion.test.js:154-158).
   - Test needed: The TEST-05 extraction, then call-order assertions on a recording fake.

---

## 6. Accessibility and mobile responsiveness

**Verdict:** Icon buttons, the skip link, zoom, nav safe areas and 44px primitives are fine. Light-theme contrast fails AA on common pairs. The training forms are unlabeled. Toasts are silent to screen readers. An invisible toast container swallows taps in the top 32px of phone-width screens. No a11y check runs, because the only rendering suite is dead.

### A11Y-V1 Two empty, invisible toast containers cover the top 32px of every phone-width screen and swallow taps
- Tag: **VERIFIED** (Chromium hit-test with the production CSS; I reopened src/components/ui/toast.jsx:9, :18). **SUSPECTED** (which controls are hit on a given device).
- Severity: Medium
- Evidence:
  - `<Toaster />` is always mounted (src/App.jsx:166). It always renders ToastProvider and ToastViewport (src/components/ui/toaster.jsx:15, :43).
  - Both containers are `fixed left-0 top-0 z-[100] flex max-h-screen w-full ... p-4 sm:bottom-0 ...` (toast.jsx:9, :18) with no `pointer-events-none`. Only the toasts themselves get `pointer-events-auto` (:25).
  - The probe at 390×844 measured both divs at 390×32 px, top 0, `pointerEvents: "auto"`. `document.elementFromPoint(100, y)` returned the empty div at y = 10, 20 and 31, not the 44px button underneath.
  - src/components/ChildTopBar.jsx:14-19 places the Back button in that strip when the safe-area inset is 0.
- Impact: Taps on the upper part of the Back button and header links do nothing on phone-width web and Android, with no visible cause.
- Fix: Add `pointer-events-none` to both containers, delete the duplicate empty viewport, and add safe-area top padding. Effort: <1h

### A11Y-01 Several light-theme tokens fail WCAG AA 4.5:1 for normal text on common surfaces
- Tag: **VERIFIED** (ratios recomputed from the src/index.css:11-67 hex values). **SUSPECTED** (exact pairings per component).
- Severity: Medium
- Evidence:
  - Failing light-theme pairs: `--teal` on `--background` 4.21, on `--panel2` 3.93; `--muted-foreground` on panel2 4.38; destructive button 4.42; `--red` 4.42; `--blue` 4.43; `--green` 3.63; `--orange` 3.74 (the last four on card); `--border` on background 1.40 (WCAG 1.4.11 needs 3:1).
  - Teal on `--card` passes at 4.59. Dark-theme text passes, with a minimum of 5.94.
  - Usage: `text-teal` 231 times, `text-muted-foreground` 597. The only contrast test (tests/security/accessibility-semantics.test.js:75-93) checks `--gold` alone.
- Impact: Teal text on the page or panel2, muted text on panel2 cards, and destructive buttons are below AA.
- Fix: Darken `--teal` to about #0f7461 and `--muted-foreground` to about #56645e, and extend the test to every fg/bg pair. Effort: <1d

### A11Y-02 31 `<Label>`s have no `htmlFor`, and the workout and session-edit forms have ~22 inputs with no accessible name
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - src/components/training/WorkoutTracker.jsx:470-475 has `<Label>Title (optional)</Label>` above an `<Input>` with no id.
  - The set inputs at :738, :773, :782, :818, :843 and :852 have only placeholders ("135", "8").
  - src/components/training/SessionEditSheet.jsx:196-270 and :321-355 repeat the pattern.
  - 31 labels lack `htmlFor` across 11 files.
- Impact: Screen readers announce "edit text, 135", so the training flow cannot be used non-visually.
- Fix: Add `useId()` ids with `htmlFor`, and `aria-label={`Set ${idx+1} weight (lb)`}` on the set inputs. Effort: <1d

### A11Y-03 Toasts have no live region, and the dismiss button is invisible on touch and only 24px
- Tag: **VERIFIED**
- Severity: Medium
- Evidence:
  - `grep -nE 'role=|aria-live|aria-atomic'` over the three toast files returns nothing. The only app-wide live region is the route announcer (src/components/RouteAccessibility.jsx:49).
  - ToastClose (src/components/ui/toast.jsx:66-80) is `p-1 ... opacity-0 ... group-hover:opacity-100`.
  - Undo is offered in a 30 s toast that pauses on focus (src/components/ui/use-toast.jsx:7; src/components/ui/toaster.jsx:23-30).
- Impact: Screen-reader users never hear save, failure or undo toasts.
- Fix: Add `role="status" aria-live="polite"` (`role="alert"` for destructive toasts) and an always-visible 44px close button. Effort: <1h

### A11Y-04 The three Recharts charts have no text alternative
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/components/progress/{WeightTrendChart,CalorieAdherenceChart,StrengthProgressChart}.jsx each have 0 `role=`, `aria-`, `sr-only` or `<table`. src/components/progress/TrendsDashboard.jsx:72, :85 and :96 render the charts under an `<h2>` (:47, :79, :92) and a one-line mono caption (e.g. :94), nothing else.
- Impact: The trends are invisible to screen readers.
- Fix: Use `role="img"` with a computed summary label, or a visually hidden table. Effort: <1d

### A11Y-05 Six live bottom sheets ignore the safe area while the iOS WebView disables content insets
- Tag: **VERIFIED** (code). **SUSPECTED** (visual overlap).
- Severity: Low
- Evidence:
  - The WebView uses `contentInsetAdjustmentBehavior="never"` (expo-ios/src/RecompOneWebView.tsx:435), and index.html:7 sets `viewport-fit=cover`.
  - The sheet bottom variant has no inset (src/components/ui/sheet.jsx:31-37). StreakDetailSheet.jsx:48, ScoreDriversSheet.jsx:13, QuickLogSheet.jsx:130, WeeklyCheckInReview.jsx:272-274, CheckInSheet.jsx:13 and SessionEditSheet.jsx:188 lack `safe-area-inset-bottom`.
  - Height units are mixed: 4 sheets use `vh` and 4 use `svh`.
- Impact: The last button in those sheets can sit under the home indicator.
- Fix: Add `pb-[max(1.5rem,env(safe-area-inset-bottom))]` to sheet.jsx:36-37, and use `svh` throughout. Effort: <1h

### A11Y-06 9px muted text on panel2 in the scanner and macro donut
- Tag: **VERIFIED**
- Severity: Low
- Evidence: `text-[9px] ... text-muted-foreground` inside `bg-panel2` at src/components/nutrition/FoodPhotoScan.jsx:321 and src/components/nutrition/BarcodeScanner.jsx:419. MacroDonut.jsx:50 is also 9px. The contrast is 4.38 (A11Y-01).
- Impact: Macro labels are hard to read for low-vision users.
- Fix: Set a 12px minimum and add a repo-wide test grep. Effort: <1h

### A11Y-07 Seven JS smooth scrolls ignore prefers-reduced-motion
- Tag: **VERIFIED**
- Severity: Low
- Evidence: `behavior: "smooth"` appears at src/pages/Nutrition.jsx:152, :277, src/pages/Today.jsx:32, src/pages/Training.jsx:61, src/components/ScrollToTop.jsx:27, TodayChecklist.jsx:38 and src/components/AppLayout.jsx:98. Only Nutrition.jsx:172 checks `matchMedia`, and the CSS override (src/index.css:122-131) cannot stop an explicit behavior.
- Impact: Reduced-motion users still get animated scroll jumps.
- Fix: Add a `smoothBehavior()` helper that returns "auto" under reduce. Effort: <1h

### A11Y-08 Ten training inputs override the 16px base to 14px, which triggers iOS focus zoom
- Tag: **VERIFIED** (classes). **SUSPECTED** (zoom in this WKWebView configuration).
- Severity: Low
- Evidence: src/components/ui/input.jsx:13 defaults to `text-base ... md:text-sm`. `className="h-11 text-sm ..."` overrides it at src/components/training/WorkoutTracker.jsx:738, :773, :782, :818, :843, :852, src/components/training/SessionEditSheet.jsx:321, :346, :355 and src/components/training/SessionBuilder.jsx:239.
- Impact: The page zooms on every set entry mid-workout.
- Fix: Use `md:text-sm` instead of `text-sm`. Effort: <1h

### A11Y-09 Modal focus handling is hand-rolled 3 times instead of using Radix Dialog
- Tag: **VERIFIED**
- Severity: Low
- Evidence: src/components/nutrition/BarcodeScanner.jsx:158-212, src/components/nutrition/FoodPhotoScan.jsx:38-83 and src/pages/Nutrition.jsx:730-748. The two scanner Tab-wrap selectors omit select, textarea, summary and contenteditable. This is latent, because neither dialog contains those elements (QUAL-09).
- Impact: Each copy has to be fixed separately.
- Fix: One `useModalFocusTrap`, or Radix Dialog. Effort: <1d

### A11Y-10 The existing a11y tests check strings, not behaviour
- Tag: **VERIFIED**
- Severity: Info
- Evidence: tests/security/accessibility-semantics.test.js has 4 blocks: heading strings, aria-label templates, pagination strings, and one computed `--gold` contrast check. tests/security/touch-target-primitives.test.js:10-30 and tests/security/reduced-motion.test.js:10-21 match class strings. The 795 e2e `getByRole` queries are implicit checks, but they cannot run (TEST-01). There is no axe dependency.
- Impact: Today's a11y assurance is close to nil.
- Fix: Add `@axe-core/playwright` to 5 key specs once TEST-01 is fixed. Effort: <1d

### A11Y-11 Areas that are fine
- Tag: **VERIFIED**
- Severity: Info
- Evidence:
  - All 42 icon-only buttons of 275 scanned have an `aria-label` or `title`.
  - There are 0 `onClick` handlers on non-interactive elements.
  - 8 of 8 `<img>` have `alt`; FoodPhotoScan.jsx:213 uses a weak `alt="food"`.
  - The skip link and route announcer work (src/components/RouteAccessibility.jsx:43-49).
  - Zoom is allowed (index.html:7). The top and bottom nav honour safe areas (src/components/AppLayout.jsx:59, :82). Inputs are 44px (src/components/ui/input.jsx:13).
  - Orientation is locked to portrait (expo-ios/app.json:6, public/manifest.json:9).
  - `body { overflow-x: hidden }` (src/index.css:158-161) masks overflow, and the 320px e2e sweep that would catch it cannot run.
- Fix: None. Effort: n/a

---

## 7. Config / env

**Verdict:** The repo reads 30+ env and secret names. README documents 4 of the 12 VITE vars and 1 of 9 backend secrets. CI tests a different feature-flag set than production defaults to. The hosted build uses `npm install` while CI uses `npm ci`. The SDK is pinned at two versions. The production build passes without an app id. There is no `.env.example`, Node engine pin or CONTRIBUTING.

### CFG-05 The Base44 Builder commits straight to main and bypasses the PR gate, and the hosted install uses `npm install` (also: DEP-03, DEP-V1, SEC-15)
- Tag: **VERIFIED** (git, workflow and doc facts; branch rule queried: `{"protected":true,"rsc":{"checks":[],"contexts":[],"enforcement_level":"off"}}`). **SUSPECTED** (how Base44 hosting builds).
- Severity: High (same finding as BE-04 / DEP-03 / GIT-03 / B44-03, all High; this dossier had Medium)
- Evidence:
  - **Protection without checks.** main is protected but without required status checks, by documented choice (docs/codex-handoff.md:93, :101-103).
  - **Gated path unused.** .github/workflows/base44-builder-pr.yml:3-5 describes the reviewable path, but `origin/base44-builder` has had no commit since 2fb3a21 on 2026-09-15.
  - **Who pushes to main.** `git log origin/main --since=2026-09-01` shows 45 base44-builder[bot] commits against 61 human and 7 Dependabot commits.
  - **Majors outside policy.** 3ddb424 bumped vite 6 → 8 and plugin-react 4 → 6 directly on main (`gh api commits/3ddb424/pulls` returns `[]`), against .github/dependabot.yml:21-25 ("Major upgrades need isolated migration PRs").
  - **Reviewed work reverted.** Builder commit afd0fc4 re-added 2 packages that reviewed PR #136 had removed (DEP-V1).
  - **Install mismatch.** base44/config.jsonc:4 has `"installCommand": "npm install"`, while CI uses `npm ci` (.github/workflows/ci.yml:35).
- Impact: What is deployed can differ from anything CI built. Builder edits to code, tests and dependencies reach production unreviewed and can silently undo reviewed changes.
- Fix: Point the Builder at `base44-builder` (whether the dashboard allows it is unverified, docs/codex-handoff.md:107), require `verify` on main, and switch to `installCommand: "npm ci"`. Effort: <1d (settings + process; plus Base44 dashboard work)

### CFG-02 CI and production run different code paths: e2e forces Weekly Check-In v2 on while production defaults it off
- Tag: **VERIFIED** (code defaults and CI flags). **SUSPECTED** (the hosted build env).
- Severity: Medium
- Evidence: playwright.config.js:63-69 sets `VITE_ENABLE_WEEKLY_CHECK_IN_V2: "true"` and the dead `VITE_ENABLE_ITEMIZED_FOOD_DIARY`. src/lib/featureFlags.js:39 defaults v2 to off. src/pages/More.jsx:169 branches on it. No workflow or base44/config.jsonc sets it, and docs/deploy-weekly-check-in-v2.md:7 still has "Find out where Base44 sets build variables" unchecked.
- Impact: Production almost certainly runs the legacy `runCheckIn`, which no test executes (TEST-12 #2).
- Fix: Run Playwright as two projects (flags off and on), and delete the itemized env line. Effort: <1h

### CFG-04 SDK version drift: all 25 functions pin @base44/sdk 0.8.48, the frontend uses ^0.8.57, and the APIs differ (also: DEP-20)
- Tag: **VERIFIED**
- Severity: Medium. Resolution: C rated DEP-20 Low and J rated this Medium. Medium stands because TEST-06 documents a shipped bug (`count()`) caused by exactly this skew.
- Evidence: `rg -o "npm:@base44/sdk@[0-9.]+" base44 | sort | uniq -c` returns `25 npm:@base44/sdk@0.8.48`, all on line 1 (e.g. base44/functions/coachReply/entry.ts:1). package.json:23 has `^0.8.57`, installed at 0.8.57. .github/dependabot.yml has no Deno ecosystem, so the `npm:` specifiers are never updated, and no test checks parity.
- Impact: Shared code runs under two SDK versions, while tests and types reflect the newer one.
- Fix: Keep one version constant or import map (e.g. base44/functions/deps.ts), bump all pins together, and add a parity test. Effort: <1d (matches BE-21 / B44-05)

### DEP-14 Root majors behind, with no path to propose them
- Tag: **VERIFIED** (versions). **SUSPECTED** (per-package risk where marked in dossier C).
- Severity: Medium (aggregate)
- Evidence: tooling/npm-outdated.txt shows react 18.3.1 → 19.3.1, tailwindcss 3.4.19 → 4.3.3, recharts 2 → 3, framer-motion 11 → 14, date-fns 3 → 4, lucide-react 0.475 → 1.63, eslint 9 → 10 and typescript 5.9 → 7. .github/dependabot.yml:21-25 ignores semver-major. PR #177 (Tailwind 4) fails `vite build` as-is (DEP-04, reproduced: postcss.config.js:3 `tailwindcss: {}` is the v3 plugin entry).
- Impact: The migrations grow the longer they drift.
- Fix: Close #177 and schedule majors in this order: unused deps → Radix/minors → date-fns/recharts → React 19 → Tailwind 4 → ESLint 10. Effort: >1d (~5-8 days total)

### CFG-06 Missing setup docs: no .env.example, a scattered secrets list, no contributing or branching rules
- Tag: **VERIFIED**
- Severity: Low
- Evidence:
  - The root has no .env.example. .gitignore:2-3 ignores `.env.*`, so one would also need a `!.env.example` exception.
  - README.md:50-59 shows 4 of the 12 VITE vars and :69-72 documents 1 of 9 backend secrets. These are documented nowhere: VITE_BASE44_FUNCTIONS_VERSION, VITE_APP_VERSION, BASE44_LEGACY_SDK_IMPORTS, KEYTOOL_BIN and PLAYWRIGHT_CHROMIUM_EXECUTABLE.
  - There is no CONTRIBUTING, CODEOWNERS or PR template. AGENTS.md (34 lines) has no branching rules.
  - README "Prerequisites" (:11) says `npm install` and never mentions the test scripts. expo-ios/README.md:22-24 does have setup steps.
  - Other stale doc claims: docs/improvement-plan.md:47 and :240 ("Radix toast stack", which does not exist, DEP-22); docs/test-inventory.md:11 (348 tests, TEST-03); framer-motion "only one use" (PERF-05).
- Impact: Contributors and agents set up partial environments, and the backend secret checklist lives only in release docs.
- Fix: Commit `.env.example` with the gitignore exception, add a Secrets table to README, and add a short CONTRIBUTING.md. Effort: <1h

### CFG-07 The production build does not fail when VITE_BASE44_APP_ID is missing, and CI builds that bundle
- Tag: **VERIFIED** (build behaviour). **SUSPECTED** (whether the hosted build always injects the id).
- Severity: Low
- Evidence: tooling/build.txt:1-3 warns "VITE_BASE44_APP_ID is not set — this build will not know its app id and its API calls will fail" and then reports `✓ built`. .github/workflows/ci.yml:67-68 runs `npm run build` with no env.
- Impact: A misconfigured hosting env ships an app whose API calls all fail, and CI's build step verifies an unusable artifact.
- Fix: Throw in vite.config.js when `mode === "production"` and the id is missing, with a CI escape hatch, after confirming how `base44 build` injects the id. Effort: <1h

### CFG-01 (iOS origin) The iOS shell's web origin is hard-coded
- Tag: **VERIFIED**
- Severity: Medium (same finding as B44-10 in 03 and 04; this dossier had Low)
- Evidence: expo-ios/src/bridgeProtocol.ts:4 has `APP_ORIGIN = "https://recomp-iq.base44.app"`, and expo-ios reads no env (0 hits for `process.env` or `EXPO_PUBLIC`).
- Impact: An iOS dev or TestFlight build cannot target a test backend without a code edit, which is why TestFlight hits production (SEC-03).
- Fix: Read the origin from `EXPO_PUBLIC_APP_ORIGIN` with a production default. Effort: <1d plus a rebuild and review (matches B44-10)

### DEP-16 The Expo SDK is one major behind, and Dependabot is patch-only for expo-ios
- Tag: **VERIFIED**
- Severity: Low
- Evidence: expo 57.0.30 vs 58.0.21, react-native 0.86.3 vs 0.88.1, react-native-iap 16.5.1 vs 17.2.2 (expo-ios/package-lock.json; `npm view`). .github/dependabot.yml:44-55 and :66-70 ignore minor and major updates for `/expo-ios`.
- Impact: The StoreKit shell drifts off a supported SDK with no prompt.
- Fix: Schedule SDK 58 together with iap 17 and nitro 0.37, followed by a device build. Effort: >1d (~2-3 days)

### DEP-21 No Node engine pin, although Vite 8 needs Node ^20.19 or ≥22.12
- Tag: **VERIFIED** (repo). **SUSPECTED** (the Builder's Node version).
- Severity: Info
- Evidence: Neither package.json has `engines`, and there is no .nvmrc, .node-version or .tool-versions. node_modules/vite/package.json requires `^20.19.0 || >=22.12.0`, and CI uses Node 22 (.github/workflows/ci.yml:31).
- Impact: Older-Node environments fail at build with no clear message.
- Fix: Add `"engines": { "node": ">=22.12" }` and an `.nvmrc`. Effort: <1h

### DEP-18 Root jsconfig uses `baseUrl`, which TypeScript 6 deprecates
- Tag: **VERIFIED**
- Severity: Info
- Evidence: jsconfig.json:3 has `"baseUrl": "."`. The root runs TS 5.9.3 and expo-ios runs 6.0.3.
- Impact: A root TS 6/7 bump fails until it is removed.
- Fix: Drop `baseUrl` and keep `paths`. Effort: <1h

### DEP-23 Build-only packages are declared as runtime `dependencies`
- Tag: **VERIFIED** (declaration). **SUSPECTED** (platform effect).
- Severity: Info
- Evidence: `@base44/vite-plugin` (package.json:24) and `tailwindcss-animate` (:50) are in `dependencies`.
- Impact: Inflated "prod" audit counts.
- Fix: Move them to devDependencies after confirming the Base44 build installs devDependencies. Effort: <1h

### Environment variable inventory (CFG-01)
All rows are **VERIFIED**: dossier J re-grepped every `import.meta.env`, `process.env`, `Deno.env.get` and `secrets.get`.

| Var | Read at | In README? | Default when unset | Tag |
|---|---|---|---|---|
| VITE_BASE44_APP_ID | src/lib/app-params.js:78, :103 | yes (:53, :61) | undefined; the build still succeeds (CFG-07) | **VERIFIED** |
| VITE_BASE44_APP_BASE_URL | src/lib/app-params.js:81, :106 | yes (:54, :63) | `window.location.origin` | **VERIFIED** |
| VITE_BASE44_FUNCTIONS_VERSION | src/lib/app-params.js:80, :105 | no (documented nowhere) | undefined | **VERIFIED** |
| VITE_ENABLE_FOOD_PHOTO_SCAN | src/lib/featureFlags.js:12 | yes (:58, :74) | false (client-only gate, SEC-13) | **VERIFIED** |
| VITE_ENABLE_BODY_COMPOSITION_SCAN | src/lib/featureFlags.js:17 | yes (:56, :65) | false, OR'd with server `releaseFlags` (src/pages/Progress.jsx:255) | **VERIFIED** |
| VITE_ENABLE_TELEMETRY | src/lib/featureFlags.js:22 | no (docs/codex-handoff.md) | false (REL-18) | **VERIFIED** |
| VITE_TELEMETRY_ENDPOINT | src/lib/telemetry.js:10 | no (docs/codex-handoff.md) | "" | **VERIFIED** |
| VITE_APP_VERSION | src/lib/telemetry.js:11 | no (documented nowhere) | "dev" | **VERIFIED** |
| VITE_GOOGLE_PLAY_URL | src/lib/storeLinks.js:21-26 | no (docs/store-conversion-links.md) | null | **VERIFIED** |
| VITE_APP_STORE_URL | src/lib/storeLinks.js:28-31 | no (docs/store-conversion-links.md) | null | **VERIFIED** |
| VITE_ENABLE_WEEKLY_CHECK_IN_V2 | src/lib/featureFlags.js:39 | no (docs/features/weekly-check-in-v2.md and 2 others) | false (CFG-02) | **VERIFIED** |
| VITE_ENABLE_ITEMIZED_FOOD_DIARY | no reader; set only at playwright.config.js:67 | no | n/a (dead; src/lib/featureFlags.js:27 hard-codes true) | **VERIFIED** |
| BASE44_LEGACY_SDK_IMPORTS | vite.config.js:18 | no (documented nowhere) | false | **VERIFIED** |
| E2E_BASE_URL | playwright.config.js:4; tests/e2e/deployed-smoke.spec.js:4 | no (docs/release-checklist.md) | local dev server :4173 | **VERIFIED** |
| E2E_USER_EMAIL / E2E_USER_PASSWORD | tests/e2e/deployed-smoke.spec.js:5-6 | no (docs/release-checklist.md) | test skipped | **VERIFIED** |
| CI | playwright.config.js:38-41, :61 | n/a | local behaviour | **VERIFIED** |
| PLAYWRIGHT_CHROMIUM_EXECUTABLE / PLAYWRIGHT_BROWSERS_PATH | scripts/resolve-chromium.mjs:167, :124 | no (code comments only) | pinned browser | **VERIFIED** |
| AAB_PATH | scripts/verify-android-release.mjs:18, :447 | no (docs/android-play-release.md) | none | **VERIFIED** |
| PLAY_APP_SIGNING_SHA256 | scripts/verify-android-release.mjs:264 | no (docs/android-play-release.md) | none | **VERIFIED** |
| BUNDLETOOL_JAR / JAVA_BIN | scripts/verify-android-release.mjs:342, :343 | no (docs/android-play-release.md) | none / "java" | **VERIFIED** |
| KEYTOOL_BIN | scripts/verify-android-release.mjs:395 | no (documented nowhere) | dirname(JAVA_BIN)/keytool | **VERIFIED** |
| PREMIUM_TESTER_EMAILS (`Deno.env`) | 9 functions, e.g. base44/functions/coachReply/entry.ts:119 (full list under SEC-08) | no (4 release docs) | no testers | **VERIFIED** |
| ENABLE_BODY_COMPOSITION_SCAN (`Deno.env`) | base44/functions/analyzeBodyComposition/entry.ts:27-28; base44/functions/getPremiumAccess/entry.ts:5-6 | yes (:69-72) | disabled | **VERIFIED** |
| APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_BUNDLE_ID, APPLE_PRIVATE_KEY (`secrets.get`) | base44/functions/verifyApplePurchase/entry.ts:42-45, :125; base44/functions/appleStoreNotification/entry.ts:64 | no (docs/deploy-1-5.md, docs/apple-premium-launch.md) | verification fails | **VERIFIED** |
| APPLE_SANDBOX_ALLOWED_USER_IDS (`secrets.get`) | base44/functions/verifyApplePurchase/entry.ts:201 | no (same docs) | **all sandbox users allowed** (SEC-03, base44/shared/premiumDomain.js:146-147) | **VERIFIED** |
| PLAY_PACKAGE_NAME, GOOGLE_PLAY_SA_JSON (`secrets.get`) | base44/functions/verifyGooglePlayPurchase/entry.ts:121-122 | no (docs/premium-testing-and-launch.md, docs/android-play-release.md) | verification fails | **VERIFIED** |
| EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK / EXPO_OFFLINE | not set anywhere (would fix TEST-02) | no | doctor uses live Expo API data | **VERIFIED** (unset); **SUSPECTED** (EXPO_OFFLINE effect) |

Note on the APPLE_SANDBOX_ALLOWED_USER_IDS row: dossier J listed its default as "no sandbox users". The code says otherwise. With an empty allowlist, base44/shared/premiumDomain.js:146-147 returns `allowed: true`, so every sandbox user is allowed (I reopened it).

Backend config is read two ways, `Deno.env.get` (2 names) and `secrets.get` (7 names). That is an inconsistency, not a bug (SEC-08).

### Fine (CFG-08, VERIFIED)
- `visualEditAgent: true` (vite.config.js:24) is dev-only: node_modules/@base44/vite-plugin/dist/html-injections-plugin.js:266 returns `isServe && !bundled ? devTags() : []`, and the built index.html has 0 occurrences.
- `analyticsTracker: false` (vite.config.js:23).
- Query-string config is stripped and not persisted (src/lib/app-params.js:89-100).
- expo-ios has a strict tsconfig, a typecheck and tests in CI (.github/workflows/ci.yml:43-50).

---

## Dossier conflicts resolved

| # | Conflict | Resolution | How | Tag |
|---|---|---|---|---|
| 1 | When CI went red and at which step. Tooling README, SEC-15 and TEST-02 said "since #536 at Validate Expo configuration". Dossier C said #531 doctor, #533-#539 Typecheck, #540-#547 doctor. | Dossier C is right. 14 consecutive failing push runs, #531 to #547. Last green was #529 (2026-10-20). | `gh api .../actions/workflows/325130981/runs?branch=main` and `.../runs/<id>/jobs` for #531, #533, #536, #539, #540, #542, #547 | **VERIFIED** |
| 2 | E2E size: J said 34 specs / 194 tests; C said 34 specs / 196 `test(` calls | 194 `test("…")` declarations. The 196 count included 2 regex `.test(` calls on line starts. | `grep -hcE '^\s*test\((["'\`])' tests/e2e/*.spec.js` summed to 194 | **VERIFIED** |
| 3 | SEC-13 (Low) vs CFG-03 (Medium) for the food-photo server gate | Medium. The Bundle grants `food_photo`, and the Bundle is free via SEC-03. | opened base44/shared/premiumDomain.js:42-49 and base44/functions/analyzeFoodPhoto/entry.ts (:72, :82, :121; no ENABLE flag) | **VERIFIED** |
| 4 | PERF-03 (Medium) vs DEP-12 (Low) for recharts in Progress | Medium. The chart code is imported eagerly while the default section shows no chart, and the fix takes under an hour. | opened src/pages/Progress.jsx:14, :61, :228-236 | **VERIFIED** |
| 5 | CFG-04 (Medium) vs DEP-20 (Low) for the SDK pin skew | Medium. The skew already caused a shipped bug (TEST-06, base44/shared/coachRateLimitDomain.js:238-241). | dossier evidence plus the cited comment | **VERIFIED** |
| 6 | framer-motion: PERF-05 said 34.9 KiB gz and "two consumers"; DEP-08 said 36.15 kB gz and "3 call sites" | Both are right. They use different units (gzip -9 KiB vs Vite's kB), and there are 3 call sites in src, 2 of them on the /today path. | tooling/build.txt `proxy-BOIUEqTK.js 109.50 kB │ gzip: 36.15 kB` | **VERIFIED** |
| 7 | AuthContext catch lines: REL-01 said 114-127; TEST-12 #3 said 113-126 | 114-127, with the 401/403 check at :121 | opened src/lib/AuthContext.jsx:100-128 | **VERIFIED** |
| 8 | Default when APPLE_SANDBOX_ALLOWED_USER_IDS is unset: CFG-01 said "no sandbox users"; SEC-03 said all are allowed | All sandbox users are allowed | opened base44/shared/premiumDomain.js:146-147 | **VERIFIED** |
| 9 | Cross-document severity/effort (final QA) | Aligned with the same finding in 01-04: SEC-04 → High (BE-02), CFG-05 → High and <1d (BE-04), CFG-01 → Medium (B44-10), SEC-10 → Low (IOS-15), SEC-16 → Low (BE-11), CFG-04 → <1d (BE-21), REL-20 → ~2-3 d (FE-19). SEC-18's "delete the file" fix contradicted FE-11/DEAD-04 and was replaced. PERF-13's "stop tracking the docs copies" contradicted DEAD-14 and was replaced | 00 C10 | — |

## Could not assess
- **Base44 platform authorization.** Whether end-user or anonymous tokens can call `/integration-endpoints/Core/*` or `/ai/<provider>/v1` (SEC-01). Whether functions accept cookie sessions (SEC-14). Whether `created_by_id` and `role` are client-immutable, and whether deployed RLS matches the repo. The repo does not show this, and no deployed test app was available.
- **Live response headers** (CSP, frame-ancestors, XFO, HSTS) for recomp-iq.base44.app and fitnesstrackerapps.com. The egress proxy returned 403, and these decide SEC-02's severity.
- **Secret values and state.** PREMIUM_TESTER_EMAILS contents, and whether APPLE_SANDBOX_ALLOWED_USER_IDS and the Play secrets are set. Only doc claims are available. Whether a public TestFlight link exists is also unknown.
- **Base44 email verification and account linking** across the 5 login methods (SEC-08). **Login redirect behaviour** for a signed-in user given an arbitrary `from_url` (SEC-V2).
- **Base44 private-file retention and deletion**, and any platform storage or request caps (SEC-05, SEC-07).
- **Platform runtime behaviour**:
  - read-after-write consistency (REL-12)
  - instance routing (REL-07, REL-13)
  - realtime fan-out (PERF-09)
  - function wall-clock limits (REL-10, PERF-11)
  - whether `InvokeLLM` has a server-side timeout
  - whether the SDK can omit socket.io (PERF-06)
  - delete-on-missing behaviour (REL-06)
  - whether the host injects a service worker (REL-19)
  - server-side semantics of `deleteMany`, `updateMany`, `$lt` and `$unset` (TEST-06)
- **Hosted build environment.** Which `VITE_*` vars Base44 sets in production (CFG-02, CFG-07, REL-18), whether it honours the lockfile or `--omit=dev`, and its Node version (CFG-05, DEP-21, DEP-23).
- **Real-device runtime.** React Profiler or Lighthouse timings, WebView parse cost, screen-reader output, and safe-area overlap on iOS and Android, including whether `env(safe-area-inset-top)` is 0 in the Android wrapper (A11Y-V1). The PERF-07, PERF-08 and PERF-10 costs are desktop Node measurements, extrapolated.
- **E2E behaviour.** No spec loads (TEST-01), and installing esbuild would break the read-only rule. The race and reliability specs and the exact runtime test count are therefore unverified.
- **expo-ios.** node_modules is not installed, so the shell's typecheck and tests were not run locally (I relied on the CI config). No Metro bundle was produced to confirm that the vulnerable expo-ios packages are build-time only (npm audit subsection).
- **Expo doctor fix.** Whether `EXPO_OFFLINE=1` makes doctor's other network checks pass, and whether PR #196 passes doctor once DEP-24 is fixed. No Expo API access was available.
- **GitHub job logs.** The proxy blocked log downloads (403), so the cause of the Typecheck failures in #533-#539 and of the September doctor failures on Dependabot PRs is unknown. Only step conclusions were readable.
- **Base44-managed Android wrapper** (src/lib/nativeStoreShell.js:1-17). Whether it calls registerPushToken or verifyGooglePlayPurchase, or acknowledges Play purchases (SEC-06, QUAL-17).
- **Whether OAuthConsent.jsx is reached by a Base44 platform route** outside the repo (QUAL-05, SEC-18).
- **The exact ~75-site UI call total** in the error-handling inventory. The original script's input was not saved; only the 5 unhandled sites were re-derived.
- **Full git-history secret scan.** This relied on a tracked-file regex sweep plus the tooling digest; not every historical object was rescanned.
- **Upstream breaking-change lists** for Tailwind 4, Recharts 3, lucide 1.x, eslint-plugin-react-hooks 7 and react-native-iap 17 (DEP-14, DEP-16).
