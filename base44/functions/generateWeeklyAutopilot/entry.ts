import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  AutopilotRequestError,
  buildWeeklyAutopilotReview,
  normalizeAutopilotRequest
} from "../../shared/weeklyAutopilotDomain.js";
import {
  PREMIUM_FEATURES,
  resolvePremiumAccess
} from "../../shared/premiumDomain.js";

const MAX_REQUEST_BYTES = 2_000;
const ENTITLEMENT_PAGE_SIZE = 500;

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeErrorDetails(error) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}

async function listAllEntitlements(base44, ownerId) {
  const records = [];
  let skip = 0;
  while (true) {
    const page = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: ownerId },
      "-created_date",
      ENTITLEMENT_PAGE_SIZE,
      skip,
      ["product_id", "source", "status", "expires_at"]
    );
    if (!Array.isArray(page)) throw new Error("Invalid entitlement response");
    records.push(...page);
    if (page.length < ENTITLEMENT_PAGE_SIZE) return records;
    skip += page.length;
  }
}

async function ownedRecords(base44, entityName, userId, sort, limit) {
  return await base44.entities[entityName].filter(
    { created_by_id: userId },
    sort,
    limit
  );
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("generateWeeklyAutopilot auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let request;
  try {
    request = normalizeAutopilotRequest(await req.json());
  } catch (error) {
    if (error instanceof AutopilotRequestError || error instanceof SyntaxError) {
      return json({ error: error instanceof AutopilotRequestError ? error.message : "A JSON request body is required" }, { status: 400 });
    }
    throw error;
  }

  try {
    // The backend entitlement is checked before any personal fitness data is read.
    const entitlements = await listAllEntitlements(base44, user.id);
    const access = resolvePremiumAccess(entitlements);
    if (access.features[PREMIUM_FEATURES.WEEKLY_AUTOPILOT] !== true) {
      return json({ error: "Premium Weekly Autopilot access is required" }, { status: 403 });
    }

    const [profiles, preferencesList, strategies, checkIns, logs, sessions, habits, habitEntries] = await Promise.all([
      ownedRecords(base44, "UserProfile", user.id, "-created_date", 1),
      ownedRecords(base44, "UserPreferences", user.id, "-created_date", 1),
      ownedRecords(base44, "CurrentStrategy", user.id, "-created_date", 1),
      ownedRecords(base44, "WeeklyCheckIn", user.id, "-created_date", 1),
      ownedRecords(base44, "DailyLog", user.id, "-date", 30),
      ownedRecords(base44, "ExerciseSession", user.id, "-date", 50),
      ownedRecords(base44, "Habit", user.id, "sort_order", 100),
      ownedRecords(base44, "HabitEntry", user.id, "-date", 500)
    ]);
    const profile = profiles[0] ?? null;
    const strategy = strategies[0] ?? null;
    if (!profile || !strategy) {
      return json({ error: "Complete onboarding before running Weekly Autopilot" }, { status: 409 });
    }

    return json(buildWeeklyAutopilotReview({
      weekEnd: request.weekEnd,
      strategy,
      profile,
      preferences: preferencesList[0] ?? null,
      logs,
      sessions,
      habits,
      habitEntries,
      checkIn: checkIns[0] ?? null
    }));
  } catch (error) {
    if (error instanceof AutopilotRequestError) {
      return json({ error: error.message }, { status: 409 });
    }
    console.error("generateWeeklyAutopilot failed", safeErrorDetails(error));
    return json({ error: "Weekly Autopilot could not run right now" }, { status: 502 });
  }
}
