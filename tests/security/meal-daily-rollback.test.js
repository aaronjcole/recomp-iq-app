import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTrackingRequest, reconcileTrackingRecords } from "../../base44/shared/trackingRecordDomain.js";

const source = readFileSync(new URL("../../src/lib/RecompContext.jsx", import.meta.url), "utf8");
const date = "2026-10-22", owner = "rollback-owner";
function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function harness(invoke) {
  let remote = { id: "daily", date, created_by_id: owner, calories: 100, protein_g: 10, sleep_hours: 8 };
  const logsRef = { current: [structuredClone(remote)] };
  const userIdRef = { current: owner }, providerActive = { current: true };
  const setters = [];
  let defer = false, calls = 0;
  const bindings = {
    useRef: (current) => ({ current }), useCallback: (callback) => callback,
    FOOD_TOTAL_FIELDS: ["calories", "protein_g", "carbs_g", "fat_g"],
    logsRef, userIdRef, providerActive, dailyQueues: { current: new Map() },
    profileRef: { current: null }, referenceWriteVersion: { current: 0 }, own: () => {},
    ownedQuery: (id, query) => ({ created_by_id: id, ...query }),
    setLogsCurrent(updater) {
      const apply = () => { logsRef.current = updater(logsRef.current); };
      if (defer) setters.push(apply); else apply();
    },
    setProfile() { assert.fail("food totals must not edit the profile"); },
    invokeFoodNutritionUpdate() { assert.fail("this test isolates the daily queue without receipt transport"); },
    base44: {
      entities: { DailyLog: { filter: async () => [structuredClone(remote)] } },
      functions: { invoke: async (_name, body) => {
        await invoke?.(++calls, body);
        const request = normalizeTrackingRequest(body, owner);
        remote = { ...remote, ...reconcileTrackingRecords([remote], request.fields, request.mutableFields, request.increments).fields };
        return { data: { record: structuredClone(remote) } };
      } }
    }
  };
  const helpers = ["roundNutrition", "applyNutritionIncrements", "replayNutritionIncrements", "mergeDefined", "newestByKey", "enqueueByKey"]
    .map((name) => source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))[0]);
  const start = source.indexOf("  const pendingIncrements = useRef(");
  const end = source.indexOf("  const upsertHabitEntry = useCallback(", start);
  assert.ok(start >= 0 && end > start);
  const upsert = new Function(...Object.keys(bindings), `${helpers.join("\n")}\n${source.slice(start, end)}\nreturn upsertDailyLog;`)(...Object.values(bindings));
  return { upsert, logsRef, userIdRef, providerActive, setters, defer: () => { defer = true; }, remote: () => remote };
}
const rejected = () => Object.assign(new Error("Rejected before commit"), { status: 400 });

test("a failed clamped decrement restores 100 calories, not the requested 400", async () => {
  const h = harness(() => { throw rejected(); });
  await assert.rejects(h.upsert(date, null, { increments: { calories: -400 } }), /Rejected/);
  assert.equal(h.logsRef.current[0].calories, 100);
  assert.equal(h.logsRef.current[0].sleep_hours, 8);
  assert.equal(h.remote().calories, 100);
});

test("rollback replays a later clamped decrement from the confirmed baseline in queue order", async () => {
  const first = gate(), second = gate();
  const h = harness(async (ordinal) => {
    if (ordinal === 1) { await first.promise; throw rejected(); }
    await second.promise;
  });
  const a = h.upsert(date, null, { increments: { calories: -400 } });
  const failed = assert.rejects(a, /Rejected/);
  const b = h.upsert(date, null, { increments: { calories: -50 } });
  assert.equal(h.logsRef.current[0].calories, 0);
  first.resolve();
  await failed;
  assert.equal(h.logsRef.current[0].calories, 50);
  second.resolve();
  await b;
  assert.equal(h.logsRef.current[0].calories, 50);
  assert.equal(h.remote().calories, 50);
});

test("a later failure keeps an earlier confirmed clamped decrement at zero", async () => {
  const first = gate();
  const h = harness(async (ordinal) => { if (ordinal === 1) await first.promise; else throw rejected(); });
  const a = h.upsert(date, null, { increments: { calories: -400 } });
  const b = h.upsert(date, null, { increments: { calories: -50 } });
  const failed = assert.rejects(b, /Rejected/);
  first.resolve();
  await a; await failed;
  assert.equal(h.logsRef.current[0].calories, 0);
  assert.equal(h.remote().calories, 0);
});

test("a deferred daily optimistic updater cannot publish into a changed account", async () => {
  const h = harness();
  h.defer();
  const save = h.upsert(date, null, { increments: { calories: 50 } });
  const failed = assert.rejects(save, /account changed/);
  h.userIdRef.current = "another-owner";
  for (const setter of h.setters) setter();
  await failed;
  assert.equal(h.logsRef.current[0].calories, 100);
  assert.equal(h.remote().calories, 100);
});
