import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

import {
  PLAN_TARGET_FIELDS,
  PlanSettingsError,
  persistPlanSettings,
  planSettingsRevision,
  snapshotPlanTargets
} from "../../src/lib/planSettings.js";
import {
  MANUAL_TARGET_KEYS,
  recalculateTargets
} from "../../src/lib/fitness/recalculate.js";

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const SETTINGS = ["UserProfile", "UserPreferences", "CurrentStrategy"];
const PREFERENCE_ARRAY_FIELDS = ["disliked_strategies", "known_barriers", "safety_flags"];
const TARGET_FIELDS = [
  "calorie_target", "protein_target_g", "carb_target_g", "fat_target_g",
  "step_target", "lifting_days_target", "cardio_days_target", "goal_type",
  "manual_override", "behavior_focus", "weekly_adjustment_rule"
];
const clone = (value) => structuredClone(value);

function fixture() {
  const metadata = {
    created_by_id: OWNER,
    created_by: "owner@example.test",
    created_date: "2026-01-01T00:00:00.000Z",
    updated_date: "2026-01-02T00:00:00.000Z"
  };
  const profile = {
    ...metadata, id: "profile-a", age: 35, sex: "male", height_in: 72,
    current_weight_lbs: 205, goal_weight_lbs: 185, goal: "fat_loss",
    training_days_per_week: 3, cardio_days_per_week: 2,
    job_activity: "lightly_active", average_steps: 6000,
    experience_level: "intermediate", primary_concern: "fat_loss",
    waist_in: 38, onboarding_completed: true, private_note: "Do not change"
  };
  const preferences = {
    ...metadata, id: "preferences-a", tone: "direct", diet_style: "balanced",
    preferred_training: "weights", disliked_strategies: ["fasting"],
    known_barriers: ["time"], safety_flags: [], units: "imperial",
    notifications_enabled: true
  };
  const strategy = {
    ...metadata, id: "strategy-a", ...recalculateTargets(profile, preferences),
    manual_override: false, behavior_focus: "Keep my current coaching focus.",
    weekly_adjustment_rule: "Keep my current adjustment rule.",
    confidence: "high", version: 7
  };
  return { profile, preferences, strategy };
}

// A full ledger catches collateral writes as well as incorrect target values.
// Only server-maintained settings timestamps may differ after compensation.
function ledgerSnapshot(sdk, { ignoreSettingsTimestamps = false } = {}) {
  const snapshot = clone(sdk.data);
  if (ignoreSettingsTimestamps) {
    for (const name of SETTINGS) {
      for (const row of snapshot[name]) delete row.updated_date;
    }
  }
  return snapshot;
}

function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    // SDK EntityFilterValue documents bare arrays as $in shorthand, not $eq.
    const anyOf = (candidates) => candidates.some((candidate) =>
      isDeepStrictEqual(row[key], candidate)
      || (Array.isArray(row[key]) && row[key].some((value) => isDeepStrictEqual(value, candidate)))
    );
    if (Array.isArray(expected)) return anyOf(expected);
    if (expected && typeof expected === "object" && Object.keys(expected).some((operator) => operator.startsWith("$"))) {
      return Object.entries(expected).every(([operator, operand]) => {
        switch (operator) {
          case "$exists": return Object.hasOwn(row, key) === operand;
          case "$eq": return isDeepStrictEqual(row[key], operand);
          case "$in": return anyOf(operand);
          default: assert.fail(`Unsupported fake query operator: ${operator}`);
        }
      });
    }
    return isDeepStrictEqual(row[key], expected);
  });
}

/**
 * In-memory SDK with Base44's get/updateMany result shapes. Reads return detached
 * snapshots. Matching and mutation have no await between them, modeling CAS.
 * Hooks run outside that atomic boundary to inject specific cross-tab races.
 * There is deliberately no fake RLS: even an admin must be scoped by the helper.
 */
function fakeSdk(expected = fixture(), hooks = {}) {
  const data = Object.fromEntries(SETTINGS.map((name, index) => {
    const row = clone(expected[["profile", "preferences", "strategy"][index]]);
    return [name, [row, { ...clone(row), id: `${row.id}-foreign`, created_by_id: OTHER_OWNER }]];
  }));
  Object.assign(data, {
    User: [{ id: OWNER, role: "user", email: "owner@example.test", full_name: "Account Name" }],
    PremiumEntitlement: [{ id: "premium-a", created_by_id: OWNER, active: true }],
    DailyLog: [{ id: "log-a", created_by_id: OWNER, date: "2026-01-02", calories: 2100 }],
    WeeklyCheckIn: [{ id: "check-in-a", created_by_id: OWNER, weight_lbs: 205 }],
    TrainingSession: [{ id: "session-a", created_by_id: OWNER, sets: [{ reps: 8, weight_lbs: 100 }] }],
    FoodLog: [{ id: "food-a", created_by_id: OWNER, food_name: "Oats", calories: 300 }]
  });
  const reads = [], writes = [];
  let tick = 0;
  const sdk = {
    data, reads, writes,
    row: (name) => data[name][0],
    entities: Object.fromEntries(SETTINGS.map((name) => [name, {
      async get(id) {
        const call = { name, id, ordinal: reads.filter((entry) => entry.name === name).length + 1 };
        reads.push(call);
        await hooks.beforeGet?.(call, sdk);
        const row = data[name].find((entry) => entry.id === id);
        if (!row) throw new Error(`Missing ${name}/${id}`);
        const result = clone(row);
        await hooks.afterGet?.(call, sdk);
        return result;
      },
      async updateMany(query, operations) {
        const call = {
          name, query: clone(query), operations: clone(operations),
          ordinal: writes.filter((entry) => entry.name === name).length + 1
        };
        writes.push(call);
        const injected = await hooks.beforeWrite?.(call, sdk);
        if (injected !== undefined) return injected;
        assert.ok(Object.keys(operations).length > 0);
        assert.ok(Object.keys(operations).every((key) => ["$set", "$unset"].includes(key)));
        const rows = data[name].filter((row) => matches(row, query));
        for (const row of rows) {
          Object.assign(row, clone(operations.$set ?? {}));
          for (const key of Object.keys(operations.$unset ?? {})) delete row[key];
          row.updated_date = new Date(Date.UTC(2026, 0, 3, 0, 0, ++tick)).toISOString();
        }
        call.updated = rows.length;
        await hooks.afterWrite?.(call, sdk);
        return { success: true, updated: rows.length };
      }
    }]))
  };
  // Any access outside the three settings entities is a test failure, even reads.
  for (const name of Object.keys(data).filter((entry) => !SETTINGS.includes(entry))) {
    Object.defineProperty(sdk.entities, name, {
      get() { assert.fail(`Plan save must not access ${name}`); }
    });
  }
  return sdk;
}

function save(sdk, expected, profile = { goal: "lean_bulk" }, preferences = { tone: "analytical" }, options) {
  return persistPlanSettings(sdk.entities, OWNER, expected, profile, preferences, options);
}

async function rejectedSave(promise, { conflict, reconciliationRequired } = {}) {
  let failure;
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof PlanSettingsError);
    if (conflict !== undefined) assert.equal(error.conflict, conflict);
    if (reconciliationRequired !== undefined) assert.equal(error.reconciliationRequired, reconciliationRequired);
    failure = error;
    return true;
  });
  return failure;
}

function assertRestored(sdk, before) {
  assert.deepEqual(ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true }), before);
}

test("fake SDK atomically rejects stale fields, owners, timestamps, and missing-field assumptions", async () => {
  const sdk = fakeSdk();
  const row = sdk.row("UserProfile");
  const before = ledgerSnapshot(sdk);
  for (const mismatch of [
    { created_by_id: OTHER_OWNER }, { age: 99 }, { updated_date: "stale" },
    { goal_weight_lbs: { $exists: false } }
  ]) {
    assert.deepEqual(await sdk.entities.UserProfile.updateMany(
      { id: row.id, ...mismatch }, { $set: { age: 50 } }
    ), { success: true, updated: 0 });
  }
  assert.deepEqual(ledgerSnapshot(sdk), before);
  assert.deepEqual(await sdk.entities.UserProfile.updateMany(
    { id: row.id, created_by_id: OWNER, missing: { $exists: false } },
    { $set: { age: 36 }, $unset: { goal_weight_lbs: "" } }
  ), { success: true, updated: 1 });
  assert.equal(row.age, 36);
  assert.equal(Object.hasOwn(row, "goal_weight_lbs"), false);
  const detached = await sdk.entities.UserProfile.get(row.id);
  detached.age = 100;
  assert.equal(row.age, 36);
});

test("fake filters distinguish bare-array any-of from explicit exact-array $eq, including empty arrays", () => {
  for (const expression of [["fasting", "other"], { $in: ["fasting", "other"] }]) {
    assert.equal(matches({ value: "fasting" }, { value: expression }), true);
    assert.equal(matches({ value: ["fasting", "extra"] }, { value: expression }), true);
    assert.equal(matches({ value: ["unrelated"] }, { value: expression }), false);
  }
  assert.equal(matches({ value: [] }, { value: [] }), false, "empty any-of matches nothing");
  assert.equal(matches({ value: [] }, { value: { $in: [] } }), false);
  assert.equal(matches({ value: [] }, { value: { $eq: [] } }), true);
  assert.equal(matches({ value: ["fasting"] }, { value: { $eq: [] } }), false);
  assert.equal(matches({}, { value: { $eq: [] } }), false);
  assert.equal(matches({ value: ["fasting", "time"] }, { value: { $eq: ["fasting", "time"] } }), true);
  assert.equal(matches({ value: ["time", "fasting"] }, { value: { $eq: ["fasting", "time"] } }), false);
  assert.equal(matches({ value: ["fasting", "time", "extra"] }, { value: { $eq: ["fasting", "time"] } }), false);
});

for (const field of PREFERENCE_ARRAY_FIELDS) {
  for (const initiallyEmpty of [true, false]) {
    for (const compensate of [false, true]) {
      test(`${field} ${initiallyEmpty ? "empty" : "populated"} array CAS uses $eq for every preference list${compensate ? " during save and compensation" : " during save"}`, async () => {
        const expected = fixture();
        expected.preferences[field] = initiallyEmpty ? [] : ["first", "second"];
        const patch = { [field]: initiallyEmpty ? ["new value"] : [] };
        const sdk = fakeSdk(expected, {
          beforeWrite(call) {
            if (compensate && call.name === "CurrentStrategy") return { success: false, updated: 0 };
          }
        });
        const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
        if (compensate) {
          await rejectedSave(save(sdk, expected, undefined, patch), { conflict: true, reconciliationRequired: false });
          assertRestored(sdk, before);
        } else {
          const result = await save(sdk, expected, undefined, patch);
          assert.deepEqual(result.preferences[field], patch[field]);
        }
        const writes = sdk.writes.filter((call) => call.name === "UserPreferences");
        assert.equal(writes.length, compensate ? 2 : 1);
        const snapshots = [expected.preferences, { ...expected.preferences, ...patch }];
        for (const [index, call] of writes.entries()) {
          assert.equal(call.updated, 1);
          for (const arrayField of PREFERENCE_ARRAY_FIELDS) {
            assert.deepEqual(call.query[arrayField], { $eq: snapshots[index][arrayField] }, arrayField);
          }
        }
      });
    }
  }
}

for (const field of PREFERENCE_ARRAY_FIELDS) {
  test(`${field} CAS rejects a concurrent list extension even when an original element still matches`, async () => {
    const expected = fixture();
    for (const arrayField of PREFERENCE_ARRAY_FIELDS) expected.preferences[arrayField] = ["retained"];
    const sdk = fakeSdk(expected, {
      beforeWrite(call, fake) {
        if (call.name === "UserPreferences" && call.ordinal === 1) {
          fake.row("UserPreferences")[field].push("cross-tab addition");
        }
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    before.UserPreferences[0][field].push("cross-tab addition");
    await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: false });
    assertRestored(sdk, before);
    assert.equal(sdk.writes.find((call) => call.name === "UserPreferences").updated, 0);
  });
}

test("goal, biometric, and preference changes save together without touching the rest of the ledger", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  const before = ledgerSnapshot(sdk);
  const profilePatch = { goal: "lean_bulk", current_weight_lbs: 215, height_in: 72.4, average_steps: 8000 };
  const preferencePatch = { tone: "analytical", safety_flags: ["medical guidance"] };
  const result = await save(sdk, expected, profilePatch, preferencePatch);
  const profile = { ...expected.profile, ...profilePatch, primary_concern: "muscle_gain" };
  const preferences = { ...expected.preferences, ...preferencePatch };
  const strategy = {
    ...expected.strategy, ...recalculateTargets(profile, preferences),
    manual_override: false, behavior_focus: expected.strategy.behavior_focus,
    weekly_adjustment_rule: expected.strategy.weekly_adjustment_rule
  };
  for (const [name, row] of [["UserProfile", profile], ["UserPreferences", preferences], ["CurrentStrategy", strategy]]) {
    before[name][0] = { ...row, updated_date: sdk.row(name).updated_date };
  }
  assert.deepEqual(ledgerSnapshot(sdk), before);
  assert.deepEqual(result, {
    profile: clone(sdk.row("UserProfile")), preferences: clone(sdk.row("UserPreferences")),
    strategy: clone(sdk.row("CurrentStrategy")), previousStrategy: expected.strategy
  });
  assert.deepEqual(sdk.writes.map((call) => call.name), SETTINGS);
  assert.ok(sdk.writes.every((call) => call.query.created_by_id === OWNER && call.updated === 1));
  assert.deepEqual(expected, fixture(), "caller snapshots must not be mutated");
});

test("manual mode preserves all five custom targets while goal and training targets change", async () => {
  const expected = fixture();
  Object.assign(expected.strategy, {
    manual_override: true, calorie_target: 2345, protein_target_g: 177,
    carb_target_g: 245, fat_target_g: 73, step_target: 9123
  });
  const sdk = fakeSdk(expected);
  const result = await save(sdk, expected, { goal: "maintenance", current_weight_lbs: 220, training_days_per_week: 1 });
  for (const key of MANUAL_TARGET_KEYS) assert.equal(result.strategy[key], expected.strategy[key], key);
  assert.equal(result.strategy.manual_override, true);
  assert.equal(result.strategy.goal_type, "maintenance");
  assert.equal(result.strategy.lifting_days_target, 1);
  const strategyWrite = sdk.writes.find((call) => call.name === "CurrentStrategy");
  for (const key of MANUAL_TARGET_KEYS) assert.equal(Object.hasOwn(strategyWrite.operations.$set, key), false);
});

for (const freshManual of [true, false]) {
  test(`fresh cross-tab manual toggle to ${freshManual} controls preservation, not stale expected state`, async () => {
    const expected = fixture();
    expected.strategy.manual_override = !freshManual;
    const sdk = fakeSdk(expected);
    Object.assign(sdk.row("CurrentStrategy"), {
      manual_override: freshManual, calorie_target: 2777, protein_target_g: 199,
      carb_target_g: 299, fat_target_g: 89, step_target: 12345
    });
    const fresh = clone(sdk.row("CurrentStrategy"));
    const result = await save(sdk, expected);
    assert.equal(result.strategy.manual_override, freshManual);
    const computed = recalculateTargets(result.profile, result.preferences);
    for (const key of MANUAL_TARGET_KEYS) {
      assert.equal(result.strategy[key], freshManual ? fresh[key] : computed[key], key);
    }
    assert.deepEqual(result.previousStrategy, fresh);
  });
}

for (const changedField of TARGET_FIELDS) {
  test(`a ${changedField} change after fresh read rejects stale strategy CAS, even at the same timestamp`, async () => {
    const expected = fixture();
    const nextValue = typeof expected.strategy[changedField] === "number"
      ? expected.strategy[changedField] + 1
      : typeof expected.strategy[changedField] === "boolean" ? !expected.strategy[changedField] : "cross-tab";
    const sdk = fakeSdk(expected, {
      beforeWrite(call, fake) {
        if (call.name === "CurrentStrategy" && call.ordinal === 1) {
          fake.row("CurrentStrategy")[changedField] = nextValue;
        }
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    before.CurrentStrategy[0][changedField] = nextValue;
    await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: false });
    assertRestored(sdk, before);
    assert.equal(sdk.writes.find((call) => call.name === "CurrentStrategy").updated, 0);
    assert.deepEqual(sdk.writes.map((call) => call.name), [
      "UserProfile", "UserPreferences", "CurrentStrategy", "UserPreferences", "UserProfile"
    ]);
  });
}

for (const failedStage of SETTINGS) {
  test(`a rejected ${failedStage} write compensates earlier stages in reverse order`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected, {
      beforeWrite(call) {
        if (call.name === failedStage && call.ordinal === 1) return { success: false, updated: 0 };
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: false });
    assertRestored(sdk, before);
    const earlierStages = SETTINGS.slice(0, SETTINGS.indexOf(failedStage));
    assert.deepEqual(sdk.writes.map((call) => call.name), [...earlierStages, failedStage, ...earlierStages.reverse()]);
    for (const call of sdk.writes.filter((entry) => entry.ordinal === 2)) {
      const original = expected[["profile", "preferences", "strategy"][SETTINGS.indexOf(call.name)]];
      assert.notEqual(call.query.updated_date, original.updated_date, "rollback must not reuse the old timestamp");
    }
  });

  test(`a thrown ${failedStage} write that never committed restores earlier settings without false reconciliation`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected, {
      beforeWrite(call) {
        if (call.name === failedStage && call.ordinal === 1) throw new Error("network unavailable before commit");
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    await rejectedSave(save(sdk, expected), { conflict: false, reconciliationRequired: false });
    assertRestored(sdk, before);
  });

  test(`a lost response after ${failedStage} commits recovers that stage as well as earlier stages`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected, {
      afterWrite(call) {
        if (call.name === failedStage && call.ordinal === 1) throw new Error("response lost after commit");
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    const error = await rejectedSave(save(sdk, expected), { conflict: false, reconciliationRequired: false });
    assert.match(error.message, /previous settings were restored/i);
    assertRestored(sdk, before);
    const attempted = SETTINGS.slice(0, SETTINGS.indexOf(failedStage) + 1);
    assert.deepEqual(sdk.writes.map((call) => call.name), [...attempted, ...attempted.reverse()]);
    assert.ok(sdk.writes.every((call) => call.updated === 1));
  });

  test(`failure to read back committed ${failedStage} also compensates the full ledger`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected, {
      beforeGet(call) {
        if (call.name === failedStage && call.ordinal === 2) throw new Error("read-back unavailable");
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    await rejectedSave(save(sdk, expected), { reconciliationRequired: false });
    assertRestored(sdk, before);
  });
}

test("compensation never overwrites a concurrent profile edit and still restores other stages", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected, {
    beforeWrite(call, fake) {
      if (call.name === "CurrentStrategy") {
        fake.row("UserProfile").age = 41;
        return { success: false, updated: 0 };
      }
    }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  before.UserProfile[0] = { ...before.UserProfile[0], age: 41, goal: "lean_bulk", primary_concern: "muscle_gain" };
  await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: true });
  assertRestored(sdk, before);
  assert.equal(sdk.writes.filter((call) => call.name === "UserProfile").length, 1,
    "do not even attempt compensation of a row already known to have a newer edit");
});

test("rollback failure is surfaced and does not stop compensation of earlier stages", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected, {
    beforeWrite(call) {
      if (call.name === "CurrentStrategy") return { success: false, updated: 0 };
      if (call.name === "UserPreferences" && call.ordinal === 2) throw new Error("recovery offline");
    }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  before.UserPreferences[0].tone = "analytical";
  const error = await rejectedSave(save(sdk, expected), { reconciliationRequired: true });
  assert.match(error.message, /refresh your data/i);
  assertRestored(sdk, before);
});

test("clearing optional goal weight uses $unset rather than storing null", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  const result = await save(sdk, expected, { goal_weight_lbs: null }, {});
  assert.equal(Object.hasOwn(result.profile, "goal_weight_lbs"), false);
  const write = sdk.writes.find((call) => call.name === "UserProfile");
  assert.deepEqual(write.operations, { $unset: { goal_weight_lbs: "" } });
  assert.equal(result.strategy.protein_target_g, Math.round(expected.profile.current_weight_lbs * 0.85));
});

for (const initiallyPresent of [true, false]) {
  test(`goal weight ${initiallyPresent ? "removal" : "addition"} is restored with the original field presence on failure`, async () => {
    const expected = fixture();
    if (!initiallyPresent) delete expected.profile.goal_weight_lbs;
    const sdk = fakeSdk(expected, {
      beforeWrite(call) {
        if (call.name === "CurrentStrategy") return { success: false, updated: 0 };
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    await rejectedSave(save(sdk, expected, { goal_weight_lbs: initiallyPresent ? null : 180 }, {}), {
      reconciliationRequired: false
    });
    assertRestored(sdk, before);
    const [forward, reverse] = sdk.writes.filter((call) => call.name === "UserProfile");
    if (initiallyPresent) {
      assert.deepEqual(reverse.query.goal_weight_lbs, { $exists: false });
      assert.equal(reverse.operations.$set.goal_weight_lbs, 185);
    } else {
      assert.deepEqual(forward.query.goal_weight_lbs, { $exists: false });
      assert.deepEqual(reverse.operations.$unset, { goal_weight_lbs: "" });
    }
  });
}

for (const role of ["user", "admin"]) {
  for (const foreignStage of SETTINGS) {
    test(`${role} cannot save a freshly read ${foreignStage} owned by another account`, async () => {
      const expected = fixture();
      const sdk = fakeSdk(expected);
      sdk.data.User[0].role = role;
      sdk.row(foreignStage).created_by_id = OTHER_OWNER;
      const before = ledgerSnapshot(sdk);
      const error = await rejectedSave(save(sdk, expected));
      assert.match(error.message, /owner/i);
      assert.equal(sdk.writes.length, 0);
      assert.deepEqual(ledgerSnapshot(sdk), before);
    });
  }
}

test("owner change between fresh read and write cannot be bypassed by an admin", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected, {
    beforeWrite(call, fake) {
      if (call.name === "UserProfile") fake.row("UserProfile").created_by_id = OTHER_OWNER;
    }
  });
  sdk.data.User[0].role = "admin";
  const before = ledgerSnapshot(sdk);
  before.UserProfile[0].created_by_id = OTHER_OWNER;
  await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: false });
  assert.deepEqual(ledgerSnapshot(sdk), before);
  assert.equal(sdk.writes[0].query.created_by_id, OWNER);
});

test("snapshotPlanTargets returns the full target ledger, including coaching and manual fields, without metadata", () => {
  const strategy = fixture().strategy;
  assert.deepEqual(PLAN_TARGET_FIELDS, TARGET_FIELDS);
  assert.deepEqual(snapshotPlanTargets(strategy), Object.fromEntries(TARGET_FIELDS.map((key) => [key, strategy[key]])));
  assert.deepEqual(snapshotPlanTargets(undefined), {});
  assert.deepEqual(snapshotPlanTargets({ manual_override: false, lifting_days_target: 0, cardio_days_target: 1 }), {
    lifting_days_target: 0, cardio_days_target: 1, manual_override: false
  });
});

test("draft revision changes for every target field but ignores account metadata and historical records", () => {
  const expected = fixture();
  const revision = planSettingsRevision(expected.profile, expected.preferences, expected.strategy);
  assert.match(revision, /^v1:[a-f0-9]{16}$/);
  for (const key of TARGET_FIELDS) {
    assert.notEqual(planSettingsRevision(expected.profile, expected.preferences, {
      ...expected.strategy, [key]: `different-${key}`
    }), revision, key);
  }
  assert.notEqual(planSettingsRevision({ ...expected.profile, age: 36 }, expected.preferences, expected.strategy), revision);
  assert.notEqual(planSettingsRevision(expected.profile, { ...expected.preferences, safety_flags: ["new"] }, expected.strategy), revision);
  assert.equal(planSettingsRevision(
    { ...expected.profile, updated_date: "new", private_note: "changed" },
    { ...expected.preferences, units: "metric" },
    { ...expected.strategy, updated_date: "new", confidence: "low" }
  ), revision);
});

for (const days of [0, 1]) {
  test(`${days} lifting days survives both pure recalculation and coordinated persistence`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected);
    const profile = { ...expected.profile, training_days_per_week: days, cardio_days_per_week: 0 };
    assert.equal(recalculateTargets(profile).lifting_days_target, days);
    const result = await save(sdk, expected, { training_days_per_week: days, cardio_days_per_week: 0 }, {});
    assert.equal(result.profile.training_days_per_week, days);
    assert.equal(result.strategy.lifting_days_target, days);
    assert.equal(result.strategy.cardio_days_target, 0);
  });
}

test("account guard rejects a changed account after fresh reads, before any writes", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  const before = ledgerSnapshot(sdk);
  const accountChanged = new Error("Account changed");
  await assert.rejects(save(sdk, expected, undefined, undefined, {
    assertActive() { throw accountChanged; }
  }), (error) => error === accountChanged);
  assert.equal(sdk.reads.length, 3);
  assert.equal(sdk.writes.length, 0);
  assert.deepEqual(ledgerSnapshot(sdk), before);
});

test("account switch after a committed stage stops further writes and flags reconciliation", async () => {
  const expected = fixture();
  let active = true;
  const sdk = fakeSdk(expected, {
    afterWrite() { active = false; }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  before.UserProfile[0] = { ...before.UserProfile[0], goal: "lean_bulk", primary_concern: "muscle_gain" };
  await rejectedSave(save(sdk, expected, undefined, undefined, {
    assertActive() { if (!active) throw new Error("Account changed"); }
  }), { reconciliationRequired: true });
  assert.equal(sdk.writes.length, 1, "must not compensate using a different active account");
  assertRestored(sdk, before);
});

test("account switch during the final strategy read-back must not report another account's save as successful", async () => {
  const expected = fixture();
  let active = true;
  const sdk = fakeSdk(expected, {
    afterGet(call) {
      if (call.name === "CurrentStrategy" && call.ordinal === 2) active = false;
    }
  });
  await rejectedSave(save(sdk, expected, undefined, undefined, {
    assertActive() { if (!active) throw new Error("Account changed during final read-back"); }
  }), { reconciliationRequired: true });
  assert.equal(sdk.writes.length, 3, "do not recover old settings through the new account");
});

test("account switch during a recovery read must stop the following compensation write", async () => {
  const expected = fixture();
  let active = true;
  const sdk = fakeSdk(expected, {
    beforeWrite(call) {
      if (call.name === "CurrentStrategy") return { success: false, updated: 0 };
    },
    afterGet(call) {
      if (call.name === "UserProfile" && call.ordinal === 3) active = false;
    }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  Object.assign(before.UserProfile[0], { goal: "lean_bulk", primary_concern: "muscle_gain" });
  const error = await rejectedSave(save(sdk, expected, undefined, undefined, {
    assertActive() { if (!active) throw new Error("Account changed during recovery read"); }
  }));
  assert.equal(sdk.writes.filter((call) => call.name === "UserProfile").length, 1,
    "the new account must not restore the previous account's row");
  assert.equal(error.reconciliationRequired, true);
  assertRestored(sdk, before);
});

test("a race after the recovery read is rejected by the compensation CAS", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected, {
    beforeWrite(call, fake) {
      if (call.name === "CurrentStrategy") return { success: false, updated: 0 };
      if (call.name === "UserProfile" && call.ordinal === 2) fake.row("UserProfile").age = 42;
    }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  Object.assign(before.UserProfile[0], { age: 42, goal: "lean_bulk", primary_concern: "muscle_gain" });
  await rejectedSave(save(sdk, expected), { reconciliationRequired: true });
  assertRestored(sdk, before);
  assert.equal(sdk.writes.at(-1).updated, 0);
});

test("owner change during recovery never restores a row now owned by someone else", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected, {
    beforeWrite(call, fake) {
      if (call.name === "CurrentStrategy") {
        fake.row("UserPreferences").created_by_id = OTHER_OWNER;
        return { success: false, updated: 0 };
      }
    }
  });
  const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
  Object.assign(before.UserPreferences[0], { tone: "analytical", created_by_id: OTHER_OWNER });
  await rejectedSave(save(sdk, expected), { reconciliationRequired: true });
  assertRestored(sdk, before);
  assert.equal(sdk.writes.filter((call) => call.name === "UserPreferences").length, 1);
});

for (const [name, field, value] of [
  ["UserProfile", "age", 42],
  ["UserPreferences", "known_barriers", ["cross-tab barrier"]]
]) {
  test(`an untouched ${name} field changed after fresh read rejects the whole-row CAS`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected, {
      beforeWrite(call, fake) {
        if (call.name === name && call.ordinal === 1) fake.row(name)[field] = clone(value);
      }
    });
    const before = ledgerSnapshot(sdk, { ignoreSettingsTimestamps: true });
    before[name][0][field] = clone(value);
    await rejectedSave(save(sdk, expected), { conflict: true, reconciliationRequired: false });
    assertRestored(sdk, before);
    assert.equal(sdk.writes.find((call) => call.name === name).updated, 0);
  });
}

for (const [name, field, nextValue, profilePatch, preferencePatch] of [
  ["UserProfile", "current_weight_lbs", 210, { current_weight_lbs: 220 }, {}],
  ["UserPreferences", "tone", "encouraging", {}, { tone: "analytical" }]
]) {
  test(`stale expected ${name} field conflicts before any writes`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected);
    sdk.row(name)[field] = nextValue;
    const before = ledgerSnapshot(sdk);
    await rejectedSave(save(sdk, expected, profilePatch, preferencePatch), {
      conflict: true, reconciliationRequired: false
    });
    assert.equal(sdk.writes.length, 0);
    assert.deepEqual(ledgerSnapshot(sdk), before);
  });

  test(`an already-applied ${name} patch does not spuriously conflict with stale expected values`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected);
    const patch = name === "UserProfile" ? profilePatch : preferencePatch;
    sdk.row(name)[field] = patch[field];
    await save(sdk, expected, profilePatch, preferencePatch);
    assert.equal(sdk.row(name)[field], patch[field]);
    assert.equal(sdk.writes.some((call) => call.name === name), false);
  });
}

test("fresh unrelated profile and preference answers are preserved and used for recalculation", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  sdk.row("UserProfile").current_weight_lbs = 230;
  sdk.row("UserPreferences").safety_flags = ["clinical supervision"];
  const result = await save(sdk, expected);
  assert.equal(result.profile.current_weight_lbs, 230);
  assert.deepEqual(result.preferences.safety_flags, ["clinical supervision"]);
  const computed = recalculateTargets(result.profile, result.preferences);
  for (const key of MANUAL_TARGET_KEYS) assert.equal(result.strategy[key], computed[key], key);
});

test("explicit reset recalculates manual targets and replaces coaching rules", async () => {
  const expected = fixture();
  expected.strategy.manual_override = true;
  expected.strategy.calorie_target = 3333;
  const sdk = fakeSdk(expected);
  const result = await save(sdk, expected, { goal: "maintenance" }, {}, {
    keepCustomTargets: false, resetPlan: true
  });
  assert.deepEqual(snapshotPlanTargets(result.strategy), {
    ...recalculateTargets(result.profile, result.preferences), manual_override: false
  });
});

test("explicit reset refuses a stale expected target snapshot before touching any records", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  sdk.row("CurrentStrategy").step_target += 100;
  const before = ledgerSnapshot(sdk);
  await rejectedSave(save(sdk, expected, undefined, undefined, { keepCustomTargets: false, resetPlan: true }), {
    conflict: true, reconciliationRequired: false
  });
  assert.equal(sdk.writes.length, 0);
  assert.deepEqual(ledgerSnapshot(sdk), before);
});

test("a no-op save does not issue writes or rewrite coaching state", async () => {
  const expected = fixture();
  const sdk = fakeSdk(expected);
  const before = ledgerSnapshot(sdk);
  const result = await save(sdk, expected, {}, {});
  assert.equal(sdk.writes.length, 0);
  assert.deepEqual(ledgerSnapshot(sdk), before);
  assert.deepEqual(result.profile, expected.profile);
});

for (const [profilePatch, preferencePatch] of [
  [{ current_weight_lbs: 0 }, {}], [{ training_days_per_week: 8 }, {}],
  [{ goal: "unknown" }, {}], [{ goal_weight_lbs: 10 }, {}],
  [{ created_by_id: OTHER_OWNER }, {}], [{}, { role: "admin" }],
  [{}, { tone: "invalid" }], [{}, { safety_flags: "not an array" }]
]) {
  test(`invalid or non-allowlisted settings are rejected without writes: ${JSON.stringify([profilePatch, preferencePatch])}`, async () => {
    const expected = fixture();
    const sdk = fakeSdk(expected);
    const before = ledgerSnapshot(sdk);
    await rejectedSave(save(sdk, expected, profilePatch, preferencePatch));
    assert.equal(sdk.writes.length, 0);
    assert.deepEqual(ledgerSnapshot(sdk), before);
  });
}
