import test from "node:test";
import assert from "node:assert/strict";
import { replaceSessionStrengthLogs } from "../../src/lib/sessionEdit.js";

function fakeStore({ failCreateAt = null, failUpdate = false, failDelete = new Set() } = {}) {
  const logs = new Map([
    ["old-1", { id: "old-1", session_id: "session-1", exercise: "Squat" }],
    ["old-2", { id: "old-2", session_id: "session-1", exercise: "Bench" }]
  ]);
  let created = 0;
  let session = { id: "session-1", title: "Lower" };
  return {
    logs,
    get session() { return session; },
    entities: {
      ExerciseSession: {
        update: async (id, data) => {
          if (failUpdate) throw new Error("update failed");
          session = { ...session, ...data, id };
          return session;
        }
      },
      StrengthLog: {
        filter: async (query) => [...logs.values()].filter((log) => log.session_id === query.session_id),
        create: async (data) => {
          created += 1;
          if (created === failCreateAt) throw new Error("create failed");
          const log = { id: `new-${created}`, ...data };
          logs.set(log.id, log);
          return log;
        },
        delete: async (id) => {
          if (failDelete.has(id)) throw new Error("delete failed");
          logs.delete(id);
        }
      }
    }
  };
}

const edit = {
  id: "session-1",
  session: { title: "Lower (edited)", date: "2026-08-04" },
  strengthEntries: [{ exercise: "Squat" }, { exercise: "Deadlift" }, { exercise: "Lunge" }],
  own: (query) => ({ created_by_id: "user-1", ...query })
};

test("a successful edit replaces the session's strength logs", async () => {
  const store = fakeStore();
  const result = await replaceSessionStrengthLogs(store.entities, edit);
  assert.deepEqual([...store.logs.keys()].sort(), ["new-1", "new-2", "new-3"]);
  assert.equal(store.session.title, "Lower (edited)");
  assert.equal(result.leftover.length, 0);
});

test("a failed create keeps the original logs and session and removes partial new logs", async () => {
  const store = fakeStore({ failCreateAt: 3 });
  await assert.rejects(() => replaceSessionStrengthLogs(store.entities, edit), /create failed/);
  assert.deepEqual([...store.logs.keys()].sort(), ["old-1", "old-2"]);
  assert.equal(store.session.title, "Lower");
});

test("a failed session update keeps the original logs", async () => {
  const store = fakeStore({ failUpdate: true });
  await assert.rejects(() => replaceSessionStrengthLogs(store.entities, edit), /update failed/);
  assert.deepEqual([...store.logs.keys()].sort(), ["old-1", "old-2"]);
});

test("a failed cleanup delete is reported, not thrown, and the edit stands", async () => {
  const store = fakeStore({ failDelete: new Set(["old-2"]) });
  const result = await replaceSessionStrengthLogs(store.entities, edit);
  assert.deepEqual(result.leftover.map((log) => log.id), ["old-2"]);
  assert.equal(store.session.title, "Lower (edited)");
  assert.equal(result.newLogs.length, 3);
});
