import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  COACH_RESPONSE_SCHEMA,
  CoachRequestError,
  buildCoachPrompt,
  buildHighRiskGuidanceReply,
  buildSafetyGuidanceReply,
  classifyHighRiskCoachRequest,
  hasActiveSafetyFlags,
  normalizeCoachReplyResult,
  normalizeCoachRequest
} from "../../shared/coachDomain.js";

const MAX_REQUEST_BYTES = 24_000;

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
    console.error("coachReply auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  let request;
  try {
    request = normalizeCoachRequest(body);
  } catch (error) {
    if (error instanceof CoachRequestError) {
      return json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const highRiskRequest = classifyHighRiskCoachRequest(request);
  if (highRiskRequest) {
    return json({
      messageId: crypto.randomUUID(),
      actionable: false,
      reply: buildHighRiskGuidanceReply(highRiskRequest)
    });
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
      return json({
        messageId: crypto.randomUUID(),
        actionable: false,
        reply: buildSafetyGuidanceReply()
      });
    }

    const [dailyLogs, sessions, checkIns] = await Promise.all([
      ownedRecords(base44, "DailyLog", ownerId, "-date", 14),
      ownedRecords(base44, "ExerciseSession", ownerId, "-date", 5),
      ownedRecords(base44, "WeeklyCheckIn", ownerId, "-created_date", 1)
    ]);
    const prompt = buildCoachPrompt({
      request,
      profile,
      preferences,
      strategy,
      dailyLogs,
      sessions,
      checkIn: checkIns[0] ?? null
    });
    const rawReply = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: COACH_RESPONSE_SCHEMA
    });
    const result = normalizeCoachReplyResult(rawReply);

    return json({
      messageId: crypto.randomUUID(),
      actionable: result.actionable,
      reply: result.reply
    });
  } catch (error) {
    console.error("coachReply failed", safeErrorDetails(error));
    return json({ error: "The coach could not respond right now" }, { status: 502 });
  }
}
