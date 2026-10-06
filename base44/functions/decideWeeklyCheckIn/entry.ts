import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";
import { WeeklyCheckInError } from "../../shared/weeklyCheckInDomain.js";
import { decideWeeklyCheckIn } from "../../shared/weeklyCheckInPersistence.js";

// Weekly Check-In v2: records the user's decision on this week's proposal
// and, for "apply", changes CurrentStrategy exactly once.
//
// Body: { decision: "apply" | "keep_current" | "customize",
//         referenceDate: "YYYY-MM-DD" (the user's local today),
//         proposalFingerprint: string (from the proposal the user reviewed) }
//
// The proposal is recomputed from the caller's own records, so insufficient
// data, safety flags and manual targets cannot be bypassed by the client. A
// fingerprint mismatch answers 409 with the current proposal to review.

const MAX_BODY_BYTES = 8_000;

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("decideWeeklyCheckIn auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  try {
    return json(await decideWeeklyCheckIn(base44, user, body));
  } catch (error) {
    if (error instanceof WeeklyCheckInError) {
      return json({ error: error.message, code: error.code, ...error.extra }, { status: error.status });
    }
    console.error("decideWeeklyCheckIn failed", { userId: user.id, ...safeErrorDetails(error) });
    return json({ error: "The check-in could not be saved. Try again." }, { status: 500 });
  }
}
