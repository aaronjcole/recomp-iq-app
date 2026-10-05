# Deploy checklist: remediation Phases 1–5 (PR #172, `921fa4f`)

Base44 publishes from the dashboard, and merging only synced the code. Work top to bottom, because the order matters.

## Before publishing
- [ ] **Know the rollback point.** Note the current live version in the Base44 dashboard.
- [ ] **Check the Apple secrets are still set:** `APPLE_BUNDLE_ID`, `APPLE_PRIVATE_KEY`, `APPLE_ISSUER_ID`, `APPLE_KEY_ID`.
- [ ] **Decide on `PREMIUM_TESTER_EMAILS`.** Testers listed there now get working Premium on every endpoint, not only the Premium UI. Trim the list if needed.

## 1. Entities (first)
- [ ] **FoodLogEntry:** the `source` enum now includes `"search"`.
- [ ] **New `AnalysisUpload` entity:** only admins can write it; users can read their own rows.

## 2. Backend functions
- [ ] **Publish these first:**
  - `uploadAnalysisPhoto` (new)
  - `upsertTrackingRecord` (adds nutrition `increments`)
- [ ] **Then publish the rest:**
  - `analyzeFoodPhoto`, `analyzeBodyComposition`
  - `appleStoreNotification`, `verifyApplePurchase`
  - `deleteAccount`, `ensureDefaultHabits`
  - `coachReply`, `lifestyleCoachReply`, `reportAiContent`, `recordReferralSignup`
  - `getPremiumAccess`, `generateAdaptiveMealPlan`, `generateAdaptiveTrainingBlock`, `generateWeeklyAutopilot`, `swapAdaptiveMeal`
  - the shared modules they import

## 3. Frontend
- [ ] **Publish the web app.**
- [ ] **Never publish the frontend before step 2.** The old `upsertTrackingRecord` rejects the new increment requests, so every food log would fail.
- [ ] **Never publish the photo-analysis functions without the frontend.** They return 403 for photos uploaded the old way.

## 4. Check right after publishing
- [ ] **Food logging:** log a food from search. It should appear in the diary and the day's total should go up by the right amount.
- [ ] **Photo analysis:** run one real food-photo scan. This confirms Base44 accepts the photo upload (about 10 MB max).
- [ ] **Apple notifications:** in App Store Connect, use **Request a Test Notification**. The `appleStoreNotification` logs should show a 200, not a 401.
- [ ] **Admin login:** if your login is an admin, Today should show only your own data.
- [ ] **Account deletion:** delete a throwaway test account and confirm its rows are gone, including food diary, referrals and `AnalysisUpload`.

## 5. Before the App Store launch
- [ ] **Set `APPLE_SANDBOX_ALLOWED_USER_IDS`** to your testers' Base44 user ids plus the App Review demo account's id. Until it's set, every sandbox purchase still grants Premium, with a warning in the logs.
- [ ] **Make decisions on:**
  - whether Mediterranean meal plans should allow poultry;
  - whether the 7-day referral window is right;
  - the "30% off" referral copy, which nothing implements.

## 6. New iOS build (EAS)
- [ ] **Build and submit a new binary.** The sign-in, StoreKit, bridge and WebView changes are native code, so an over-the-air update won't deliver them.
- [ ] **Run the device checks in `docs/release-checklist.md`:**
  - Google and Apple sign-in through the system sheet, and cancelling it;
  - the paywall's local currency, and the trial on a fresh sandbox Apple ID;
  - an Ask to Buy purchase releasing within about 30 s;
  - the barcode camera preview;
  - the "Try again" screen after an offline launch.

## Known one-way effects
- **Old photos** have no `AnalysisUpload` record, so they can't be re-analysed; users have to add them again.
- **Referrals** from accounts older than 7 days are no longer attributed.
