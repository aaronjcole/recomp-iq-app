# RecompOne nutrition integration and publishing

This release connects the existing food diary, recipes, meal plans, reports, and Coach through explicit food review. Web changes publish through Base44. Native meal dictation also requires a rebuilt iOS shell; publishing the website does not upgrade an installed binary.

## Food logging

Search, barcode lookup, manual entry, saved meals, recipes, planned meals, and described foods produce editable drafts. Review fixes the date and meal before saving and supports quantities, multiple items, correction, removal, and Undo. Missing core nutrition is blank and must be supplied or resolved through search. Existing one-tap recents remain available.

Logging adds nutrition increments to the stored daily totals. Reports must not add diary entries to those totals again: daily totals can also contain nutrition entered manually. Batch persistence uses compensating deletion after confirmed failures, not a database transaction. Increment requests carry a unique operation ID; the backend stores its receipt with the totals. After a lost response, a read-only status lookup confirms the receipt before any retry. If the status cannot be verified (including an older backend), the client blocks blind resubmission and retains incomplete entries for review rather than deleting potentially committed food records.

If compensation fails after a confirmed non-commit, surviving entries remain visible as incomplete and can be explicitly discarded without changing daily totals. Uncertain commits require totals review instead; discarding their rows cannot safely determine whether the increment applied. Deleted-entry tombstones prevent older in-flight history responses from resurrecting deleted foods, Undo follows replacement IDs, and edit/delete/restore operations share an entry-level queue. Pending batches stop subsequent writes and local publication when the account changes. These controls do not provide a distributed transaction across devices or independently running backend instances; recovery overlays are client-session state, not a durable cross-device reconciliation ledger.

Describe a meal parses text locally without a paid AI request. It matches exact saved foods and a small [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) starter catalog. Unknown foods, ambiguous units, preparations, and portions require review. Generic nutrition is an estimate, not a verified brand or recipe match. Speech adds editable text only and never submits food automatically.

## Recipes and planning

Fuel Library includes recipe search, favorites, details, editing, deletion, and explicit logging. Nutrition entered for the whole recipe is divided by its batch serving count; missing values are not invented. Saved recipe deletion does not delete existing diary entries.

Meal plans remain account-scoped, device-local cached plans. Scheduling or swapping a planned meal does not record it as eaten. Log actions open review and future diary dates remain disallowed. Recipe and planner groceries use shared item and quantity matching, with separate source lists and account-scoped local checkmarks. These local plans and checkmarks do not sync between devices.

## Reports and Coach

Progress Nutrition offers 7- and 30-day ranges ending on the selected date. It fetches owner-scoped, paginated range data independently of the capped global history. Averages identify recorded-day coverage; missing days are not zero. Macro energy uses protein and carbohydrate at 4 kcal/g and fat at 9 kcal/g. Comparisons use current targets, not historical target snapshots. Food contributors cover itemized entries only and cannot explain unitemized totals. Fetch limits or failures produce an explicitly partial report.

Coach requests include a local reference date and deterministic calorie and protein facts. A missing selected-day log is not replaced by another day's latest log. Changing dates clears the conversation and ignores an outstanding response from the previous date. Existing safety screening and request quotas remain in force. Opening a contextual Coach link prefills a question without making a paid request.

## Photo analysis

Food photo analysis remains disabled by default through its existing release flag and requires Premium access. Explicit consent precedes private upload and inference. Response version 2 separates estimated foods and supports an unable-to-estimate outcome. Every item remains correctable or removable before logging. Ownership verification, quota reservations, and private signed URLs remain server-side.

The backend retains the version 1 aggregate response for old clients; new clients request version 2 and can still display a legacy aggregate response. Do not enable the photo release flag until the private-upload, AI-provider retention, deletion, consent, and store privacy disclosures are accepted for the deployed environment.

## Base44 publishing checklist

1. Confirm GitHub synchronization includes the updated Recipe and FoodLogEntry entity schemas and the coachReply and analyzeFoodPhoto functions, not just the frontend files. Publish the backend/schema changes with the web release.
2. Confirm Recipe includes the added batch nutrition and favorite fields, and FoodLogEntry accepts recipe, plan, and describe sources while retaining existing values and owner rules.
3. Test historical logging, a recipe with unknown nutrition, a planned meal, and a described meal in the Base44 preview. Confirm that opening or canceling review creates no diary entries.
4. Test a 30-day report with sufficient history, then edit and remove an item. Confirm totals refresh, coverage is labeled, and no manual totals disappear.
5. Ask Coach about a historical day with no intake record; it must not report yesterday's intake as that day's intake.
6. Publish through Base44 after these preview checks. Do not enable gated photo inference as an incidental publishing step.

### Meal reliability pass (October 22, 2026)

Sync `DailyLog.nutrition_operation_ids` plus `upsertTrackingRecord` and its shared domain/persistence modules with the frontend. The optional receipt field preserves all existing log fields and owner rules. Do not use a whole-schema CLI push unless remote-only entities have been compared: that command can remove schemas absent locally. The new frontend fails closed on an uncertain save against an older backend, but receipt recovery is only available once the updated backend is deployed.

This pass keeps the existing design tokens and component primitives. Review sheets use a separately scrolling body and visible footer; scanner loading can be canceled; cached Fuel pages cannot leave modal portals over another tab. Recipe/template rows, diary controls, grocery lists, and scanner results wrap on narrow screens. Switching routes, dates, or Fuel segments dismisses obsolete reviews. Late camera playback and planner responses cannot overwrite a newer operation; stale scanner notifications do not cover a later scanner. Failed zero-clamped increments rebuild their optimistic totals from a baseline and replay remaining changes in order. No new native module, dependency, entitlement bypass, photo release flag, or paid inference path is introduced.

For this GitHub-connected app, sync the release to `main` and publish through the editor, as described in [Base44's GitHub workflow](https://docs.base44.com/developers/app-code/local-development/github). Source synchronization is not proof that the published production deployment has updated; retain post-publication acceptance checks.

Local release verification: 842 unit/security/contract tests pass; lint, TypeScript checking, and the configured production build pass. The full browser run covered 213 scenarios (210 passed, three stale test expectations were corrected); the final 116-scenario affected-flow rerun passes, including all three corrections. Five agents covered composition/search/speech, diary integrity, recipes/templates, planning/groceries, and persistence, with independent follow-up reviews. Browser camera, photo inference, and speech services were mocked; physical-device permissions and distributed backend behavior are not established by these local results.

## iOS release checklist

The speech bridge declares microphone and speech-recognition purpose strings and requires the new native module. Old shells continue to support typing without relying on that module.

1. Build the existing EAS project following the iOS shell README. Its production profile uses remote build versions and auto-increment; do not manually reuse a store build number or initialize another project. Expo Go cannot test this native module or StoreKit. EAS can compile and sign in the cloud without local Xcode.
2. On a supported real device, test native consent, permission granted and denied, service unavailable, Stop, Cancel, timeout, backgrounding, navigation, and repeated recording. Final text must arrive once; cancellation must never submit text or log food.
3. Recheck barcode camera access and StoreKit purchase/restore behavior because they share the shell. Test the web fallback in an older installed shell.
4. Produce and distribute the updated binary through the normal TestFlight/App Store workflow. Git push and Base44 publishing do not perform this step.

## Verification commands

Run the root lint, typecheck, fitness, security, contract, Android release contract, production build, and non-deployed browser suites. In expo-ios, install locked dependencies and run typecheck, test:speech, and doctor. Local browser suites use synthetic authenticated records; they do not replace live Base44 and real-device acceptance checks.

The October 20 local verification passed 247 fitness tests, 377 security tests, 15 contract tests, 122 browser tests, and 19 native speech/dependency tests (780 total). Lint, both typechecks, the production build, Android release contract, and all 21 Expo Doctor checks also passed. Independent subagent reviews covered implementation, save recovery, date context, speech lifecycle, dependency compatibility, and the rapid-tab navigation fix. Live Base44 write acceptance and real-device iOS testing remain release checklist items, not completed checks.

Expo and expo-dev-client match the SDK 57 patch versions required by Expo Doctor. Compatible security updates cover shell-quote, brace-expansion, source-map-js, and postcss-selector-parser. The native xcode package has a narrowly scoped UUID override, with regression tests for CommonJS loading and Xcode project generation. The October 20 follow-up npm audit reports 7 web findings (5 high, 2 moderate) and 15 iOS findings (all high), with zero critical findings. The parser's two moderate findings persist in npm's advisory range even though the [maintainer lists the installed 6.1.5 backport as patched](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf).

The remaining upstream issues are [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in the tooling trees and [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) in native signing tooling. Neither advisory lists a patched release. No application-request path was identified; do not feed untrusted glob patterns, certificates, or CSRs into the affected build tools. No forced framework migrations or unsafe dependency downgrades are included.

The initial GitHub push notice showed an old critical alert. A subsequent authenticated Dependabot read showed seven open alerts and no critical alerts, resolving that discrepancy. Counts can differ from npm because npm also counts affected parent packages.

## Hosted release preparation

GitHub CI and CodeQL passed for the feature release. Base44 confirmed synchronization of the nutrition feature commit and release notes, including the backend source directories. The existing published site's public legal routes and signed-out access checks passed against the real backend; authenticated deployed acceptance requires isolated test data rather than production health records. Base44 publication remains the owner's action.

The connected Expo account and project are valid. Before this build, the October allowance showed 0 of 15 free iOS builds used and zero overage charges. The approved [iOS build 6](https://expo.dev/accounts/promptlabllc/projects/recompone-app/builds/ac5108fa-c470-4f85-99be-e158838cf34c) completed successfully from native source commit 7e6e81c, using remote auto-increment and existing signing credentials. The downloaded IPA passed strict, deep signature verification. Its bundle ID and build number are correct, microphone/speech/camera/photo purpose strings are present, and the speech module is compiled into the executable. Later web-only navigation changes do not require rebuilding this shell.

The archive has not been uploaded to TestFlight or submitted for App Store review. Compilation and signature checks do not replace physical-device checks of OS permissions, audio routing, native sign-in, camera access, and sandbox purchase/restore.

The shell loads the production web origin, not the Builder preview. Validate the new voice UI on build 6 after the web changes are published; before publication, it loads the previously published website. Older installed shells retain typed meal entry without requiring the new native module.

## Owner handoff

The agent can handle code, dependency triage, GitHub synchronization, hosted acceptance using synthetic records, archive creation, and an approved private TestFlight upload. The owner retains these actions:

1. Approve enabling Base44's isolated Test Data environment before hosted tests write records. Production health data must stay untouched.
2. Publish the verified web changes through Base44 after hosted checks. Keep photo inference gated off.
3. Approve a TestFlight-only upload separately from a public store review or release.
4. Install the test build on an iPhone and check microphone grant/denial, Stop/Cancel, barcode camera access, native sign-in, and sandbox purchase/restore. Provide any account verification or legal approval only if the service requests it; never send passwords or signing keys in chat.
