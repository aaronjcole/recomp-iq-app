/**
 * Local-date utilities for historical logging.
 *
 * All dates are handled as local YYYY-MM-DD strings to avoid UTC date-shift
 * issues. No Date objects are returned — only strings — so they are safe to
 * use as object keys, URL params, and entity field values.
 */

export function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Validates a YYYY-MM-DD string: correct format, real calendar date, and not
 * in the future.
 */
export function isValidLocalDate(str) {
  if (typeof str !== "string") return false;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Construct at local midnight to detect impossible dates (e.g. Feb 30).
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  // Reject future dates
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (date > now) return false;
  return true;
}

/**
 * Returns the value if it is a valid local date, otherwise today.
 */
export function sanitizeDateParam(value) {
  return isValidLocalDate(value) ? value : todayStr();
}

/**
 * Adds (or subtracts) n days from a YYYY-MM-DD string, returning a new
 * YYYY-MM-DD string. Handles month and year boundaries.
 */
export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatLongDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

export function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

/**
 * Computes the daily-log marker effects when a training session is moved from
 * oldDate to newDate. Returns null when the date is unchanged.
 *
 * @param {string} oldDate - The session's previous date (YYYY-MM-DD).
 * @param {string} newDate - The session's new date (YYYY-MM-DD).
 * @param {Array} remainingSessions - Sessions EXCLUDING the one being moved.
 * @returns {{ oldDate: string, newDate: string, shouldClearOld: boolean } | null}
 */
export function computeSessionDateMoveEffects(oldDate, newDate, remainingSessions) {
  if (!oldDate || !newDate || oldDate === newDate) return null;
  const sessionsOnOldDate = (remainingSessions ?? []).filter(
    (s) => s && s.date === oldDate
  );
  return {
    oldDate,
    newDate,
    shouldClearOld: sessionsOnOldDate.length === 0
  };
}