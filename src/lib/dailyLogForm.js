// Pure helpers for the Quick Log sheet: client-side validation that mirrors
// the server's daily-log rules, and building the patch sent to
// upsertTrackingRecord. Kept free of React and path aliases so Node tests can
// import it directly.
import {
  DAILY_LOG_NUMBER_RANGES,
  DAILY_LOG_STRING_LIMITS
} from "../../base44/shared/trackingRecordDomain.js";

export { DAILY_LOG_NUMBER_RANGES };

const isEmpty = (value) => value === "" || value === null || value === undefined;

/** Form value -> number, or null when the input is empty. */
export function formNumber(value) {
  if (isEmpty(value)) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return Number(value);
}

/**
 * Validate the given form keys against the server's daily-log ranges.
 * Empty values are always valid (they mean "not logged").
 *
 * @param {Record<string, unknown>} form
 * @param {readonly string[]} keys
 * @returns {Record<string, string>} field -> message; empty when valid
 */
export function validateDailyLogForm(form, keys) {
  /** @type {Record<string, string>} */
  const errors = {};
  for (const key of keys) {
    const range = DAILY_LOG_NUMBER_RANGES[key];
    if (range) {
      const value = formNumber(form[key]);
      if (value === null) continue;
      if (!Number.isFinite(value)) {
        errors[key] = "Enter a number";
      } else if (value < range.min || value > range.max) {
        errors[key] = `Enter a value from ${range.min.toLocaleString("en-US")} to ${range.max.toLocaleString("en-US")}`;
      }
      continue;
    }
    const limit = DAILY_LOG_STRING_LIMITS[key];
    if (limit && typeof form[key] === "string" && form[key].length > limit) {
      errors[key] = `Keep this under ${limit.toLocaleString("en-US")} characters`;
    }
  }
  return errors;
}

/**
 * Build the `fields` patch for the given form keys.
 *
 * - A filled field sends its value.
 * - A field the user emptied sends explicit null, but only when the existing
 *   log has a value for it: the server unsets a field only on null, and a
 *   null for an already-empty field would be a noisy no-op write.
 * - `workout_completed` sends true, or false only to clear a stored true.
 *
 * Returns an empty object when there is nothing to save.
 *
 * @param {Record<string, unknown>} form
 * @param {Record<string, unknown> | null | undefined} previous the current log for the date
 * @param {readonly string[]} keys
 */
export function buildDailyLogPatch(form, previous, keys) {
  const hadValue = (key) => previous?.[key] !== undefined && previous?.[key] !== null;
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (const key of keys) {
    if (key === "workout_completed") {
      if (form[key]) fields[key] = true;
      else if (previous?.[key] === true) fields[key] = false;
      continue;
    }
    if (key in DAILY_LOG_NUMBER_RANGES) {
      const value = formNumber(form[key]);
      if (value !== null) fields[key] = value;
      else if (hadValue(key)) fields[key] = null;
      continue;
    }
    // Free-text fields (notes).
    const text = typeof form[key] === "string" ? form[key] : "";
    if (text !== "") fields[key] = text;
    else if (hadValue(key) && previous[key] !== "") fields[key] = null;
  }
  return fields;
}
