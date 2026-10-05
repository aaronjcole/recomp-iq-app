// The read-reconcile-write step behind base44/functions/upsertTrackingRecord,
// moved out of the Deno entry unchanged so it can run against a fake client.
// The entry authenticates, normalizes the request and serializes calls per
// owner+record key; everything that touches records happens here, through the
// caller's user-scoped client (never the service role).

import { TrackingRequestError, reconcileTrackingRecords } from "./trackingRecordDomain.js";
import { statusOf } from "./httpUtils.js";
import { ownedQuery } from "./ownerScope.js";

export async function verifyHabitOwnership(base44, user, habitId) {
  let habit;
  try {
    habit = await base44.entities.Habit.get(habitId);
  } catch (error) {
    if ([401, 403, 404].includes(statusOf(error))) {
      throw new TrackingRequestError("Habit not found");
    }
    throw error;
  }
  // RLS lets admins read any user's habit, so existence alone does not prove
  // ownership. Report another owner's habit exactly like a missing one.
  if (!habit?.id || habit.created_by_id !== user.id) {
    throw new TrackingRequestError("Habit not found");
  }
}

export async function persistTrackingRecord(base44, user, request) {
  if (request.kind === "habit_entry") {
    await verifyHabitOwnership(base44, user, request.habitId);
  }

  const entity =
    request.kind === "daily_log" ? base44.entities.DailyLog : base44.entities.HabitEntry;
  // request.query is scoped to the caller (created_by_id) by
  // normalizeTrackingRequest; never widen it here.
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
    request.mutableFields,
    request.increments
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
      ownedQuery(user.id, { id: canonical.id }),
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
