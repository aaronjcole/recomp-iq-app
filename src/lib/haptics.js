export const HAPTIC_IMPACTS = Object.freeze({
  LIGHT: "light",
  MEDIUM: "medium",
  HEAVY: "heavy",
  SUCCESS: "success"
});

export const HAPTIC_TRIGGERS = Object.freeze({
  MEAL_LOGGED: HAPTIC_IMPACTS.LIGHT,
  SET_COMPLETED: HAPTIC_IMPACTS.LIGHT,
  LOG_SAVED: HAPTIC_IMPACTS.LIGHT,
  WORKOUT_SAVED: HAPTIC_IMPACTS.SUCCESS,
  HABIT_COMPLETED: HAPTIC_IMPACTS.SUCCESS,
  WEEKLY_CHECK_IN_SUBMITTED: HAPTIC_IMPACTS.SUCCESS
});

// Vibration patterns (ms). The Vibration API is available on Android Chrome
// and other Android browsers; iOS Safari silently ignores it. The Expo
// branch can replace this body with expo-haptics while every component
// keeps the same call site.
const VIBRATION_PATTERNS = {
  [HAPTIC_IMPACTS.LIGHT]: 10,
  [HAPTIC_IMPACTS.MEDIUM]: 20,
  [HAPTIC_IMPACTS.HEAVY]: 40,
  [HAPTIC_IMPACTS.SUCCESS]: [10, 30, 10]
};

export function triggerHaptic(trigger) {
  if (!trigger || typeof navigator === "undefined" || !navigator.vibrate) return false;
  return navigator.vibrate(VIBRATION_PATTERNS[trigger] ?? 10);
}