import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import {
  TrackingRequestError,
  normalizeTrackingRequest
} from "../../shared/trackingRecordDomain.js";
import { persistTrackingRecord } from "../../shared/trackingRecordPersistence.js";
import { json, statusOf } from "../../shared/httpUtils.js";

const MAX_REQUEST_BYTES = 16_384;
const inFlightWrites = new Map();

function enqueueByKey(key, work) {
  const previous = inFlightWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  inFlightWrites.set(key, next);
  next.then(
    () => {
      if (inFlightWrites.get(key) === next) inFlightWrites.delete(key);
    },
    () => {
      if (inFlightWrites.get(key) === next) inFlightWrites.delete(key);
    }
  );
  return next;
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
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
    console.error("upsertTrackingRecord auth check failed", error);
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
    request = normalizeTrackingRequest(body, user.id);
  } catch (error) {
    if (error instanceof TrackingRequestError) {
      return json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const queueKey = `${user.id}:${request.queueKey}`;
  try {
    const result = await enqueueByKey(queueKey, () =>
      persistTrackingRecord(base44, user, request)
    );
    return json(result);
  } catch (error) {
    if (error instanceof TrackingRequestError) {
      return json({ error: error.message }, { status: 404 });
    }
    console.error("upsertTrackingRecord failed", {
      userId: user.id,
      kind: request.kind,
      key: request.queueKey,
      error
    });
    return json({ error: "The tracking update could not be saved" }, { status: 500 });
  }
}
