export const HAPTIC_IMPACTS = Object.freeze({
  LIGHT: "light",
  MEDIUM: "medium",
  HEAVY: "heavy",
  SUCCESS: "success"
});

export const HAPTIC_TRIGGERS = Object.freeze({
  LOG_SAVED: HAPTIC_IMPACTS.SUCCESS,
  HABIT_COMPLETED: HAPTIC_IMPACTS.SUCCESS,
  WEEKLY_CHECK_IN_SUBMITTED: HAPTIC_IMPACTS.SUCCESS
});

// Web intentionally does nothing. The Expo branch can replace this body with
// expo-haptics while every component keeps the same call site.
export function triggerHaptic(trigger) {
  if (!trigger || typeof navigator === "undefined") return false;
  return false;
}