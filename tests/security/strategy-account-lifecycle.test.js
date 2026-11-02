import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { snapshotPlanTargets } from "../../src/lib/planSettings.js";

const contextSource = readFileSync(new URL("../../src/lib/RecompContext.jsx", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Execute the production callback and queue/merge helpers, not a copied guard.
// React's useCallback is identity here; no rendering, browser or SDK is needed.
function strategyHarness() {
  const callbackStart = contextSource.indexOf("  const updateStrategy = useCallback(");
  const callbackEnd = contextSource.indexOf("\n  // Nutrition increments", callbackStart);
  assert.ok(callbackStart >= 0 && callbackEnd > callbackStart, "updateStrategy callback must be found");
  const helpers = ["enqueueByKey", "mergeDefined"].map((name) => {
    const match = contextSource.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `${name} helper must be found`);
    return match[0];
  });
  const initial = { id: "strategy-a", created_by_id: "account-a", calorie_target: 2200, manual_override: false };
  const pendingRead = deferred();
  const readStarted = deferred();
  const reads = [], writes = [], stateUpdates = [], cacheRemovals = [], ledgerUpdates = [];
  const providerActive = { current: true };
  const userIdRef = { current: "account-a" };
  const strategyRef = { current: initial };
  const referenceWriteVersion = { current: 0 };
  const bindings = {
    useCallback: (callback) => callback,
    planQueues: { current: new Map() },
    providerActive,
    userIdRef,
    strategyRef,
    referenceWriteVersion,
    snapshotPlanTargets,
    base44: { entities: {
      CurrentStrategy: {
        get: (id) => {
          reads.push(id);
          readStarted.resolve();
          return pendingRead.promise;
        },
        update: async (id, data) => {
          writes.push({ entity: "CurrentStrategy", id, data });
          return { ...initial, ...data };
        }
      },
      DecisionLedger: {
        create: async (data) => {
          writes.push({ entity: "DecisionLedger", data });
          return { id: "ledger-a", ...data };
        }
      }
    } },
    setStrategy: (value) => stateUpdates.push(value),
    setDecisionLedger: (updater) => ledgerUpdates.push(updater([])),
    MEAL_PLAN_CACHE: "meal-plan",
    GROCERY_CACHE: "grocery",
    AUTOPILOT_CACHE: "autopilot",
    removePlanCache: (...args) => cacheRemovals.push(args),
    todayStr: () => "2026-10-22"
  };
  const updateStrategy = new Function(
    ...Object.keys(bindings),
    `${helpers.join("\n")}\n${contextSource.slice(callbackStart, callbackEnd)}\nreturn updateStrategy;`
  )(...Object.values(bindings));
  return {
    updateStrategy, initial, pendingRead, readStarted, providerActive, userIdRef,
    strategyRef, referenceWriteVersion, reads, writes, stateUpdates, cacheRemovals, ledgerUpdates
  };
}

for (const change of ["provider deactivation", "owner switch"]) {
  test(`updateStrategy dispatches no write after ${change} during a delayed get`, async () => {
    const harness = strategyHarness();
    const pending = harness.updateStrategy("strategy-a", { manual_override: true }, "Manual target change");
    const rejected = assert.rejects(pending, /Your signed-in account changed/);
    // Revoke only after get was actually dispatched, before resolving its old
    // owner's response. This exercises the post-read guard, not the entry guard.
    await harness.readStarted.promise;
    assert.deepEqual(harness.reads, ["strategy-a"]);
    assert.deepEqual(harness.writes, []);
    if (change === "provider deactivation") harness.providerActive.current = false;
    else harness.userIdRef.current = "account-b";
    harness.pendingRead.resolve({ ...harness.initial });
    await rejected;

    assert.deepEqual(harness.writes, [], "neither strategy nor decision history may be written");
    assert.deepEqual(harness.stateUpdates, []);
    assert.deepEqual(harness.ledgerUpdates, []);
    assert.deepEqual(harness.cacheRemovals, []);
    assert.strictEqual(harness.strategyRef.current, harness.initial);
    assert.equal(harness.referenceWriteVersion.current, 0);
  });
}

test("updateStrategy still saves targets and history when a delayed get returns to the same active owner", async () => {
  const harness = strategyHarness();
  const patch = { calorie_target: 2400, manual_override: true };
  const pending = harness.updateStrategy("strategy-a", patch, "Manual target change");
  await harness.readStarted.promise;
  assert.deepEqual(harness.writes, []);
  harness.pendingRead.resolve({ ...harness.initial });
  const saved = await pending;

  assert.deepEqual(saved, { ...harness.initial, ...patch });
  assert.deepEqual(harness.writes, [
    { entity: "CurrentStrategy", id: "strategy-a", data: patch },
    { entity: "DecisionLedger", data: {
      date: "2026-10-22",
      previous_targets: snapshotPlanTargets(harness.initial),
      new_targets: snapshotPlanTargets(saved),
      reason: "Manual target change"
    } }
  ]);
  assert.deepEqual(harness.stateUpdates, [saved]);
  assert.strictEqual(harness.strategyRef.current, saved);
  assert.equal(harness.referenceWriteVersion.current, 1);
  assert.deepEqual(harness.cacheRemovals, [
    ["meal-plan", "account-a"], ["grocery", "account-a"], ["autopilot", "account-a"]
  ]);
  assert.equal(harness.ledgerUpdates[0][0].id, "ledger-a");
});
