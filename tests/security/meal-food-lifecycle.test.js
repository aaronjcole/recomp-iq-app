import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newNutritionOperationId } from "../../src/lib/foodNutritionSync.js";
import { statusOf } from "../../base44/shared/httpUtils.js";

const source = readFileSync(new URL("../../src/lib/RecompContext.jsx", import.meta.url), "utf8");
const OWNER = "food-owner-a";
const DATE = "2026-10-12";
const food = {
  id: "food-original", created_by_id: OWNER, date: DATE, meal: "lunch",
  name: "Lifecycle oats", serving_description: "1 bowl", quantity: 1,
  calories: 400, protein_g: 20, carbs_g: 60, fat_g: 8, fiber_g: 6, source: "manual"
};
const clone = (value) => structuredClone(value);
const failure = (status = 503, extra = {}) => Object.assign(new Error("Injected failure"), { status, ...extra });

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Execute the production callback region and real queue/payload/totals helpers.
// Only React rendering, SDK I/O, and upsertDailyLog are replaced. Assertions
// below inspect actual writes, state, and totals, never source-string patterns.
function harness({ entries = [food], hooks = {}, itemized = true } = {}) {
  const start = source.indexOf("  const foodOwnerActive = useCallback(");
  const end = source.indexOf("  const addRecipe = useCallback(", start);
  const setterStart = source.indexOf("  const setFoodLogEntriesCurrent = useCallback(");
  const setterEnd = source.indexOf("\n  // ── Batch 1:", setterStart);
  assert.ok(start >= 0 && end > start, "production food callback region is available");
  assert.ok(setterStart >= 0 && setterEnd > setterStart, "production food recovery overlay is available");
  const helpers = ["enqueueByKey", "foodEntryPayload", "foodTotals"].map((name) => {
    const match = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"));
    assert.ok(match, `${name} production helper is available`);
    return match[0];
  });
  const foodLogEntriesRef = { current: clone(entries) };
  const userIdRef = { current: OWNER };
  const providerActive = { current: true };
  const foodQueues = { current: new Map() };
  const foodRecoveryRows = { current: new Map() };
  const unsyncedFoodIds = { current: new Set() };
  const deletedFoodIds = { current: new Set() };
  const restoredFoodIds = { current: new Map() };
  const remote = new Map(entries.map((entry) => [entry.id, clone(entry)]));
  const writes = [], nutrition = [], publications = [];
  let sequence = 0;
  let total = 800;
  let foods = [], templates = [];
  const h = {
    userIdRef, providerActive, foodQueues, foodRecoveryRows, unsyncedFoodIds,
    deletedFoodIds, restoredFoodIds, foodLogEntriesRef, remote, writes, nutrition,
    publications, deferredPublications: [], deferPublications: false,
    total: () => total, foods: () => foods, templates: () => templates,
    setEntries(rows) { foodLogEntriesRef.current = clone(rows); }
  };
  const sdkEntity = (entity) => Object.fromEntries(["create", "update", "delete"].map((method) => [method, async (idOrData, changes) => {
    const call = {
      entity, method, id: method === "create" ? null : idOrData,
      data: clone(method === "create" ? idOrData : changes), owner: userIdRef.current,
      ordinal: writes.filter((write) => write.entity === entity && write.method === method).length + 1
    };
    writes.push(call);
    await hooks.beforeWrite?.(call, h);
    let result;
    if (method === "create") {
      result = { ...call.data, id: `food-created-${++sequence}`, created_by_id: call.owner };
      if (entity === "FoodLogEntry") remote.set(result.id, clone(result));
    } else if (method === "update") {
      assert.ok(remote.has(call.id), "cannot update an absent food");
      result = { ...remote.get(call.id), ...call.data };
      remote.set(call.id, clone(result));
    } else {
      assert.ok(remote.has(call.id), "cannot delete an absent food");
      remote.delete(call.id);
      result = { success: true };
    }
    call.result = clone(result);
    await hooks.afterWrite?.(call, h);
    return clone(result);
  }]));
  const bindings = {
    useCallback: (callback) => callback,
    userIdRef, providerActive, foodQueues, foodRecoveryRows, foodLogEntriesRef,
    unsyncedFoodIds, deletedFoodIds, restoredFoodIds, newNutritionOperationId, statusOf,
    FOOD_TOTAL_FIELDS: ["calories", "protein_g", "carbs_g", "fat_g"],
    base44: { entities: {
      FoodLogEntry: sdkEntity("FoodLogEntry"), FoodItem: sdkEntity("FoodItem"),
      MealTemplate: sdkEntity("MealTemplate"), StrengthLog: sdkEntity("StrengthLog")
    } },
    setFoodLogEntries(updater) {
      if (h.deferPublications) { h.deferredPublications.push(() => bindings.setFoodLogEntries(updater)); return; }
      const previous = foodLogEntriesRef.current;
      const next = updater(previous);
      if (next.some((row, index) => row !== previous[index]) || next.length !== previous.length) {
        publications.push({ owner: userIdRef.current, rows: clone(next) });
      }
      foodLogEntriesRef.current = next;
    },
    setFoods(updater) { foods = updater(foods); publications.push({ owner: userIdRef.current, entity: "FoodItem" }); },
    setMealTemplates(updater) { templates = updater(templates); publications.push({ owner: userIdRef.current, entity: "MealTemplate" }); },
    setStrengthLogsCurrent: () => assert.fail("unrelated strength state must not be touched"),
    async upsertDailyLog(date, fields, options) {
      const call = { date, fields, ...clone(options), owner: userIdRef.current, ordinal: nutrition.length + 1 };
      nutrition.push(call);
      assert.match(call.nutritionOperationId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
      await hooks.beforeNutrition?.(call, h);
      total += call.increments.calories ?? 0;
      await hooks.afterNutrition?.(call, h);
      return { id: "daily-food", date, calories: total };
    },
    todayStr: () => DATE,
    featureFlags: { itemizedFoodDiary: itemized }
  };
  Object.assign(h, new Function(...Object.keys(bindings), `${helpers.join("\n")}\n${source.slice(setterStart, setterEnd)}\n${source.slice(start, end)}\nreturn {
    setFoodLogEntriesCurrent,
    addFood, adjustDailyNutrition, logFoodEntries, logFoodEntry, updateFoodLogEntry,
    deleteFoodLogEntry, restoreFoodLogEntry, repeatFoodLogEntry,
    discardUnsyncedFoodEntries, saveMealTemplate, logMealTemplate
  };`)(...Object.values(bindings)));
  return h;
}

function assertNoNewAccountWork(h) {
  assert.ok(h.writes.every((call) => call.owner === OWNER));
  assert.ok(h.nutrition.every((call) => call.owner === OWNER));
  assert.ok(h.publications.every((call) => call.owner === OWNER));
}

for (const transition of ["owner switch", "provider unmount"]) {
  for (const operation of ["batch create", "edit", "delete", "restore", "library food", "meal template"]) {
    test(`${operation} stops subsequent writes/publications after ${transition} during an SDK write`, async () => {
      const h = harness({
        entries: operation === "restore" ? [] : [food],
        hooks: { afterWrite() {
          if (transition === "owner switch") h.userIdRef.current = "food-owner-b";
          else h.providerActive.current = false;
        } }
      });
      const operations = {
        "batch create": () => h.logFoodEntries([food, { ...food, name: "second" }]),
        edit: () => h.updateFoodLogEntry(food.id, { calories: 600 }),
        delete: () => h.deleteFoodLogEntry(food.id),
        restore: () => h.restoreFoodLogEntry(food),
        "library food": () => h.addFood({ name: "Library oats" }),
        "meal template": () => h.saveMealTemplate({ name: "Template oats" })
      };
      await assert.rejects(operations[operation](), /account changed/i);
      assert.equal(h.writes.length, 1, "no subsequent create, rollback, or compensation");
      assert.equal(h.nutrition.length, 0);
      assertNoNewAccountWork(h);
      assert.deepEqual(h.foods(), []);
      assert.deepEqual(h.templates(), []);
    });
  }
}

test("owner is captured before an entry edit waits in its queue", async () => {
  const held = gate(), started = gate();
  const h = harness({ hooks: { async beforeWrite(call) {
    if (call.method === "update") { started.resolve(); await held.promise; }
  } } });
  const first = h.updateFoodLogEntry(food.id, { calories: 600 });
  const firstRejected = assert.rejects(first, /account changed/i);
  await started.promise;
  const second = h.updateFoodLogEntry(food.id, { calories: 700 });
  const secondRejected = assert.rejects(second, /account changed/i);
  h.userIdRef.current = "food-owner-b";
  held.resolve();
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(h.writes.length, 1);
  assert.equal(h.nutrition.length, 0);
  assertNoNewAccountWork(h);
});

test("owner switch while totals settle never starts old-account compensation", async () => {
  const h = harness({ entries: [], hooks: { afterNutrition() { h.userIdRef.current = "food-owner-b"; } } });
  await assert.rejects(h.logFoodEntry(food), /account changed/i);
  assert.equal(h.writes.length, 1);
  assert.equal(h.nutrition.length, 1);
  assertNoNewAccountWork(h);
});

test("a React updater deferred until after owner switch cannot publish old-account food rows", async () => {
  const held = gate(), started = gate();
  const h = harness({ hooks: { async beforeWrite() { started.resolve(); await held.promise; } } });
  h.deferPublications = true;
  const pending = h.updateFoodLogEntry(food.id, { calories: 600 });
  const rejected = assert.rejects(pending, /account changed/i);
  await started.promise;
  assert.equal(h.deferredPublications.length, 1);
  h.userIdRef.current = "food-owner-b";
  const newRows = [{ ...food, id: "new-account-food", created_by_id: "food-owner-b" }];
  h.setEntries(newRows);
  h.deferPublications = false;
  h.deferredPublications.forEach((publish) => publish());
  assert.deepEqual(h.foodLogEntriesRef.current, newRows);
  held.resolve();
  await rejected;
  assert.deepEqual(h.publications, []);
});

test("cleanup stops between rows if the active owner changes during compensation", async () => {
  const h = harness({ entries: [], hooks: {
    beforeNutrition() { throw failure(); },
    afterWrite(call) { if (call.method === "delete") h.userIdRef.current = "food-owner-b"; }
  } });
  await assert.rejects(h.logFoodEntries([food, { ...food, name: "second" }]), /account changed/i);
  assert.equal(h.writes.filter((call) => call.method === "delete").length, 1);
  assertNoNewAccountWork(h);
});

test("edit and delete serialize the complete operation and delete uses the newly edited snapshot", async () => {
  const held = gate(), started = gate();
  const h = harness({ hooks: { async beforeWrite(call) {
    if (call.method === "update") { started.resolve(); await held.promise; }
  } } });
  const edit = h.updateFoodLogEntry(food.id, { calories: 600 });
  await started.promise;
  const deletion = h.deleteFoodLogEntry(food.id);
  assert.equal(h.writes.length, 1);
  held.resolve();
  const [, removed] = await Promise.all([edit, deletion]);
  assert.equal(removed.calories, 600);
  assert.deepEqual(h.nutrition.map((call) => call.increments.calories), [200, -600]);
  assert.equal(h.total(), 400);
  assert.equal(h.remote.size, 0);
  assert.deepEqual(h.foodLogEntriesRef.current, []);
});

test("successive queued edits calculate their deltas from the last completed edit", async () => {
  const h = harness();
  await Promise.all([
    h.updateFoodLogEntry(food.id, { calories: 600 }),
    h.updateFoodLogEntry(food.id, { calories: 700 })
  ]);
  assert.deepEqual(h.nutrition.map((call) => call.increments.calories), [200, 100]);
  assert.equal(new Set(h.nutrition.map((call) => call.nutritionOperationId)).size, 2);
  assert.equal(h.total(), 1100);
  assert.equal(h.remote.get(food.id).calories, 700);
});

test("queued edits resolve a delete-compensation alias only after the delete finishes", async () => {
  const h = harness({ hooks: { beforeNutrition(call) { if (call.ordinal === 1) throw failure(); } } });
  const removed = h.deleteFoodLogEntry(food.id);
  const rejected = assert.rejects(removed);
  const edit = h.updateFoodLogEntry(food.id, { calories: 700 });
  await rejected;
  const saved = await edit;
  assert.notEqual(saved.id, food.id);
  assert.equal(h.restoredFoodIds.current.get(food.id), saved.id);
  assert.equal(h.writes.at(-1).id, saved.id);
  assert.equal(h.total(), 1100);
});

test("duplicate restore requests share a queue and restore exactly one row and increment", async () => {
  const h = harness({ entries: [] });
  const [first, second] = await Promise.all([h.restoreFoodLogEntry(food), h.restoreFoodLogEntry(food)]);
  assert.equal(first.id, second.id);
  assert.equal(h.remote.size, 1);
  assert.equal(h.nutrition.length, 1);
  assert.equal(h.total(), 1200);
});

test("a refresh merging server-created ids before commit cannot duplicate optimistic replacements", async () => {
  const h = harness({ entries: [], hooks: { afterWrite(call) {
    if (call.method === "create") h.setEntries([...h.remote.values(), ...h.foodLogEntriesRef.current]);
  } } });
  const result = await h.logFoodEntries([food, { ...food, name: "second" }]);
  assert.equal(result.length, 2);
  assert.equal(h.foodLogEntriesRef.current.length, 2);
  assert.equal(new Set(h.foodLogEntriesRef.current.map((row) => row.id)).size, 2);
  assert.ok(h.foodLogEntriesRef.current.every((row) => !row.pending));
});

for (const status of [400, 503]) {
  test(`known ${status} totals failure without ambiguity still compensates created foods`, async () => {
    const h = harness({ entries: [], hooks: { beforeNutrition() { throw failure(status); } } });
    await assert.rejects(h.logFoodEntry(food), (error) => !error.reconciliationRequired);
    assert.equal(h.remote.size, 0);
    assert.equal(h.writes.filter((call) => call.method === "delete").length, 1);
    assert.deepEqual(h.foodLogEntriesRef.current, []);
    assert.equal(h.total(), 800);
  });
}

test("ambiguous created-food totals preserve the row through refresh and block generic discard", async () => {
  const h = harness({ entries: [], hooks: { afterNutrition() { throw failure(0, { ambiguousNutrition: true }); } } });
  await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired && error.ambiguousNutrition);
  const pending = h.foodLogEntriesRef.current[0];
  assert.equal(pending.pending, true);
  assert.equal(pending.reconciliationRequired, true);
  assert.equal(pending.ambiguousNutrition, true);
  assert.equal(h.remote.size, 1);
  assert.equal(h.writes.length, 1, "uncertain totals must not trigger a delete");
  assert.equal(h.total(), 1200);
  h.setFoodLogEntriesCurrent([]); // Execute the production refresh overlay.
  assert.equal(h.foodLogEntriesRef.current[0].ambiguousNutrition, true);
  await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired);
  assert.equal(h.foodLogEntriesRef.current[0].id, pending.id);
  await assert.rejects(h.updateFoodLogEntry(pending.id, { calories: 700 }), (error) => error.reconciliationRequired);
  await assert.rejects(h.deleteFoodLogEntry(pending.id), (error) => error.reconciliationRequired);
  assert.equal(h.writes.length, 1);
  await assert.rejects(h.discardUnsyncedFoodEntries([pending.id]), (error) => error.ambiguousNutrition);
  assert.equal(h.remote.size, 1);
  assert.equal(h.foodRecoveryRows.current.size, 1);
  assert.equal(h.writes.length, 1);
  assert.equal(h.total(), 1200);
});

test("ambiguous edit totals keep the edited row visibly pending and do not roll it back", async () => {
  const h = harness({ hooks: { afterNutrition() { throw failure(0, { ambiguousNutrition: true }); } } });
  await assert.rejects(h.updateFoodLogEntry(food.id, { calories: 600 }), (error) => error.reconciliationRequired);
  assert.equal(h.writes.length, 1);
  assert.equal(h.remote.get(food.id).calories, 600);
  assert.equal(h.foodLogEntriesRef.current[0].calories, 600);
  assert.equal(h.foodLogEntriesRef.current[0].reconciliationRequired, true);
  assert.equal(h.total(), 1000);
});

test("failed edit rollback remains visible and blocks a queued delete instead of pretending recovery succeeded", async () => {
  const h = harness({ hooks: {
    beforeNutrition() { throw failure(); },
    beforeWrite(call) { if (call.method === "update" && call.ordinal === 2) throw failure(); }
  } });
  const edit = h.updateFoodLogEntry(food.id, { calories: 600 });
  const rejected = assert.rejects(edit, (error) => error.reconciliationRequired);
  const deletion = h.deleteFoodLogEntry(food.id);
  const blocked = assert.rejects(deletion, (error) => error.reconciliationRequired);
  await Promise.all([rejected, blocked]);
  assert.equal(h.remote.get(food.id).calories, 600);
  assert.equal(h.foodLogEntriesRef.current[0].reconciliationRequired, true);
  assert.equal(h.writes.filter((call) => call.method === "delete").length, 0);
  assert.equal(h.total(), 800);
});

test("a failed create cleanup remains visible, deduplicated, and blocks additional totals writes", async () => {
  const h = harness({ entries: [], hooks: {
    beforeNutrition() { throw failure(); },
    beforeWrite(call) { if (call.method === "delete") throw failure(); },
    afterWrite(call) {
      if (call.method === "create") h.setEntries([...h.remote.values(), ...h.foodLogEntriesRef.current]);
    }
  } });
  await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired);
  assert.equal(h.remote.size, 1);
  assert.equal(h.foodLogEntriesRef.current.length, 1);
  assert.equal(h.foodLogEntriesRef.current[0].reconciliationRequired, true);
  await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired);
  assert.equal(h.nutrition.length, 1);
  assert.equal(h.total(), 800);
});

test("a delete with committed but ambiguous totals is never compensated with a new food row", async () => {
  const h = harness({ hooks: { afterNutrition() { throw failure(0, { ambiguousNutrition: true }); } } });
  await assert.rejects(h.deleteFoodLogEntry(food.id), (error) => error.reconciliationRequired);
  assert.equal(h.total(), 400);
  assert.equal(h.remote.size, 0);
  assert.equal(h.writes.filter((call) => call.method === "create").length, 0);
  assert.equal(h.foodLogEntriesRef.current[0].reconciliationRequired, true);
  await assert.rejects(h.discardUnsyncedFoodEntries([food.id]), (error) => error.ambiguousNutrition);
  assert.equal(h.total(), 400);
  assert.equal(h.foodLogEntriesRef.current[0].ambiguousNutrition, true);
});

for (const ambiguous of [true, false]) {
  test(`${ambiguous ? "ambiguous delete" : "failed delete recreation"} keeps a recovery marker without recreating uncertain totals`, async () => {
    const h = harness({ hooks: {
      beforeNutrition() { throw failure(503, { ambiguousNutrition: ambiguous }); },
      beforeWrite(call) { if (call.method === "create") throw failure(403); }
    } });
    await assert.rejects(h.deleteFoodLogEntry(food.id), (error) => error.reconciliationRequired);
    assert.equal(h.remote.size, 0);
    assert.equal(h.foodLogEntriesRef.current[0].id, food.id);
    assert.equal(h.foodLogEntriesRef.current[0].pending, true);
    assert.equal(h.foodLogEntriesRef.current[0].reconciliationRequired, true);
    assert.equal(h.writes.filter((call) => call.method === "create").length, ambiguous ? 0 : 1);
    const writeCount = h.writes.length;
    if (ambiguous) {
      await assert.rejects(h.discardUnsyncedFoodEntries([food.id]), (error) => error.ambiguousNutrition);
      assert.equal(h.foodLogEntriesRef.current[0].ambiguousNutrition, true);
      h.setFoodLogEntriesCurrent([]);
      assert.equal(h.foodLogEntriesRef.current[0].ambiguousNutrition, true);
    } else {
      await h.discardUnsyncedFoodEntries([food.id]);
      assert.deepEqual(h.foodLogEntriesRef.current, []);
    }
    assert.equal(h.writes.length, writeCount, "a confirmed remotely deleted recovery marker needs no second delete");
    assert.equal(h.total(), 800);
  });
}

test("foreign-owner entries are rejected even when the SDK has admin-like access", async () => {
  const foreign = { ...food, created_by_id: "food-owner-b" };
  const h = harness({ entries: [foreign] });
  await assert.rejects(h.updateFoodLogEntry(food.id, { calories: 600 }), /account/);
  await assert.rejects(h.deleteFoodLogEntry(food.id), /account/);
  await assert.rejects(h.restoreFoodLogEntry(foreign), /account/);
  await assert.rejects(h.logFoodEntry(foreign), /account/);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.nutrition, []);
});

test("non-itemized meal logging also supplies a nutrition operation id", async () => {
  const h = harness({ itemized: false });
  await h.logMealTemplate({ total_calories: 300, total_protein_g: 15 }, DATE, "dinner");
  assert.equal(h.nutrition.length, 1);
  assert.equal(h.nutrition[0].increments.calories, 300);
  assert.equal(h.writes.length, 0);
});

test("meal templates cannot bypass an existing day-level recovery block", async () => {
  const h = harness({ itemized: false, entries: [{ ...food, pending: true, reconciliationRequired: true, ambiguousNutrition: true }] });
  await assert.rejects(h.logMealTemplate({ total_calories: 300 }, DATE), (error) => error.ambiguousNutrition);
  assert.equal(h.nutrition.length, 0);
  assert.equal(h.writes.length, 0);
});

test("client-only ambiguity and recovery flags never leak into SDK food payloads", async () => {
  const h = harness({ entries: [] });
  await h.logFoodEntry({ ...food, ambiguousNutrition: false, reconciliationRequired: false, pending: false });
  const payload = h.writes[0].data;
  for (const key of ["id", "created_by_id", "pending", "reconciliationRequired", "ambiguousNutrition", "unconfirmedFoodMutation"]) {
    assert.equal(Object.hasOwn(payload, key), false, key);
  }
});

for (const operation of ["create", "update", "delete"]) {
  for (const phase of ["before commit", "after commit"]) {
    test(`${operation} with a lost acknowledgement ${phase} fails closed without blind compensation or retry`, async () => {
      const reject = (call) => { if (call.method === operation) throw failure(503); };
      const h = harness({
        entries: operation === "create" ? [] : [food],
        hooks: phase === "before commit" ? { beforeWrite: reject } : { afterWrite: reject }
      });
      const invoke = {
        create: () => h.logFoodEntry(food),
        update: () => h.updateFoodLogEntry(food.id, { calories: 600 }),
        delete: () => h.deleteFoodLogEntry(food.id)
      };
      await assert.rejects(invoke[operation](), (error) => error.reconciliationRequired && error.unconfirmedFoodMutation === operation);
      assert.equal(h.writes.length, 1, "uncertain entity acknowledgement must not trigger compensation");
      assert.equal(h.nutrition.length, 0, "no totals mutation before the entity write is confirmed");
      const pending = h.foodLogEntriesRef.current.find((row) => row.unconfirmedFoodMutation === operation);
      assert.ok(pending);
      assert.equal(pending.pending, true);
      assert.equal(pending.reconciliationRequired, true);
      if (operation === "create") assert.ok(pending.id.startsWith("food-log-pending-"), "unknown remote id must not be guessed");
      h.setFoodLogEntriesCurrent([...h.remote.values()]);
      assert.ok(h.foodLogEntriesRef.current.some((row) => row.id === pending.id && row.unconfirmedFoodMutation === operation));
      await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired);
      await assert.rejects(h.discardUnsyncedFoodEntries([pending.id]), (error) => error.unconfirmedFoodMutation === operation);
      assert.equal(h.writes.length, 1);
      assert.equal(h.total(), 800);
      if (operation === "delete" && phase === "after commit") assert.equal(h.remote.size, 0);
      if (operation === "update" && phase === "after commit") assert.equal(h.remote.get(food.id).calories, 600);
      if (operation === "create" && phase === "after commit") assert.equal(h.remote.size, 1);
    });
  }
}

test("definitive create rejections may clean up acknowledged batch rows and safely unlock retry", async () => {
  const h = harness({ entries: [], hooks: { beforeWrite(call) {
    if (call.method === "create" && call.ordinal === 2) throw failure(422);
  } } });
  await assert.rejects(h.logFoodEntries([food, { ...food, name: "second" }]), (error) => !error.reconciliationRequired);
  assert.equal(h.remote.size, 0);
  assert.equal(h.foodRecoveryRows.current.size, 0);
  assert.equal(h.nutrition.length, 0);
  await h.logFoodEntry(food);
  assert.equal(h.remote.size, 1);
  assert.equal(h.nutrition.length, 1);
});

test("confirmed noncommit compensation failures still permit explicit discard", async () => {
  let refuseCleanup = true;
  const h = harness({ entries: [], hooks: {
    beforeNutrition() { throw failure(503); },
    beforeWrite(call) { if (call.method === "delete" && refuseCleanup) throw failure(403); }
  } });
  await assert.rejects(h.logFoodEntry(food), (error) => error.reconciliationRequired && !error.unconfirmedFoodMutation);
  const pending = h.foodLogEntriesRef.current[0];
  refuseCleanup = false;
  await h.discardUnsyncedFoodEntries([pending.id]);
  assert.equal(h.remote.size, 0);
  assert.equal(h.total(), 800);
});

test("an in-flight second batch cannot increment totals after the first batch enters uncertain recovery", async () => {
  const aTotalsStarted = gate(), releaseATotals = gate();
  const bCreateStarted = gate(), releaseBCreate = gate();
  const h = harness({ entries: [], hooks: {
    async beforeWrite(call) {
      if (call.method === "create" && call.data.name === "Batch B") {
        bCreateStarted.resolve();
        await releaseBCreate.promise;
      }
    },
    async afterNutrition(call) {
      if (call.ordinal === 1) {
        aTotalsStarted.resolve();
        await releaseATotals.promise;
        throw failure(503, { ambiguousNutrition: true });
      }
    }
  } });
  try {
    const a = h.logFoodEntry({ ...food, name: "Batch A" });
    const aRejected = assert.rejects(a, (error) => error.ambiguousNutrition);
    await aTotalsStarted.promise;
    const b = h.logFoodEntry({ ...food, name: "Batch B" });
    const bRejected = assert.rejects(b, (error) => error.reconciliationRequired);
    await bCreateStarted.promise;
    releaseATotals.resolve();
    await aRejected;
    assert.equal(h.foodRecoveryRows.current.size, 1);
    releaseBCreate.resolve();
    await bRejected;
    assert.equal(h.nutrition.length, 1, "batch B must recheck day readiness immediately before the increment");
    assert.equal(h.total(), 1200, "only batch A's uncertain commit reached totals");
    assert.equal(h.remote.size, 2);
    assert.ok(h.foodLogEntriesRef.current.every((row) => row.pending && row.reconciliationRequired));
    assert.equal(h.writes.filter((call) => call.method === "delete").length, 0,
      "do not compensate uncertain recovery through the normal totals mutation path");
  } finally {
    releaseATotals.resolve();
    releaseBCreate.resolve();
  }
});
