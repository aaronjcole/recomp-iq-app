// Per-user rate limit for AiContentReport submissions. Plain JS with the
// entity accessor injected, so the decision logic runs and is tested in Node.
//
// Reports spend no paid inference, so they are limited on their own rows
// instead of drawing on the CoachRequestUsage AI quotas. The method is the
// same rank-after-insert used there (see coachRateLimitDomain.js).

export const AI_REPORT_HOURLY_LIMIT = 10;
export const AI_REPORT_WINDOW_MS = 60 * 60 * 1000;
// Newest-first page read back after inserting. Larger than the limit so a
// burst of parallel inserts newer than ours still leaves the rows ahead of it
// on the page; when it cannot, the ranking fails closed.
export const AI_REPORT_RANK_PAGE_SIZE = AI_REPORT_HOURLY_LIMIT * 5;

function parseTime(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Decide whether report row `ownId` is inside the hourly limit, given the
 * owner's reports listed newest created_date first AFTER it was inserted.
 *
 * The window is measured back from our row's server-assigned created_date, so
 * no function clock is involved. Rows ranked ahead of ours are those created
 * in that window at or before it; a tie counts as ahead (two same-millisecond
 * inserts may each miss the other) and an undated row counts as ahead (fail
 * closed). Allowed only when fewer than `limit` rows rank ahead.
 *
 * `truncated` says the list hit its page size, so older rows may be cut off.
 * If the oldest returned row is still inside the window, rows ahead of ours
 * may be hidden and the report is denied.
 *
 * @returns {{ allowed: boolean, reason: null | "hourly" | "reservation" }}
 */
export function rankAiReport(
  rows,
  ownId,
  { limit = AI_REPORT_HOURLY_LIMIT, windowMs = AI_REPORT_WINDOW_MS, truncated = false } = {}
) {
  if (!Number.isInteger(limit) || limit < 1 || typeof ownId !== "string" || ownId === "") {
    return { allowed: false, reason: "reservation" };
  }
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.id === "string" && row.id !== "")
    .map((row) => ({ id: row.id, createdAt: parseTime(row.created_date) }));
  const own = list.find((row) => row.id === ownId);
  // A full newest-first page without our row means a flood of newer rows.
  if (!own) return { allowed: false, reason: truncated ? "hourly" : "reservation" };
  if (own.createdAt === null) return { allowed: false, reason: "reservation" };

  const windowStart = own.createdAt - windowMs;
  const ahead = list.filter((row) => (
    row.id !== ownId &&
    (row.createdAt === null || (row.createdAt <= own.createdAt && row.createdAt >= windowStart))
  ));
  if (ahead.length >= limit) return { allowed: false, reason: "hourly" };

  if (truncated) {
    const oldest = Math.min(...list.map((row) => row.createdAt ?? Number.NEGATIVE_INFINITY));
    if (oldest >= windowStart) return { allowed: false, reason: "hourly" };
  }
  return { allowed: true, reason: null };
}

/**
 * Create a report and keep it only if it fits the owner's hourly limit.
 *
 * `reports` is the service-role AiContentReport entity accessor; `data` is the
 * full row to create (must include owner_id).
 *
 * Concurrency: the report is inserted first, then the owner's reports are
 * listed. If request A's list misses B's row, B became visible after A's
 * insert, so B's server-assigned created_date is the same or later than A's
 * and B's own list sees A. Rows strictly earlier than ours are always seen,
 * and ties count against each other both ways, so of any `limit + 1` reports
 * in one window the one created last (or any of those tied for last) sees at
 * least `limit` ahead of it: at most `limit` are kept however many run in
 * parallel. A rejected report is deleted, so it does not count against later
 * requests.
 *
 * @returns {Promise<{ allowed: boolean, reason: null | "hourly" | "reservation", report: object | null }>}
 */
export async function createRateLimitedAiReport(reports, data, options = {}) {
  const report = await reports.create(data);
  const ownId = typeof report?.id === "string" ? report.id : "";
  if (!ownId) return { allowed: false, reason: "reservation", report: null };

  let rank;
  try {
    const rows = await reports.filter(
      { owner_id: data.owner_id },
      "-created_date",
      AI_REPORT_RANK_PAGE_SIZE
    );
    rank = rankAiReport(rows, ownId, {
      ...options,
      truncated: Array.isArray(rows) && rows.length >= AI_REPORT_RANK_PAGE_SIZE
    });
  } catch (error) {
    // The report cannot be ranked; remove it rather than exceed the limit.
    await reports.delete(ownId);
    throw error;
  }
  if (!rank.allowed) {
    await reports.delete(ownId);
    return { ...rank, report: null };
  }
  return { ...rank, report };
}
