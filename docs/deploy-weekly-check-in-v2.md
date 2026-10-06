# Deploy checklist: Weekly Check-In v2 (PR #180, `3886a9a`)

Merging only synced the code. Base44 publishes from the dashboard. Do this after the Phases 1–5 deploy (`docs/deploy-1-5.md`), top to bottom, because the order matters. Background: `docs/features/weekly-check-in-v2.md`.

## Before publishing
- [ ] **Finish the Phases 1–5 deploy first.**
- [ ] **Find out where Base44 sets build variables.** `VITE_ENABLE_WEEKLY_CHECK_IN_V2` is read when the app is built, so turning it on or off means a new frontend build, not a runtime switch. If Base44 can't set it separately for the test and production environments, stop here: steps 4 and 5 depend on it.
- [ ] **Know the rollback point.** Note the current live version in the Base44 dashboard.

## 1. Entities (first)
- [ ] **`WeeklyCheckIn`:** new fields `period_key`, `status`, `user_decision`, `previous_targets`, `supporting_metrics`, `confidence`, `decision_reason`, `rule_version`, `applied_at`.
- [ ] **`DecisionLedger`:** new field `weekly_check_in_id`.
- [ ] **No migration needed.** Both changes only add fields, so existing rows stay valid.

## 2. Backend function
- [ ] **Publish `decideWeeklyCheckIn`** with its shared modules:
  - `weeklyCheckInDomain.js`, `weeklyCheckInPersistence.js`
  - `fitnessAdherence.js`, `fitnessTrends.js`, `fitnessAdjustments.js`
  - `ownerScope.js`, `httpUtils.js`

## 3. Frontend, flag off
- [ ] **Publish the web app without the flag.** Users should see no change.
- [ ] **Check the old check-in still works:** More → Weekly check-in runs as before. The engine files moved into `base44/shared`, so this is the regression check.

## 4. Test environment, flag on
- [ ] **Build with `VITE_ENABLE_WEEKLY_CHECK_IN_V2=true`.**
- [ ] **Run each scenario with a throwaway user,** and check the `WeeklyCheckIn`, `CurrentStrategy` and `DecisionLedger` rows.

| # | Setup | Expected |
|---|---|---|
| 1 | Under 14 days of logs | "Keep collecting data", confidence Low, no Apply button. Keep → check-in `acknowledged`, no target change |
| 2 | Fat loss, weight flat for 2+ weeks, adherence ≥80% | "Reduce calories" −150, or +1,500 steps if sedentary and under 8,000 steps. Apply → targets change once, check-in `applied`, one ledger entry linked to it |
| 3 | Same plateau, adherence under 80% | "Focus on adherence": only the weekly focus changes, button reads "Apply new weekly focus" |
| 4 | Recomp goal, waist down, weight flat | "Keep plan possible recomp", no changes |
| 5 | Gain goal, weight falling | "Increase calories" +150 |
| 6 | Safety flag set | Professional-guidance message, no Apply |
| 7 | Manual targets on | "Advice only" note, no Apply. Keep → `declined`, targets unchanged |
| 8 | Two tabs, both press Apply | One `applied` check-in, one ledger entry, calories changed once. If the second tab presses Keep within a minute, it's told the check-in is being applied |
| 9 | Airplane mode right after pressing Apply, then retry | One adjustment total. The retry finishes the same check-in |

- [ ] **Open and close without deciding:** no new rows are written.
- [ ] **After deciding:** reopening shows the recorded decision, and Decision history shows the before and after targets.

## 5. Production
- [ ] **Settle the open rules first:** the 1,500 kcal minimum and carbs-first macro rebalancing (`base44/shared/fitnessAdjustments.js`). If either changes, bump `WEEKLY_CHECK_IN_RULE_VERSION` before enabling.
- [ ] **Rebuild production with the flag on.**
- [ ] **Run scenario 2 on your own account** and confirm the rows.
- [ ] **Remove the old check-in path** after at least one full week on v2.

## Rollback
- [ ] **Rebuild with the flag off.** The old check-in comes straight back.
- [ ] **No data cleanup needed.** v2's rows are compatible with the old flow, which ignores the new fields. The "Last check-in" row skips rows that are still applying or were superseded.

## Not covered here
Spec slice 6, automated tests against the deployed app for two tabs and retries, isn't built. Scenarios 8 and 9 cover the same cases by hand.
