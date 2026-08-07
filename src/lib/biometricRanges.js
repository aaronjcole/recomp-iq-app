// Accepted bounds for the biometric fields collected during onboarding and
// editable afterwards in Profile. Both surfaces read them from here so they
// cannot drift: the Profile editor originally shipped with no checks at all, so
// clearing the weight field saved 0 lb and produced a 0 g protein target.
//
// Values are stored in imperial units (lb / in) regardless of the unit toggle.

export const BIOMETRIC_RANGES = {
  age: [18, 120],
  height_in: [36, 108],
  current_weight_lbs: [40, 1200],
  goal_weight_lbs: [40, 1200],
  waist_in: [10, 150],
  average_steps: [0, 200000],
  training_days_per_week: [0, 7],
  cardio_days_per_week: [0, 7]
};

/** True when value is a finite number within [min, max]. Blank is never valid. */
export function inRange(value, min, max) {
  if (value === "" || value == null) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

/** Range check for a known biometric field. Unknown fields are not constrained. */
export function inBiometricRange(field, value) {
  const bounds = BIOMETRIC_RANGES[field];
  if (!bounds) return true;
  return inRange(value, bounds[0], bounds[1]);
}

/**
 * Range check for a field the user may legitimately leave blank. A blank value
 * passes; a filled one must still land inside the range.
 */
export function optionalInBiometricRange(field, value) {
  if (value === "" || value == null) return true;
  return inBiometricRange(field, value);
}
