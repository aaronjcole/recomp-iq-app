// Progress through an adaptive training block. A block repeats one weekly
// schedule for block_length_weeks weeks, so a completion is identified by
// (week, day_index), not day_index alone: keyed by day only, each schedule day
// could be completed once per block and progress stalled after week one.

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDate) {
  if (typeof isoDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const time = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

export function parseCompletedSessions(json) {
  try {
    const parsed = JSON.parse(json ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Block week (1-based, clamped to the block) that `date` falls in. */
export function blockWeekFor(weekStart, blockWeeks, date) {
  const start = dayNumber(weekStart);
  const day = dayNumber(date);
  const weeks = Math.max(1, Number(blockWeeks) || 1);
  if (start === null || day === null) return 1;
  const week = Math.floor((day - start) / 7) + 1;
  return Math.min(weeks, Math.max(1, week));
}

// Entries saved before completions carried a week are placed by their
// completed_date, so existing progress keeps counting.
function completionWeek(entry, weekStart, blockWeeks) {
  const stored = Number(entry?.week);
  if (Number.isInteger(stored) && stored >= 1) return Math.min(Math.max(1, Number(blockWeeks) || 1), stored);
  return blockWeekFor(weekStart, blockWeeks, entry?.completed_date);
}

export function isSessionCompleted(completed, { weekStart, blockWeeks, week, dayIndex }) {
  return completed.some((entry) =>
    entry?.day_index === dayIndex && completionWeek(entry, weekStart, blockWeeks) === week
  );
}

/**
 * Summary for the block card: the current block week, which schedule days are
 * done this week, the next one to do, and progress across the whole block.
 */
export function blockProgress({ completed, weekStart, blockWeeks, scheduleLength, today }) {
  const weeks = Math.max(1, Number(blockWeeks) || 1);
  const week = blockWeekFor(weekStart, weeks, today);
  const doneThisWeek = new Set(
    completed
      .filter((entry) => completionWeek(entry, weekStart, weeks) === week)
      .map((entry) => entry?.day_index)
  );
  let nextDayIndex = null;
  for (let index = 0; index < scheduleLength; index += 1) {
    if (!doneThisWeek.has(index)) {
      nextDayIndex = index;
      break;
    }
  }
  const unique = new Set(
    completed
      .filter((entry) => Number.isInteger(entry?.day_index) && entry.day_index < scheduleLength)
      .map((entry) => `${completionWeek(entry, weekStart, weeks)}:${entry.day_index}`)
  );
  const totalSessions = scheduleLength * weeks;
  return {
    week,
    blockWeeks: weeks,
    doneThisWeek,
    nextDayIndex,
    completedCount: Math.min(unique.size, totalSessions),
    totalSessions
  };
}

/** Completion list with this session added, or null if it is already done. */
export function withCompletedSession(completed, { weekStart, blockWeeks, dayIndex, sessionId, date }) {
  const week = blockWeekFor(weekStart, blockWeeks, date);
  if (isSessionCompleted(completed, { weekStart, blockWeeks, week, dayIndex })) return null;
  return [...completed, { week, day_index: dayIndex, session_id: sessionId, completed_date: date }];
}
