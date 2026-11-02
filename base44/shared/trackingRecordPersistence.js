// The read-reconcile-write step behind base44/functions/upsertTrackingRecord,
// moved out of the Deno entry unchanged so it can run against a fake client.
// The entry authenticates, normalizes the request and serializes calls per
// owner+record key; everything that touches records happens here, through the
// caller's user-scoped client (never the service role).

import {
  DAILY_LOG_FIELDS,
  NUTRITION_OPERATION_RECEIPTS_FIELD,
  TrackingRequestError,
  isNutritionOperationId,
  reconcileTrackingRecords
} from "./trackingRecordDomain.js";
import { statusOf } from "./httpUtils.js";
import { ownedQuery } from "./ownerScope.js";

function nutritionReceipts(records) {
  const receipts = new Set();
  for (const row of records) {
    const ids = row[NUTRITION_OPERATION_RECEIPTS_FIELD];
    if (ids === undefined) continue;
    // Fail closed on damaged receipts instead of silently forgetting retries.
    if (!Array.isArray(ids) || ids.some((id) => !isNutritionOperationId(id))) {
      throw new Error("Daily log nutrition receipts could not be verified");
    }
    for (const id of ids) receipts.add(id.toLowerCase());
  }
  return receipts;
}

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
  const readRecords = async () => {
    const records = await entity.filter(request.query, "created_date", 50);
    // An unseen duplicate may carry an older receipt. Never reconcile/delete
    // only a prefix and then accidentally apply a retry a second time.
    if (request.kind === "daily_log") {
      for (let pageSize = records.length; pageSize === 50;) {
        if (records.length >= 1000) throw new Error("Too many duplicate daily logs to reconcile safely");
        const page = await entity.filter(request.query, "created_date", 50, records.length);
        records.push(...page);
        pageSize = page.length;
      }
    }
    return records;
  };
  let records = await readRecords();
  let created = null;

  if (request.statusOnly) {
    const { canonical, fields } = reconcileTrackingRecords(records, {}, DAILY_LOG_FIELDS);
    return {
      // Confirm current merged totals without persisting or cleaning up duplicates.
      record: canonical ? { ...canonical, ...fields } : null,
      nutrition_operation_applied: nutritionReceipts(records).has(request.nutritionOperationId),
      nutrition_operation_id: request.nutritionOperationId
    };
  }

  if (records.length === 0) {
    created = await entity.create(request.createData);
    records = await readRecords();
    if (!records.some((record) => record.id === created.id)) records.push(created);
  }

  const receipts = request.kind === "daily_log" ? nutritionReceipts(records) : new Set();
  const replayed = Boolean(request.nutritionOperationId && receipts.has(request.nutritionOperationId));
  const { canonical, duplicates, fields, unsetFields } = reconcileTrackingRecords(
    records,
    replayed ? {} : request.fields,
    request.mutableFields,
    replayed ? {} : request.increments
  );
  if (!canonical?.id) throw new Error("The tracking record could not be resolved");

  if (request.nutritionOperationId) receipts.add(request.nutritionOperationId);
  if (receipts.size > 0) fields[NUTRITION_OPERATION_RECEIPTS_FIELD] = [...receipts];

  // Merge into the stable oldest record before removing redundant records. A
  // failed cleanup is safe to retry because the next call reconciles again.
  let record = canonical;
  if (Object.keys(fields).length > 0) {
    // Totals and their receipt commit in ONE row update. A lost response can be
    // retried safely under the entry's existing owner/date queue. This is not
    // distributed CAS; independent function instances retain the existing race.
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
    cleanup_pending: cleanupPending,
    ...(request.nutritionOperationId ? {
      nutrition_operation_id: request.nutritionOperationId,
      nutrition_operation_applied: true
    } : {})
  };
}
