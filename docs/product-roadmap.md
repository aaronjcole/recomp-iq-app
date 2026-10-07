# RecompOne product roadmap

This roadmap prioritizes user trust, measurement quality, and a short feedback loop between GitHub implementation and Base44 testing.

## Release foundation

Status: in progress

- Complete the public-repository security and history audit.
- Add repeatable local and deployed end-to-end test entry points.
- Require lint, typecheck, fitness tests, and production build in CI.
- Verify authentication, onboarding recovery, account deletion, uploads, and function permissions in a Base44 test deployment.
- Document the release and rollback checklist.

Exit criteria:

- Automated checks pass on the release PR.
- The Base44 smoke-test checklist passes with a disposable account.
- No unresolved high-impact security or data-integrity finding remains.

## Weekly Check-In v2

Status: built behind `VITE_ENABLE_WEEKLY_CHECK_IN_V2`; needs the Base44 test matrix before it is enabled

Turn the existing automatic check-in into a guided, explainable proposal that the user reviews before any target changes are applied.

Primary outcomes:

- Users understand which signals drove a recommendation.
- Opening a check-in never changes the plan.
- Applying, declining, or retrying a proposal is explicit and idempotent.
- Safety flags and insufficient data remain hard stops.

Implementation specification: [Weekly Check-In v2](features/weekly-check-in-v2.md)

## Nutrition logging velocity

Status: in progress

- Done: every add path logs into a chosen meal (defaulting to the time of day), not "Other".
- Done: recent foods are what was actually logged, with Undo after a one-tap add.
- Done: copy yesterday, or copy a past meal to today; each copy action only offers what hasn't been copied yet.
- Done: quantity in the entry editor scales calories and macros.
- Done: duplicate-tap protection and failure messages on quick adds, copies and templates.
- Next: favorite foods (needs a `FoodItem` field), and better recipe and meal-template editing.

## Training progression

Status: in progress

- Done: lifts are grouped by normalized name, so differently typed names share one history.
- Done: per-exercise history (every session, PRs marked, weekly volume), opened from Strength progression.
- Done: PRs are called out when a workout is saved. A first-ever log is not a PR.
- Done: the live workout shows last time and a conservative next target (double progression), with Fill.
- Done: the suggestion holds after poor recovery, a drop, or 14+ days away, and suggests a ~10% deload after three stalled sessions. Plateau alerts use the same rule.
- Next: rep ranges per exercise (the 12-rep ceiling is one-size-fits-all), and a volume trend across all lifts.

## Data portability and trust

Status: in progress

- Done: More → Your data downloads everything as JSON, or any table as CSV, through `exportAccountData`. It exports exactly what account deletion removes (both use `accountDeletionPlan`), push tokens are redacted, and CSV cells that could run as spreadsheet formulas are neutralized.
- Done: the page counts what's stored, says where it's kept and that deletion removes all of it, and links the Privacy Policy for backups and timing.
- Done: export and deletion end-to-end tests that run the real export and deletion code, including another account's rows.
- Done: a privacy-request email with a verification prompt.
- Next: verify file sharing in the iOS and Android shells on a device. Where the WebView can't share files, the page currently points to the web app; a native share bridge would remove that step.

## Progress insights

Status: in progress

- Done: Progress → Overview opens with "What your data says". Each of weight, waist, strength, recovery and consistency is shown as toward, against, or steady for the user's goal, with whether weight, waist and strength agree or conflict.
- Done: observed facts (values and the data behind them) are listed separately from the likely explanation, which is labelled as inferred and carries its confidence and what to watch next.
- Done: measures that can't be judged are listed with the reason; under 14 days of data stays low confidence, and low consistency caps it.
- Next: show how the read changed since last week, and link each explanation to the chart that supports it.

## Reminders and integrations

Status: discovery. Design in [features/reminders-and-integrations.md](features/reminders-and-integrations.md); four decisions are open before implementation.

- Weigh-in and weekly check-in reminders.
- Missed-log nudges with user-controlled frequency.
- Apple Health, Health Connect, Fitbit, or wearable import feasibility.
- Privacy, consent, duplicate-data, and revocation design before implementation.

## Premium add-ons

Status: testing foundation shipped

- The server-authorized Premium bundle and individual add-on model is live for tester entitlements.
- Adaptive meal planning, adaptive training blocks, Weekly Autopilot, and on-device Visual Progress
  Check are available to authorized testers and visibly labeled Premium.
- The older AI body-composition scanner remains disabled. Visual Progress Check makes no biometric
  estimate and does not upload photos.
- Production monetization remains gated on a supported Google Play Billing verification bridge;
  never rely on a build-time flag, browser callback, or client state as a payment control.
- Launch with the all-in-one bundle first; preserve individual product IDs for later pricing tests.

Testing, product IDs, cutover steps, and platform blockers: [Premium testing and launch](premium-testing-and-launch.md)

## Delivery approach

Each feature should move through the same sequence:

1. Agree on user behavior and acceptance criteria.
2. Add or update pure-domain tests.
3. Implement entities, backend functions, and UI in GitHub.
4. Pass local and GitHub CI.
5. Deploy to a Base44 test environment.
6. Run the documented Base44 test matrix.
7. Promote only after the deployment checks pass.
