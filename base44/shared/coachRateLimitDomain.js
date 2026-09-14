// Shared per-user quotas for every backend function that spends paid LLM
// credits. Reservations live in the CoachRequestUsage entity so the limit is
// enforced across stateless function instances instead of in process memory.

export const COACH_HOURLY_LIMIT = 10;
export const COACH_DAILY_LIMIT = 40;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

function validUsage(records, now) {
  return records
    .map((record) => ({
      requestId: typeof record?.request_id === "string" ? record.request_id : "",
      requestedAt: Date.parse(record?.requested_at ?? "")
    }))
    .filter((record) => (
      record.requestId
      && Number.isFinite(record.requestedAt)
      && record.requestedAt >= now - DAY_MS
      && record.requestedAt <= now
    ))
    .sort((left, right) => (
      left.requestedAt - right.requestedAt
      || left.requestId.localeCompare(right.requestId)
    ));
}

/**
 * Decide whether a persisted reservation is inside the hourly and daily
 * windows for one feature. Anything unexpected - a missing reservation,
 * unusable limits - denies the request so callers fail closed.
 */
export function evaluateFeatureQuota(records, requestId, limits, now = Date.now()) {
  const resolved = normalizeLimits(limits);
  if (!resolved || typeof requestId !== "string" || requestId === "") {
    return { allowed: false, reason: "reservation" };
  }

  const usage = validUsage(Array.isArray(records) ? records : [], now);
  if (!usage.some((record) => record.requestId === requestId)) {
    return { allowed: false, reason: "reservation" };
  }

  const dailyIds = new Set(
    usage.slice(0, resolved.daily).map((record) => record.requestId)
  );
  if (!dailyIds.has(requestId)) {
    return { allowed: false, reason: "daily" };
  }

  const hourlyIds = new Set(
    usage
      .filter((record) => record.requestedAt >= now - HOUR_MS)
      .slice(0, resolved.hourly)
      .map((record) => record.requestId)
  );
  if (!hourlyIds.has(requestId)) {
    return { allowed: false, reason: "hourly" };
  }

  return { allowed: true, reason: null };
}

export function evaluateCoachQuota(records, requestId, now = Date.now()) {
  return evaluateFeatureQuota(records, requestId, COACH_QUOTA, now);
}

/** Retry-After seconds for a rejected quota, as a header-ready string. */
export function quotaRetryAfterSeconds(reason) {
  return reason === "daily" ? "86400" : "3600";
}

/**
 * Reserve one paid request for a feature and report whether it fits the quota.
 *
 * `usage` is the service-role CoachRequestUsage entity accessor, injected by
 * the caller so this module never imports the SDK. The reservation is written
 * before it is counted, so concurrent invocations converge on the same ordered
 * window instead of each reading a stale count; a rejected reservation is
 * removed again so a throttled request does not consume the allowance.
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

  const requestedAt = new Date(now).toISOString();
  const dayCutoff = new Date(now - DAY_MS).toISOString();
  const requestId = crypto.randomUUID();

  // Pruning ignores the feature key so expired rows from every feature, and
  // from reservations written before feature keys existed, are cleaned up.
  await usage.deleteMany({
    owner_id: ownerId,
    requested_at: { $lt: dayCutoff }
  });
  const reservation = await usage.create({
    owner_id: ownerId,
    feature,
    request_id: requestId,
    requested_at: requestedAt
  });
  const recent = await usage.filter(
    {
      owner_id: ownerId,
      feature,
      requested_at: { $gte: dayCutoff, $lte: requestedAt }
    },
    "requested_at",
    resolved.daily + 1
  );

  const quota = evaluateFeatureQuota(recent, requestId, resolved, now);
  if (!quota.allowed) await usage.delete(reservation.id);
  return quota;
}
