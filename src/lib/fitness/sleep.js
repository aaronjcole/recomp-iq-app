import {
  average,
  dedupeLogsByDate,
  logsInCalendarWindow,
  normalizeDateKey
} from "./trends.js";

export const ADULT_SLEEP_REFERENCE_HOURS = 7;
export const SLEEP_LOOKBACK_DAYS = 14;

function rounded(value) {
  return Number(value.toFixed(1));
}

/**
 * Summarize only sleep the user explicitly logged. Missing nights remain
 * missing rather than being treated as zero, and the balance is a transparent
 * comparison with a general adult reference—not a personalized sleep-need or
 * circadian estimate.
 */
export function summarizeSleep(logs, options = {}) {
  const deduped = dedupeLogsByDate(logs);
  const referenceDate = normalizeDateKey(options.referenceDate) ?? deduped.at(-1)?.date ?? null;
  const referenceHours = Number.isFinite(options.referenceHours)
    ? Math.max(0, options.referenceHours)
    : ADULT_SLEEP_REFERENCE_HOURS;
  const windowDays = Number.isFinite(options.windowDays) && options.windowDays > 0
    ? Math.max(1, Math.floor(options.windowDays))
    : SLEEP_LOOKBACK_DAYS;
  const windowLogs = referenceDate
    ? logsInCalendarWindow(deduped, referenceDate, windowDays)
    : [];
  const sleepLogs = windowLogs.filter(
    (log) => typeof log.sleep_hours === "number" && Number.isFinite(log.sleep_hours)
  );
  const qualityAverage = average(windowLogs.map((log) => log.sleep_quality));
  const hoursAverage = average(sleepLogs.map((log) => log.sleep_hours));
  const balance = sleepLogs.reduce(
    (total, log) => total + log.sleep_hours - referenceHours,
    0
  );

  return {
    windowDays,
    referenceHours,
    loggedNights: sleepLogs.length,
    averageHours: hoursAverage === null ? null : rounded(hoursAverage),
    averageQuality: qualityAverage === null ? null : rounded(qualityAverage),
    balanceHours: sleepLogs.length === 0 ? null : rounded(balance),
    shortNights: sleepLogs.filter((log) => log.sleep_hours < referenceHours).length
  };
}
