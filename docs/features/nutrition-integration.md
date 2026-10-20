# RecompOne nutrition integration and publishing

This release connects the existing food diary, recipes, meal plans, reports, and Coach through explicit food review. Web changes publish through Base44. Native meal dictation also requires a rebuilt iOS shell; publishing the website does not upgrade an installed binary.

## Food logging

Search, barcode lookup, manual entry, saved meals, recipes, planned meals, and described foods produce editable drafts. Review fixes the date and meal before saving and supports quantities, multiple items, correction, removal, and Undo. Missing core nutrition is blank and must be supplied or resolved through search. Existing one-tap recents remain available.

Logging adds nutrition increments to the stored daily totals. Reports must not add diary entries to those totals again: daily totals can also contain nutrition entered manually. Batch persistence uses compensating deletion after failures, not a database transaction. If compensation fails, surviving entries remain visible as incomplete and the open review blocks resubmission. The diary offers explicit discard without changing daily totals; review and correct the daily totals before logging again. Deleted-entry tombstones prevent older in-flight history responses from resurrecting deleted foods, and Undo follows replacement IDs created during compensation. After an uncertain connection failure, check the diary before retrying; these recovery controls are not a cross-device transaction guarantee.

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

## iOS release checklist

The speech bridge declares microphone and speech-recognition purpose strings and requires the new native module. Old shells continue to support typing without relying on that module.

1. Use an unused iOS build number for the next binary and create a signed development build following the iOS shell README. Expo Go cannot test this native module or StoreKit.
2. On a supported real device, test native consent, permission granted and denied, service unavailable, Stop, Cancel, timeout, backgrounding, navigation, and repeated recording. Final text must arrive once; cancellation must never submit text or log food.
3. Recheck barcode camera access and StoreKit purchase/restore behavior because they share the shell. Test the web fallback in an older installed shell.
4. Produce and distribute the updated binary through the normal TestFlight/App Store workflow. Git push and Base44 publishing do not perform this step.

## Verification commands

Run the root lint, typecheck, fitness, security, contract, Android release contract, production build, and non-deployed browser suites. In expo-ios, install locked dependencies and run typecheck, test:speech, and doctor. Local browser suites use synthetic authenticated records; they do not replace live Base44 and real-device acceptance checks.

The October 20 local verification passed 247 fitness tests, 376 security tests, 15 contract tests, 121 browser tests, and 15 native speech tests (774 total). Lint, both typechecks, the production build, Android release contract, and all 21 Expo Doctor checks also passed. Five subagents contributed implementation and cross-review; their identified recovery, date-context, and speech-lifecycle issues were addressed before release. Live Base44 acceptance and real-device iOS testing remain release checklist items, not completed checks.

Expo and expo-dev-client were aligned to the SDK 57 patch versions required by Expo Doctor. The iOS lock also updates shell-quote past its [command injection advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). The October 20 dependency audit still reports 9 web and 22 iOS moderate/high advisories; no forced major dependency upgrades are included in this feature release. Review that separate advisory backlog before a production mobile release.

At the release push, GitHub separately reported 11 Dependabot alerts, including 1 critical, 6 high, and 4 moderate. Fresh local npm audits reported zero critical findings in either lockfile. The reason for that discrepancy has not been verified; review the repository's Dependabot alerts before production publishing rather than treating the local test results as dependency-security clearance.
