import { LIFESTYLE_COACH_ENABLED } from "../../base44/shared/lifestyleCoachDomain.js";

export function enabledFromEnvironment(value) {
  return value === "true";
}

export const featureFlags = Object.freeze({
  // Food-photo analysis uploads a sensitive image for AI inference. Keep the
  // entry point hidden until the deployed environment has accepted that data
  // flow and explicitly enables it.
  foodPhotoScan: enabledFromEnvironment(
    import.meta.env?.VITE_ENABLE_FOOD_PHOTO_SCAN
  ),
  // Disabled unless explicitly enabled in a trusted build environment. A future
  // paid entitlement should replace this build-time gate without weakening it.
  bodyCompositionScan: enabledFromEnvironment(
    import.meta.env?.VITE_ENABLE_BODY_COMPOSITION_SCAN
  ),
  // Crash + minimal funnel telemetry. Off by default; network delivery also
  // requires VITE_TELEMETRY_ENDPOINT, so nothing leaves the device until the
  // deployment has opted in and declared it (Play Data Safety).
  telemetry: enabledFromEnvironment(import.meta.env?.VITE_ENABLE_TELEMETRY),
  // Itemized meals add a more granular nutrition record than the legacy daily
  // totals. Enabled so users can browse and edit individual foods logged on
  // any past day (like MyFitnessPal). Daily totals stay in sync automatically
  // via adjustDailyNutrition whenever an entry is added, edited, or deleted.
  itemizedFoodDiary: true,
  // The Lifestyle Coach is under active development. Keep the entry point locked
  // behind a "coming soon" state until the experience is ready to ship. This is
  // independent of the premium entitlement — paying users still unlock the rest
  // of the premium bundle; this flag only controls whether the coach UI is usable.
  // It is the same constant the lifestyleCoachReply function checks server side
  // (base44/shared/lifestyleCoachDomain.js), so the UI and backend cannot drift.
  lifestyleCoach: LIFESTYLE_COACH_ENABLED,
  // Weekly Check-In v2: review a proposal before any target changes, applied
  // once by the decideWeeklyCheckIn function. Off until the apply path passes
  // the Base44 test matrix (docs/features/weekly-check-in-v2.md); the original
  // one-click check-in stays in place until then.
  weeklyCheckInV2: enabledFromEnvironment(import.meta.env?.VITE_ENABLE_WEEKLY_CHECK_IN_V2)
});