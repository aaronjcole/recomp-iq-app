# Weekly Check-In v2

## Objective

Replace the current one-click, immediately mutating check-in with a guided review that separates analysis, user consent, and plan application.

The experience should answer four questions:

1. What happened during the review period?
2. How reliable is the available data?
3. What does RecompOne recommend, and why?
4. Does the user want to apply that recommendation?

## Current behavior and risk

The current flow calculates a recommendation, creates a `WeeklyCheckIn`, and may immediately update `CurrentStrategy`. A user cannot review the proposed targets before they are applied. Multiple attempts can also create more than one check-in for the same period, and a partial multi-record failure can leave the check-in, strategy, and decision ledger out of sync.

## Proposed user flow

### 1. Review

Opening the check-in displays a seven-day summary without writing or changing data:

- Current and previous seven-day average weight.
- Waist direction when enough measurements exist.
- Calorie, protein, step, and workout adherence.
- Recovery summary from sleep, energy, hunger, and soreness.
- Missing-data count and confidence level.
- Relevant safety or insufficient-data warning.

### 2. Proposal

The engine produces one proposal:

- Keep the plan.
- Increase or reduce calories by a bounded amount.
- Increase steps by a bounded amount.
- Focus on adherence.
- Reduce training fatigue.
- Seek professional guidance.
- Keep collecting data.

The UI shows current and proposed targets side by side, the evidence used, and what did not influence the decision.

### 3. Decision

The user chooses one action:

- Apply recommendation.
- Keep current plan.
- Review custom targets.
- Close and decide later.

Opening or closing the proposal never changes targets. Manual-target mode always keeps the proposal advisory.

### 4. Confirmation

After a successful apply or decline, show:

- The recorded decision.
- Any target changes.
- The next review date.
- A link to decision history.

## Data model

Extend `WeeklyCheckIn` with:

- `period_key`: stable local period identifier such as `2026-07-26:2026-08-01`.
- `status`: `proposed`, `applied`, `declined`, or `superseded`.
- `previous_targets`: snapshot before a decision.
- `targets_for_next_week`: proposed snapshot.
- `supporting_metrics`: normalized metrics and confidence inputs.
- `confidence`: `low`, `medium`, or `high`.
- `decision_reason`: deterministic explanation.
- `user_decision`: `apply`, `keep_current`, or `customize`.
- `applied_at`: timestamp when application succeeds.

Extend `DecisionLedger` with an optional `weekly_check_in_id` so one applied proposal maps to one ledger entry.

Base44 does not provide a declared unique constraint in the current entity definitions, so code must query by `period_key`, reuse an existing proposal, and reconcile duplicates deterministically.

## Application boundary

Use two explicit operations:

- `prepareWeeklyCheckIn`: calculate or return the proposal for the current period. It does not update `CurrentStrategy`.
- `applyWeeklyCheckIn`: validate ownership, proposal status, current strategy version, and safety rules before applying exactly once.

The apply operation should run in a Base44 backend function so the client cannot submit arbitrary target changes. Every service-role entity operation must include the authenticated user's ID or an entity ID previously verified as owned by that user.

If Base44 cannot provide a transaction, use an idempotent state machine:

1. Verify the proposal is still `proposed`.
2. Verify the current strategy matches the proposal's `previous_targets` fingerprint.
3. Update the strategy.
4. Create or reuse the linked ledger entry.
5. Mark the proposal `applied` with `applied_at`.
6. On retry, return the already-applied result without another adjustment.

Failures after step 3 must be repairable by retrying the same proposal; they must not cause a second target adjustment.

## Domain rules

- Require at least 14 recent calendar days before an adaptive target change.
- Missing metric days count against adherence; duplicate records count once per date.
- Safety flags prevent aggressive changes and return professional-guidance messaging.
- Manual override prevents automatic strategy mutation.
- Calorie changes remain small and schema-bounded.
- Step targets remain schema-bounded.
- Goal-specific logic must distinguish fat loss, recomposition, maintenance, and gain goals.
- A proposal records the engine version or rule version used to create it.

## Accessibility requirements

- The check-in is usable by keyboard and screen reader.
- Focus moves to the review heading when opened and returns to the trigger when closed.
- Target changes are expressed as text, not color alone.
- Loading, success, and failure states use live-region announcements.
- The confirmation action names the exact effect, for example `Apply 1,950 calorie target`.

## Acceptance criteria

- Opening a check-in performs no persistent write and changes no target.
- Reopening the same period returns the same proposal unless the user explicitly refreshes it.
- Applying a proposal changes the strategy at most once.
- Repeated clicks, network retries, and two simultaneous tabs do not duplicate the adjustment or ledger entry.
- Declining records the decision without changing the strategy.
- Manual override never changes the strategy.
- Insufficient data and safety flags cannot be bypassed by the client.
- Previous and proposed targets remain visible in decision history.
- The UI explains confidence and missing data.
- All existing fitness regression tests continue to pass.

## Automated test matrix

### Domain tests

- Every supported goal with losing, flat, and gaining weight trends.
- Low adherence, missing days, duplicate dates, and out-of-order logs.
- Safety flags, poor recovery, and strength decline.
- Calorie and step boundary values.
- Same-period proposal determinism.

### Backend tests

- Unauthenticated prepare and apply requests are rejected.
- A user cannot read or apply another user's proposal.
- Applying twice returns one applied result and one ledger entry.
- Strategy-version mismatch returns a conflict without overwriting newer targets.
- Failure between strategy update and final status can be repaired by retry.

### Browser tests

- Review, close, and reopen without a target change.
- Apply, keep current, and customize paths.
- Manual override and insufficient-data presentation.
- Keyboard focus and accessible status announcements.
- Mobile bottom-sheet layout.

## Base44 test matrix

Use disposable test users with seeded scenarios:

1. Fewer than 14 days of data.
2. High-adherence fat-loss plateau.
3. Low-adherence plateau.
4. Recomposition with falling waist and flat weight.
5. Gain goal with falling weight.
6. Safety flag present.
7. Manual targets enabled.
8. Two browser tabs applying the same proposal.
9. Simulated request interruption followed by retry.

For each scenario, verify `WeeklyCheckIn`, `CurrentStrategy`, and `DecisionLedger` records in Base44 as well as the visible UI.

## Implementation slices

1. Add entity fields and pure proposal serialization tests.
2. Split the current client operation into prepare and apply interfaces.
3. Add the review and comparison UI without enabling application.
4. Add the idempotent Base44 apply function.
5. Enable apply/decline actions and decision-history linking.
6. Add deployed concurrent-tab and retry tests.

Each slice should be independently deployable to the Base44 test environment and keep the prior flow available behind a temporary feature flag until the apply path passes the deployment matrix.
