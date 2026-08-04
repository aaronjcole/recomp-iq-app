export const COACH_HOURLY_LIMIT = 10;
export const COACH_DAILY_LIMIT = 40;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

export function evaluateCoachQuota(records, requestId, now = Date.now()) {
  const usage = validUsage(Array.isArray(records) ? records : [], now);
  if (!usage.some((record) => record.requestId === requestId)) {
    return { allowed: false, reason: "reservation" };
  }

  const dailyIds = new Set(
    usage.slice(0, COACH_DAILY_LIMIT).map((record) => record.requestId)
  );
  if (!dailyIds.has(requestId)) {
    return { allowed: false, reason: "daily" };
  }

  const hourlyIds = new Set(
    usage
      .filter((record) => record.requestedAt >= now - HOUR_MS)
      .slice(0, COACH_HOURLY_LIMIT)
      .map((record) => record.requestId)
  );
  if (!hourlyIds.has(requestId)) {
    return { allowed: false, reason: "hourly" };
  }

  return { allowed: true, reason: null };
}
