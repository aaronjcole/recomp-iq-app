import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  TrackingRequestError,
  normalizeTrackingRequest,
  reconcileTrackingRecords
} from "./domain.js";

const MAX_REQUEST_BYTES = 16_384;
const inFlightWrites = new Map();

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

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

async function verifyHabitOwnership(base44, habitId) {
  let habit;
  try {
    habit = await base44.entities.Habit.get(habitId);
  } catch (error) {
    if ([401, 403, 404].includes(statusOf(error))) {
      throw new TrackingRequestError("Habit not found");
    }
    throw error;
  }
  if (!habit?.id) throw new TrackingRequestError("Habit not found");
}

async function persistTrackingRecord(base44, user, request) {
  if (request.kind === "habit_entry") {
    await verifyHabitOwnership(base44, request.habitId);
  }

  const entity =
    request.kind === "daily_log" ? base44.entities.DailyLog : base44.entities.HabitEntry;
  let records = await entity.filter(request.query, "created_date", 50);
  let created = null;

  if (records.length === 0) {
    created = await entity.create(request.createData);
    records = await entity.filter(request.query, "created_date", 50);
    if (!records.some((record) => record.id === created.id)) records.push(created);
  }

  const { canonical, duplicates, fields, unsetFields } = reconcileTrackingRecords(
    records,
    request.fields,
    request.mutableFields
  );
  if (!canonical?.id) throw new Error("The tracking record could not be resolved");

  // Merge into the stable oldest record before removing redundant records. A
  // failed cleanup is safe to retry because the next call reconciles again.
  let record = canonical;
  if (Object.keys(fields).length > 0) {
    record = await entity.update(canonical.id, fields);
  }
  if (unsetFields.length > 0) {
    await entity.updateMany(
      { id: canonical.id },
      { $unset: Object.fromEntries(unsetFields.map((field) => [field, ""])) }
    );
    record = await entity.get(canonical.id);
  }
  const cleanup = await Promise.allSettled(
    duplicates.map((duplicate) => entity.delete(duplicate.id))
  );
  const cleanupPending = cleanup.filter((result) => result.status === "rejected").length;
  if (cleanupPending > 0) {
    console.warn("Tracking duplicate cleanup remains pending", {
      userId: user.id,
      kind: request.kind,
      key: request.queueKey,
      cleanupPending
    });
  }

  return {
    record,
    observed_duplicates: duplicates.length,
    cleanup_pending: cleanupPending
  };
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("upsertTrackingRecord auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  let request;
  try {
    request = normalizeTrackingRequest(body);
  } catch (error) {
    if (error instanceof TrackingRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const queueKey = `${user.id}:${request.queueKey}`;
  try {
    const result = await enqueueByKey(queueKey, () =>
      persistTrackingRecord(base44, user, request)
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof TrackingRequestError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("upsertTrackingRecord failed", {
      userId: user.id,
      kind: request.kind,
      key: request.queueKey,
      error
    });
    return Response.json({ error: "The tracking update could not be saved" }, { status: 500 });
  }
}
