import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import {
  LIFESTYLE_RESPONSE_SCHEMA,
  LIFESTYLE_COACH_HOURLY_LIMIT,
  LIFESTYLE_COACH_DAILY_LIMIT,
  buildPreAnalysis,
  buildLifestyleCoachPrompt,
  normalizeLifestyleRequest,
  normalizeLifestyleReply
} from "../../shared/lifestyleCoachDomain.js";
import {
  classifyHighRiskCoachRequest,
  buildHighRiskGuidanceReply,
  buildSafetyGuidanceReply,
  hasActiveSafetyFlags
} from "../../shared/coachDomain.js";
import { resolvePremiumAccess, PREMIUM_FEATURES } from "../../shared/premiumDomain.js";
import {
  AI_QUOTA_FEATURES,
  quotaRetryAfterSeconds,
  reserveFeatureRequest
} from "../../shared/coachRateLimitDomain.js";

const MAX_REQUEST_BYTES = 48_000;
const CONVERSATION_MESSAGES_LIMIT = 100;
const LIFESTYLE_COACH_QUOTA = {
  hourly: LIFESTYLE_COACH_HOURLY_LIMIT,
  daily: LIFESTYLE_COACH_DAILY_LIMIT
};

function statusOf(error: any) {
  return error?.status ?? error?.response?.status;
}

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function safeErrorDetails(error: any) {
  return {
    status: statusOf(error) ?? null,
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error"
  };
}

async function ownedRecords(base44: any, entityName: string, userId: string, sort: string, limit: number) {
  return await base44.entities[entityName].filter({ created_by_id: userId }, sort, limit);
}

async function listAllEntitlements(base44: any, ownerId: string) {
  return await base44.asServiceRole.entities.PremiumEntitlement.filter(
    { owner_id: ownerId },
    "-created_date",
    500,
    0,
    ["product_id", "source", "status", "expires_at"]
  );
}

async function reserveLifestyleRequest(base44: any, ownerId: string) {
  return await reserveFeatureRequest(
    base44.asServiceRole.entities.CoachRequestUsage,
    ownerId,
    AI_QUOTA_FEATURES.COACH,
    LIFESTYLE_COACH_QUOTA
  );
}

export default async function(req: Request) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user: any;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) return json({ error: "Unauthorized" }, { status: 401 });
    console.error("lifestyleCoachReply auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  const entitlements = await listAllEntitlements(base44, user.id);
  const access = resolvePremiumAccess(entitlements);
  if (!access.features[PREMIUM_FEATURES.AI_LIFESTYLE_COACH]) {
    return json({ error: "AI Lifestyle Coach requires the Lifestyle Coach premium plan" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  let request: any;
  try {
    request = normalizeLifestyleRequest(body);
  } catch (error: any) {
    return json({ error: error.message }, { status: 400 });
  }

  const highRisk = classifyHighRiskCoachRequest(request);
  if (highRisk) {
    return json({ messageId: crypto.randomUUID(), actionable: false, reply: buildHighRiskGuidanceReply(highRisk) });
  }

  try {
    const ownerId = user.id;
    const [profiles, preferencesList, strategies] = await Promise.all([
      ownedRecords(base44, "UserProfile", ownerId, "-created_date", 1),
      ownedRecords(base44, "UserPreferences", ownerId, "-created_date", 1),
      ownedRecords(base44, "CurrentStrategy", ownerId, "-created_date", 1)
    ]);
    const profile = profiles[0] ?? null;
    const preferences = preferencesList[0] ?? null;
    const strategy = strategies[0] ?? null;

    if (!profile || !strategy) {
      return json({ error: "Complete onboarding before using the coach" }, { status: 409 });
    }

    if (hasActiveSafetyFlags(preferences)) {
      return json({ messageId: crypto.randomUUID(), actionable: false, reply: buildSafetyGuidanceReply() });
    }

    const quota = await reserveLifestyleRequest(base44, ownerId);
    if (!quota.allowed) {
      return json(
        { error: "Coach request limit reached. Please try again later." },
        { status: 429, headers: { "Retry-After": quotaRetryAfterSeconds(quota.reason) } }
      );
    }

    const [dailyLogs, sessions, checkIns, lifestyleProfiles] = await Promise.all([
      ownedRecords(base44, "DailyLog", ownerId, "-date", 28),
      ownedRecords(base44, "ExerciseSession", ownerId, "-date", 8),
      ownedRecords(base44, "WeeklyCheckIn", ownerId, "-created_date", 1),
      ownedRecords(base44, "LifestyleProfile", ownerId, "-created_date", 1)
    ]);
    const checkIn = checkIns[0] ?? null;
    const lifestyleProfile = lifestyleProfiles[0] ?? null;

    const preAnalysis = buildPreAnalysis({ profile, strategy, dailyLogs, sessions, checkIn });
    const prompt = buildLifestyleCoachPrompt({
      request, profile, preferences, strategy, lifestyleProfile, dailyLogs, sessions, checkIn, preAnalysis
    });

    const rawReply = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: LIFESTYLE_RESPONSE_SCHEMA
    });
    const result = normalizeLifestyleReply(rawReply);

    // Persist lifestyle profile updates extracted from this conversation turn
    if (result.lifestyleUpdates) {
      const updates = {
        ...result.lifestyleUpdates,
        last_updated: new Date().toISOString()
      };
      if (lifestyleProfile?.id) {
        await base44.entities.LifestyleProfile.update(lifestyleProfile.id, updates);
      } else {
        await base44.entities.LifestyleProfile.create(updates);
      }
    }

    return json({
      messageId: crypto.randomUUID(),
      actionable: !!(result.summary && result.actions.length > 0),
      reply: {
        summary: result.summary,
        actions: result.actions,
        ...(result.safetyNote ? { safetyNote: result.safetyNote } : {}),
        ...(result.planAdjustments ? { planAdjustments: result.planAdjustments } : {}),
        ...(result.lifestyleUpdates ? { lifestyleUpdates: result.lifestyleUpdates } : {})
      }
    });
  } catch (error) {
    console.error("lifestyleCoachReply failed", safeErrorDetails(error));
    return json({ error: "The coach could not respond right now" }, { status: 502 });
  }
}