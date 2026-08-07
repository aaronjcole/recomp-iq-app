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
  telemetry: enabledFromEnvironment(import.meta.env?.VITE_ENABLE_TELEMETRY)
});
