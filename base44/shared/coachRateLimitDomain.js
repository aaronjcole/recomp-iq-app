// Shared per-user quotas for every backend function that spends paid LLM
// credits. Reservations live in the CoachRequestUsage entity so the limit is
// enforced across stateless function instances instead of in process memory.

export const COACH_HOURLY_LIMIT = 10;
export const COACH_DAILY_LIMIT = 40;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Rows older than the daily window are pruned only after this extra margin, so
// a function instance whose clock runs ahead of another's can never delete a
// row that the slower instance still counts inside its window.
const PRUNE_MARGIN_MS = HOUR_MS;

// Feature keys partition the reservation pool so one expensive feature cannot
// drain another feature's allowance. Both coach surfaces deliberately share
// the "coach" key: they answer the same conversational request and have always
// drawn from one bucket.
export const AI_QUOTA_FEATURES = {
  COACH: "coach",
  MEAL_PLAN_AI_VARIETY: "meal_plan_ai_variety",
  BODY_COMPOSITION: "body_composition",
  FOOD_PHOTO: "food_photo"
};

export const COACH_QUOTA = {
  hourly: COACH_HOURLY_LIMIT,
  daily: COACH_DAILY_LIMIT
};

// Every quota is sized well above heavy legitimate use of a user-initiated
// action and only tight enough to stop an automated abuse loop.
export const AI_FEATURE_QUOTAS = {
  // A meal plan covers a whole week. Regenerating a few times to land on a
  // rotation the user likes is normal; 15 full-week generations a day is not.
  [AI_QUOTA_FEATURES.MEAL_PLAN_AI_VARIETY]: { hourly: 5, daily: 15 },
  // Three-photo vision call, the most expensive request in the app. Progress
  // photos are a weekly ritual, so this only needs to cover retries for bad
  // lighting or framing.
  [AI_QUOTA_FEATURES.BODY_COMPOSITION]: { hourly: 4, daily: 10 },
  // Per-meal logging: a heavy day is a handful of meals plus retries and
  // plate-by-plate captures, so the ceiling stays high but bounded.
  [AI_QUOTA_FEATURES.FOOD_PHOTO]: { hourly: 20, daily: 60 },
  [AI_QUOTA_FEATURES.COACH]: COACH_QUOTA
};

function normalizeLimits(limits) {
  const hourly = Number(limits?.hourly);
  const daily = Number(limits?.daily);
  if (!Number.isInteger(hourly) || hourly < 1) return null;
  if (!Number.isInteger(daily) || daily < 1) return null;
  return { hourly, daily };
}

function parseTime(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

// Whether `row` is counted ahead of `own`. Ordering uses the server-assigned
// created_date, which every concurrent request sees identically. A tie is
// counted ahead on BOTH sides rather than broken by id: two rows created in the
// same millisecond may each miss the other's insert, and an id tie-break would
// then let both rank themselves inside the limit. Counting ties both ways can
// only reject more, never admit more. A row without a usable created_date is
// counted ahead of everyone (fail closed) rather than skipped.
function ranksAhead(row, own) {
  if (row.id === own.id) return false;
  if (row.createdAt === null) return true;
  return row.createdAt <= own.createdAt;
}

/**
 * Decide whether the reservation row `ownId` is inside the hourly and daily
 * limits, given the rows a list returned AFTER that row was written.
 *
 * Rows are ranked by the server-assigned `created_date`, never by a
 * function-computed timestamp, and the request is allowed only when fewer
 * than `limit` rows rank ahead of it in each window (ties count as ahead).
 * `requested_at` only decides window membership; it has no upper bound,
 * because a concurrent row from an instance whose clock runs ahead must still
 * be counted.
 *
 * `truncated` says the list hit its page size, so rows sorted after the last
 * returned one may exist. Anything unexpected - unusable limits, a missing or
 * undated own row, a page that may hide rows tied with it - denies the
 * request so callers fail closed.
 *
 * @param {Array<object>} rows - CoachRequestUsage records for one owner and feature.
 * @param {string} ownId - Server id of this request's reservation row.
 * @param {{ hourly: number, daily: number }} limits - Window ceilings.
 * @param {{ now?: number, truncated?: boolean }} [options]
 * @returns {{ allowed: boolean, reason: null | "hourly" | "daily" | "reservation" }}
 */
export function rankReservation(rows, ownId, limits, { now = Date.now(), truncated = false } = {}) {
  const resolved = normalizeLimits(limits);
  if (!resolved || typeof ownId !== "string" || ownId === "") {
    return { allowed: false, reason: "reservation" };
  }

  const dayStart = now - DAY_MS;
  const hourStart = now - HOUR_MS;
  const usage = (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.id === "string" && row.id !== "")
    .map((row) => ({
      id: row.id,
      createdAt: parseTime(row.created_date),
      // An unparsable requested_at cannot be placed in a window, so it is
      // treated as current and counted in both (fail closed).
      requestedAt: parseTime(row.requested_at) ?? now
    }))
    .filter((row) => row.requestedAt >= dayStart);

  const own = usage.find((row) => row.id === ownId);
  if (!own) {
    // A full page sorted by created_date that does not include our row means
    // at least page-size (> daily) rows rank ahead of it.
    return { allowed: false, reason: truncated ? "daily" : "reservation" };
  }
  if (own.createdAt === null) return { allowed: false, reason: "reservation" };

  // On a full page, rows the server sorted after the last returned one were
  // cut off. If none of those can tie with ours, every row ranked ahead of
  // ours is on the page; otherwise fail closed.
  const latest = Math.max(...usage.map((row) => row.createdAt ?? Number.NEGATIVE_INFINITY));
  if (truncated && latest <= own.createdAt) {
    return { allowed: false, reason: "daily" };
  }

  const ahead = usage.filter((row) => ranksAhead(row, own));
  if (ahead.length >= resolved.daily) {
    return { allowed: false, reason: "daily" };
  }
  if (ahead.filter((row) => row.requestedAt >= hourStart).length >= resolved.hourly) {
    return { allowed: false, reason: "hourly" };
  }
  return { allowed: true, reason: null };
}

/** Retry-After seconds for a rejected quota, as a header-ready string. */
export function quotaRetryAfterSeconds(reason) {
  return reason === "daily" ? "86400" : "3600";
}

/**
 * Reserve one paid request for a feature and report whether it fits the quota.
 *
 * `usage` is the service-role CoachRequestUsage entity accessor, injected by
 * the caller so this module never imports the SDK.
 *
 * Concurrency: the reservation row is written first and only then are the
 * window's rows listed, oldest created_date first. A request whose list does
 * not yet show another request's row finished its own insert before that row
 * became visible, so the other row's server-assigned created_date is the same
 * or later. Rows strictly earlier are therefore always seen, and same-instant
 * rows count against each other both ways, so of any `limit + 1` requests the
 * one that listed last sees the other `limit` ahead of it: at most `limit` are
 * allowed however many run in parallel. A rejected reservation is deleted so
 * a throttled request does not consume the allowance; an allowed one is kept
 * even if the paid call later fails.
 *
 * @param {object} usage - Service-role CoachRequestUsage entity accessor.
 * @param {string} ownerId - Authenticated account identifier.
 * @param {string} feature - One of AI_QUOTA_FEATURES.
 * @param {{ hourly: number, daily: number }} limits - Window ceilings.
 * @param {number} [now] - Injectable clock for tests.
 */
export async function reserveFeatureRequest(usage, ownerId, feature, limits, now = Date.now()) {
  const resolved = normalizeLimits(limits);
  if (!resolved) return { allowed: false, reason: "reservation" };

  const dayCutoff = new Date(now - DAY_MS).toISOString();

  // Pruning ignores the feature key so expired rows from every feature, and
  // from reservations written before feature keys existed, are cleaned up.
  await usage.deleteMany({
    owner_id: ownerId,
    requested_at: { $lt: new Date(now - DAY_MS - PRUNE_MARGIN_MS).toISOString() }
  });
  const reservation = await usage.create({
    owner_id: ownerId,
    feature,
    request_id: crypto.randomUUID(),
    requested_at: new Date(now).toISOString()
  });
  const ownId = typeof reservation?.id === "string" ? reservation.id : "";
  if (!ownId) return { allowed: false, reason: "reservation" };

  // Ascending created_date, one row more than the daily limit, so the page
  // holds every row ranked ahead of ours unless more than `daily` already are
  // (rankReservation fails closed on a full page).
  const pageSize = resolved.daily + 1;
  const recent = await usage.filter(
    {
      owner_id: ownerId,
      feature,
      requested_at: { $gte: dayCutoff }
    },
    "created_date",
    pageSize
  );

  const quota = rankReservation(recent, ownId, resolved, {
    now,
    truncated: Array.isArray(recent) && recent.length >= pageSize
  });
  if (!quota.allowed) await usage.delete(ownId);
  return quota;
}
