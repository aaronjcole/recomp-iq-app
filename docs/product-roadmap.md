# RecompIQ product roadmap

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

Status: next

Turn the existing automatic check-in into a guided, explainable proposal that the user reviews before any target changes are applied.

Primary outcomes:

- Users understand which signals drove a recommendation.
- Opening a check-in never changes the plan.
- Applying, declining, or retrying a proposal is explicit and idempotent.
- Safety flags and insufficient data remain hard stops.

Implementation specification: [Weekly Check-In v2](features/weekly-check-in-v2.md)

## Nutrition logging velocity

Status: planned

- Recent and favorite foods.
- Copy yesterday or copy a meal.
- Serving multipliers and undo.
- Better recipe editing and meal-template management.
- Duplicate-submit protection and optimistic retry messaging.

## Training progression

Status: planned

- Exercise-level history and personal-record detection.
- Estimated 1RM and volume trends.
- Conservative load or repetition suggestions.
- Plateau and deload signals that account for recovery and adherence.

## Data portability and trust

Status: planned

- User-initiated JSON and CSV export.
- Clear retention and deletion status.
- Export and deletion end-to-end tests.
- Support and privacy contact workflow.

## Progress insights

Status: planned

- Explain agreement or conflict among weight, waist, strength, recovery, and adherence.
- Separate observed facts from inferred explanations.
- Display confidence and missing-data limitations.

## Reminders and integrations

Status: discovery

- Weigh-in and weekly check-in reminders.
- Missed-log nudges with user-controlled frequency.
- Apple Health, Health Connect, Fitbit, or wearable import feasibility.
- Privacy, consent, duplicate-data, and revocation design before implementation.

## Premium add-ons

Status: discovery

- Treat body-composition photo analysis as an optional premium capability rather than part of the
  free core experience.
- Require an authenticated server-side entitlement and usage allowance before enabling analysis;
  never rely on the current build-time feature flag as a payment control.
- Price against actual inference and private-storage costs, with a clear monthly scan allowance.
- Keep the feature disabled until private-file retention, deletion, consent, and estimate-quality
  standards are acceptable.
- Avoid medical claims and keep photo-based estimates clearly labeled as approximate.

## Delivery approach

Each feature should move through the same sequence:

1. Agree on user behavior and acceptance criteria.
2. Add or update pure-domain tests.
3. Implement entities, backend functions, and UI in GitHub.
4. Pass local and GitHub CI.
5. Deploy to a Base44 test environment.
6. Run the documented Base44 test matrix.
7. Promote only after the deployment checks pass.
