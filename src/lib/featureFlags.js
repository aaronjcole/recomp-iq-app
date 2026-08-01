export function enabledFromEnvironment(value) {
  return value === "true";
}

export const featureFlags = Object.freeze({
  // Disabled unless explicitly enabled in a trusted build environment. A future
  // paid entitlement should replace this build-time gate without weakening it.
  bodyCompositionScan: enabledFromEnvironment(
    import.meta.env?.VITE_ENABLE_BODY_COMPOSITION_SCAN
  )
});
