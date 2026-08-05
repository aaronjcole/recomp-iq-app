// Height is stored in inches, but onboarding lets the user enter it in either
// unit. One inch spans 2.54 cm, so storing whole inches cannot represent every
// centimetre: rounding metric entry to whole inches made 43 of the 71 values
// between 140-210 cm redisplay 1 cm off (type 177, see 178). Storing tenths of
// an inch makes the conversion self-inverting across the whole input range.

export const CM_PER_INCH = 2.54;

/** Convert a centimetre entry into the value stored in height_in. */
export function cmToStoredInches(cm) {
  return +(Number(cm) / CM_PER_INCH).toFixed(1);
}

/** Convert a stored height_in back to whole centimetres for display. */
export function storedInchesToCm(heightIn) {
  return Math.round(Number(heightIn) * CM_PER_INCH);
}

/**
 * Split a stored height into feet and inches.
 *
 * Rounds to whole inches *before* dividing. Splitting first and rounding the
 * remainder (`Math.round(x % 12)`) yields an inch value of 12 for heights like
 * 71.7, rendering "5 ft 12 in".
 */
export function splitFeetInches(heightIn) {
  const total = Math.round(Number(heightIn));
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

/** Recombine a feet/inches selection into a stored height. */
export function feetInchesToStored(ft, inch) {
  return Number(ft) * 12 + Number(inch);
}
