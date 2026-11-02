// Replaces a training session's strength logs without a window where the
// session has none. The old order (delete every old log, then create the new
// ones one by one) lost the session's lifts permanently if any create failed.
//
// Order here: create the new logs, then update the session, then delete the
// old logs. If a create or the session update fails, the logs created so far
// are removed and the original session and logs are left as they were.

/**
 * @param {any} entities Base44 `entities` (needs ExerciseSession.update and StrengthLog filter/create/delete)
 * @param {{ id: string, session: object, strengthEntries?: object[], own: (query: object) => object }} edit
 */
export async function replaceSessionStrengthLogs(entities, { id, session, strengthEntries = [], own }) {
  const oldLogs = await entities.StrengthLog.filter(own({ session_id: id }), "-date", 500);

  const newLogs = [];
  let updated;
  try {
    for (const entry of strengthEntries) {
      newLogs.push(await entities.StrengthLog.create({ ...entry, session_id: id, date: session.date }));
    }
    updated = await entities.ExerciseSession.update(id, session);
  } catch (error) {
    await Promise.allSettled(newLogs.map((log) => entities.StrengthLog.delete(log.id)));
    throw error;
  }

  const cleanup = await Promise.allSettled(oldLogs.map((log) => entities.StrengthLog.delete(log.id)));
  const leftover = oldLogs.filter((_, index) => cleanup[index].status === "rejected");

  return { updated, newLogs, oldLogs, leftover };
}
