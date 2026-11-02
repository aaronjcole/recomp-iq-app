import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES, PREMIUM_TESTER_ACCESS } from "./support/fixtures.js";
import { ONBOARDING_DRAFT_PREFIX } from "../../src/lib/onboardingDraft.js";
import { recalculateTargets, MANUAL_TARGET_KEYS } from "../../src/lib/fitness/recalculate.js";

// Refresh/resume and Premium checks intentionally load multiple documents.
test.describe.configure({ timeout: 60000 });

const initialKey = (userId = AUTH_USER.id) => `${ONBOARDING_DRAFT_PREFIX}${userId}`;
const redoKey = (userId = AUTH_USER.id) => `${initialKey(userId)}:redo`;
const SETUP_IDS = { UserProfile: "profile-1", UserPreferences: "prefs-1", CurrentStrategy: "strategy-1" };
const PAID_ACCESS = {
  ...PREMIUM_TESTER_ACCESS,
  testerAccess: false,
  products: ["recompone_premium"],
  sources: ["apple_store"]
};
const guards = new WeakMap();

function accountEntities({ manual = false } = {}) {
  // The smoke fixtures intentionally omit required onboarding answers. Use a
  // complete, non-default profile so prefilling cannot pass on defaults alone.
  return {
    ...structuredClone(ENTITY_FIXTURES),
    UserProfile: [{
      id: SETUP_IDS.UserProfile, goal: "body_recomposition", age: 37, sex: "female",
      height_in: 65, current_weight_lbs: 164, goal_weight_lbs: 155,
      job_activity: "moderately_active", average_steps: 6500,
      training_days_per_week: 4, cardio_days_per_week: 0,
      experience_level: "intermediate", primary_concern: "body_recomp"
    }],
    UserPreferences: [{
      id: SETUP_IDS.UserPreferences, tone: "analytical", diet_style: "Mediterranean",
      preferred_training: "Upper-lower", disliked_strategies: ["Long cardio"],
      known_barriers: ["Limited time"], safety_flags: ["medication"],
      notification_preferences: { weekly_check_in: false }
    }],
    CurrentStrategy: [{
      id: SETUP_IDS.CurrentStrategy, goal_type: "body_recomposition",
      calorie_target: 2711, protein_target_g: 181, carb_target_g: 301,
      fat_target_g: 81, step_target: 12345, lifting_days_target: 4,
      cardio_days_target: 0, manual_override: manual,
      behavior_focus: "Keep the existing focus", weekly_adjustment_rule: "Small changes only"
    }],
    // Non-empty sentinels catch accidental resets that an empty fixture misses.
    Recipe: [{ id: "recipe-redo-sentinel", name: "Saved oats", servings: 2, calories: 310 }],
    MealTemplate: [{ id: "template-redo-sentinel", name: "Usual breakfast", meal: "breakfast" }],
    TrainingBlock: [{ id: "block-redo-sentinel", status: "active", completed_sessions: "[]" }],
    PremiumEntitlement: [{
      id: "entitlement-redo-sentinel", owner_id: AUTH_USER.id,
      product_id: "recompone_premium", source: "apple_store", status: "active",
      external_transaction_id: "original-purchase-preserved"
    }]
  };
}

async function installRedoAccount(page, options = {}) {
  const mock = await installAuthenticatedBase44(page, {
    entities: accountEntities(options), premiumAccess: PAID_ACCESS
  });
  const before = structuredClone(mock.entities);
  const requests = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/apps/")) return;
    let body = null;
    try { body = request.postDataJSON(); } catch { /* Non-JSON auth writes must still be recorded. */ }
    requests.push({
      method: request.method(), path,
      entity: /\/entities\/([^/]+)/.exec(path)?.[1],
      id: /\/entities\/[^/]+\/([^/]+)/.exec(path)?.[1],
      functionName: /\/functions\/([^/]+)/.exec(path)?.[1],
      body
    });
  });
  const state = { ...mock, before, requests, assertNoPageErrors: watchPageErrors(page) };
  guards.set(page, state);
  return state;
}

const entityWrites = (state) => state.requests.filter((request) =>
  request.entity && !["GET", "HEAD", "OPTIONS"].includes(request.method)
);
const ownRow = (state, name) => state.entities[name].find((row) => row.id === SETUP_IDS[name]);
const withoutUpdateTimestamps = (rows) => rows.map(({ updated_date: _updatedDate, ...row }) => row);

function assertOnlySetupWrites(state) {
  expect(entityWrites(state).filter((request) => ["PremiumEntitlement", "User"].includes(request.entity)),
    "zero entitlement or User writes, including attempted writes").toEqual([]);
  for (const request of entityWrites(state)) {
    if (request.entity === "DecisionLedger") {
      expect(request.method, "decision history may only be appended").toBe("POST");
    } else {
      expect(Object.keys(SETUP_IDS), `unexpected write: ${request.path}`).toContain(request.entity);
      expect(request.method, "redo uses guarded SDK updates, never recreates setup rows").toBe("PATCH");
      expect(request.id).toBe("update-many");
      expect(request.body.query).toMatchObject({ id: SETUP_IDS[request.entity], created_by_id: state.user.id });
      expect(Object.keys(request.body.query).length, "CAS must include persisted field snapshots, not only owner/id").toBeGreaterThan(2);
      expect(request.body.data).toHaveProperty("$set");
    }
  }
  expect(state.requests.filter((request) => request.method === "DELETE"), "no deletion requests").toEqual([]);
  expect(state.requests.filter((request) => /\/auth\//.test(request.path)), "no auth/account mutation").toEqual([]);
  expect(state.requests.filter((request) => request.functionName
    && !["getPremiumAccess", "ensureDefaultHabits"].includes(request.functionName)),
  "redo must not invoke purchase, restore, deletion, tracking, or a new save backend").toEqual([]);
}

function assertHistoryPreserved(state) {
  for (const name of new Set([...Object.keys(state.before), ...Object.keys(state.entities)])) {
    if (Object.hasOwn(SETUP_IDS, name)) {
      expect(state.entities[name].map((row) => row.id)).toEqual(state.before[name].map((row) => row.id));
      expect(state.entities[name].filter((row) => row.id !== SETUP_IDS[name])).toEqual(
        state.before[name].filter((row) => row.id !== SETUP_IDS[name])
      );
    } else if (name === "DecisionLedger") {
      for (const old of state.before[name]) expect(state.entities[name]).toContainEqual(old);
    } else {
      expect(state.entities[name], `${name} must remain unchanged`).toEqual(state.before[name]);
    }
  }
  expect(state.deletedAccounts.size).toBe(0);
}

test.afterEach(async ({ page }) => {
  const state = guards.get(page);
  if (!state) return;
  assertOnlySetupWrites(state);
  assertHistoryPreserved(state);
  state.assertNoPageErrors();
});

async function expectRedoStep(page, step) {
  await expect(page).toHaveURL((url) => url.pathname === "/onboarding"
    && url.searchParams.get("redo") === "1"
    && Number(url.searchParams.get("step") ?? 0) === step);
  // Cold Vite lazy-module loads can be slower while other agents run suites.
  // Keep the wider budget scoped to route readiness, not save assertions.
  await expect(page.getByRole("button", { name: "Cancel setup", exact: true })).toBeVisible({ timeout: 15000 });
}

async function openRedo(page, step = 0) {
  await page.goto(`/onboarding?redo=1&step=${step}`);
  await expectRedoStep(page, step);
  if (step === 3) await expect(page.getByRole("button", { name: "Save updated plan", exact: true })).toBeVisible();
}

async function continueTo(page, step) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expectRedoStep(page, step);
}

async function storageValue(page, key) {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function seedStorage(page, entries) {
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }, entries);
}

// Only for scenarios with a single document load. Refresh tests seed after
// loading so an init script cannot overwrite the answers they need to resume.
async function seedStorageBeforeLoad(page, entries) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }, entries);
}

async function assertPremiumStillAvailable(page, state) {
  await page.goto("/more/premium");
  await expect(page.getByRole("link", { name: "Open meal planner", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open training planner", exact: true })).toBeVisible();
  await expect(page.getByLabel("Premium plans")).toHaveCount(0);
  expect(state.requests.some((request) => request.functionName === "getPremiumAccess")).toBe(true);
}

test("profile redo starts from saved answers and clears only this account's redo draft", async ({ page }) => {
  const state = await installRedoAccount(page);
  await page.goto("/more/profile");
  const restart = page.getByRole("button", { name: "Redo onboarding", exact: true });
  await expect(restart).toBeVisible({ timeout: 15000 });
  const initial = { p: { age: "71" }, step: 1 };
  const foreign = { p: { age: "88" }, step: 2 };
  await seedStorage(page, {
    [initialKey()]: initial, [redoKey()]: { p: { goal: "lean_bulk", age: "99" }, step: 3 },
    [initialKey("other-account")]: foreign, [redoKey("other-account")]: foreign
  });
  await restart.click();
  await expectRedoStep(page, 0);
  await expect(page.getByRole("radio", { name: /^Recomp\b/ })).toBeChecked();
  await continueTo(page, 1);
  await expect(page.getByRole("spinbutton", { name: "Age", exact: true })).toHaveValue("37");
  expect(JSON.parse(await storageValue(page, initialKey()))).toEqual(initial);
  expect(JSON.parse(await storageValue(page, initialKey("other-account")))).toEqual(foreign);
  expect(JSON.parse(await storageValue(page, redoKey("other-account")))).toEqual(foreign);
  expect(entityWrites(state)).toEqual([]);
});

test("all existing answers are prefilled and Continue, Back, and review Edit retain redo", async ({ page }) => {
  const state = await installRedoAccount(page);
  await openRedo(page);
  await expect(page.getByRole("radio", { name: /^Recomp\b/ })).toBeChecked();
  await continueTo(page, 1);
  for (const [name, value] of [
    ["Age", "37"], ["Current weight", "164"], ["Goal weight", "155"],
    ["Avg daily steps", "6500"], ["Lifting days/wk", "4"], ["Cardio days/wk", "0"]
  ]) await expect(page.getByRole("spinbutton", { name, exact: true })).toHaveValue(value);
  await expect(page.getByRole("combobox", { name: "Sex", exact: true })).toContainText("Female");
  await expect(page.getByRole("combobox", { name: "Daily job activity" })).toContainText("Moderately active");
  await expect(page.getByRole("combobox", { name: "Experience", exact: true })).toContainText("Intermediate");
  await expect(page.getByRole("combobox").filter({ hasText: "5 ft" })).toHaveCount(1);
  await expect(page.getByRole("combobox").filter({ hasText: /^5 in$/ })).toHaveCount(1);
  await expect(page.getByRole("spinbutton", { name: "Baseline waist", exact: true })).toHaveCount(0);
  await continueTo(page, 2);
  await expect(page.getByRole("combobox", { name: "Diet style" })).toContainText("Mediterranean");
  await expect(page.getByRole("combobox", { name: "Preferred training" })).toContainText("Upper-lower");
  for (const name of ["Long cardio", "Limited time", "On weight-affecting medication"]) {
    await expect(page.getByRole("checkbox", { name, exact: true })).toBeChecked();
  }
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectRedoStep(page, 1);
  await continueTo(page, 2);
  await continueTo(page, 3);
  await expect(page.getByText("Baseline waist", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expectRedoStep(page, 0);
  expect(entityWrites(state)).toEqual([]);
});

test("redo edits survive refresh, then Cancel discards only the redo draft without any entity writes", async ({ page }) => {
  const state = await installRedoAccount(page);
  await openRedo(page, 1);
  await seedStorage(page, { [initialKey()]: { p: { age: "71" }, step: 1 } });
  await page.getByRole("spinbutton", { name: "Age", exact: true }).fill("42");
  await expect(page.getByRole("spinbutton", { name: "Baseline waist", exact: true })).toHaveCount(0);
  await expect.poll(async () => JSON.parse(await storageValue(page, redoKey()))?.p?.age).toBe("42");
  await page.reload();
  await expectRedoStep(page, 1);
  await expect(page.getByRole("spinbutton", { name: "Age", exact: true })).toHaveValue("42");
  await expect(page.getByRole("spinbutton", { name: "Baseline waist", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel setup", exact: true }).click();
  await expect(page).toHaveURL(/\/more\/profile$/);
  await expect.poll(() => storageValue(page, redoKey())).toBeNull();
  expect(JSON.parse(await storageValue(page, initialKey()))).toEqual({ p: { age: "71" }, step: 1 });
  expect(state.entities).toEqual(state.before);
  expect(entityWrites(state)).toEqual([]);
  await assertPremiumStillAvailable(page, state);
});

test("a stale redo draft offers latest settings instead of overwriting a changed persisted setup", async ({ page }) => {
  const state = await installRedoAccount(page);
  await openRedo(page, 1);
  await page.getByRole("spinbutton", { name: "Age", exact: true }).fill("42");
  await expect.poll(async () => JSON.parse(await storageValue(page, redoKey()))?.p?.age).toBe("42");
  const savedDraft = JSON.parse(await storageValue(page, redoKey()));
  expect(savedDraft.baseRevision).toMatch(/^v1:[a-f0-9]{16}$/);
  // Another device changes the hosted profile while this draft remains local.
  ownRow(state, "UserProfile").age = 44;
  await page.reload();
  const useLatest = page.getByRole("button", { name: "Use latest settings", exact: true });
  await expect(useLatest).toBeVisible();
  await expect(page.getByRole("button", { name: "Save updated plan", exact: true })).toHaveCount(0);
  expect(JSON.parse(await storageValue(page, redoKey()))).toEqual(savedDraft);
  expect(entityWrites(state)).toEqual([]);
  await useLatest.click();
  await expectRedoStep(page, 0);
  await continueTo(page, 1);
  await expect(page.getByRole("spinbutton", { name: "Age", exact: true })).toHaveValue("44");
  await expect.poll(async () => JSON.parse(await storageValue(page, redoKey()))?.p?.age).toBe("44");
  expect(JSON.parse(await storageValue(page, redoKey())).baseRevision).not.toBe(savedDraft.baseRevision);
  expect(entityWrites(state)).toEqual([]);
  await page.getByRole("button", { name: "Cancel setup", exact: true }).click();
  await expect(page).toHaveURL(/\/more\/profile$/);
  expect(ownRow(state, "UserProfile").age).toBe(44);
});

test("saving redo updates the same rows, preserves preferences and history, and keeps paid Premium", async ({ page }) => {
  const state = await installRedoAccount(page);
  await openRedo(page, 1);
  await page.getByRole("spinbutton", { name: "Age", exact: true }).fill("42");
  await expect(page.getByRole("spinbutton", { name: "Baseline waist", exact: true })).toHaveCount(0);
  await continueTo(page, 2);
  await page.getByRole("combobox", { name: "Diet style" }).click();
  await page.getByRole("option", { name: "Vegetarian", exact: true }).click();
  await continueTo(page, 3);
  await expect(page.getByText("Baseline waist", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  expect(ownRow(state, "UserProfile")).toMatchObject({ id: "profile-1", age: 42 });
  expect(ownRow(state, "UserPreferences")).toMatchObject({
    id: "prefs-1", diet_style: "Vegetarian", tone: "analytical",
    notification_preferences: { weekly_check_in: false }, safety_flags: ["medication"]
  });
  expect(ownRow(state, "CurrentStrategy")).toMatchObject(
    recalculateTargets(ownRow(state, "UserProfile"), ownRow(state, "UserPreferences"))
  );
  for (const name of Object.keys(SETUP_IDS)) {
    expect(entityWrites(state).filter((request) => request.entity === name)).toHaveLength(1);
  }
  await expect.poll(() => storageValue(page, redoKey())).toBeNull();
  await assertPremiumStillAvailable(page, state);
});

for (const keepCustom of [true, false]) {
  test(`manual targets are ${keepCustom ? "kept by default" : "replaced only after opting into adaptive targets"}`, async ({ page }) => {
    const state = await installRedoAccount(page, { manual: true });
    const original = structuredClone(ownRow(state, "CurrentStrategy"));
    await openRedo(page, 3);
    const keep = page.getByRole("checkbox", { name: "Keep my custom targets", exact: true });
    await expect(keep).toBeChecked();
    if (!keepCustom) await keep.uncheck();
    await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    const strategy = ownRow(state, "CurrentStrategy");
    expect(strategy.manual_override).toBe(keepCustom);
    const expected = keepCustom ? original
      : recalculateTargets(ownRow(state, "UserProfile"), ownRow(state, "UserPreferences"));
    for (const key of MANUAL_TARGET_KEYS) expect(strategy[key], key).toBe(expected[key]);
    expect(strategy.goal_type).toBe("body_recomposition");
  });
}

test("keeping custom targets uses the fresh persisted strategy, not stale form context", async ({ page }) => {
  const state = await installRedoAccount(page, { manual: true });
  await openRedo(page, 3);
  await expect(page.getByRole("checkbox", { name: "Keep my custom targets", exact: true })).toBeChecked();
  // Simulate another device editing targets after this form was opened.
  const latestTargets = {
    calorie_target: 2940, protein_target_g: 190, carb_target_g: 340,
    fat_target_g: 90, step_target: 14000
  };
  Object.assign(ownRow(state, "CurrentStrategy"), latestTargets);
  const strategyReadsBeforeSave = state.requests.filter((request) => request.method === "GET"
    && request.entity === "CurrentStrategy" && request.id === "strategy-1").length;
  await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  expect(state.requests.filter((request) => request.method === "GET"
    && request.entity === "CurrentStrategy" && request.id === "strategy-1").length,
  "save must reread the persisted strategy").toBeGreaterThan(strategyReadsBeforeSave);
  expect(ownRow(state, "CurrentStrategy")).toMatchObject({ ...latestTargets, manual_override: true });
  for (const request of entityWrites(state).filter((request) => request.entity === "CurrentStrategy")) {
    for (const key of MANUAL_TARGET_KEYS) expect(request.body.query[key], `${key} CAS snapshot`).toBe(latestTargets[key]);
  }
});

test("a failed strategy update compensates profile/preferences, preserves the draft, and retries safely", async ({ page }) => {
  const state = await installRedoAccount(page);
  let strategyAttempts = 0;
  await page.route("**/entities/CurrentStrategy/update-many", async (route) => {
    if (route.request().method() === "PATCH" && ++strategyAttempts === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary strategy outage" }) });
    }
    return route.fallback();
  });
  await openRedo(page, 1);
  await page.getByRole("spinbutton", { name: "Age", exact: true }).fill("42");
  await continueTo(page, 2);
  await page.getByRole("combobox", { name: "Diet style" }).click();
  await page.getByRole("option", { name: "Vegetarian", exact: true }).click();
  await continueTo(page, 3);
  const save = page.getByRole("button", { name: "Save updated plan", exact: true });
  await save.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(save).toBeEnabled();
  await expectRedoStep(page, 3);
  expect(strategyAttempts).toBeGreaterThanOrEqual(1);
  for (const name of Object.keys(SETUP_IDS)) {
    expect(withoutUpdateTimestamps(state.entities[name]), `${name} rolled back`).toEqual(withoutUpdateTimestamps(state.before[name]));
  }
  // Prove both changed stages committed before compensation, rather than
  // passing because the injected outage prevented the save from starting.
  for (const [name, field, changed] of [["UserProfile", "age", 42], ["UserPreferences", "diet_style", "Vegetarian"]]) {
    const writes = entityWrites(state).filter((request) => request.entity === name);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes[0].body.data.$set[field]).toBe(changed);
    expect(writes.at(-1).body.data.$set[field]).toBe(state.before[name].find((row) => row.id === SETUP_IDS[name])[field]);
  }
  expect(JSON.parse(await storageValue(page, redoKey())).p.age).toBe("42");
  await save.click();
  await expect(page).toHaveURL(/\/today$/);
  expect(ownRow(state, "UserProfile").age).toBe(42);
  expect(ownRow(state, "UserPreferences").diet_style).toBe("Vegetarian");
  expect(ownRow(state, "CurrentStrategy")).toMatchObject(
    recalculateTargets(ownRow(state, "UserProfile"), ownRow(state, "UserPreferences"))
  );
  await assertPremiumStillAvailable(page, state);
});

test("compensation never overwrites a newer profile edit made after the first save stage", async ({ page }) => {
  const state = await installRedoAccount(page);
  let interrupted = false;
  await page.route("**/entities/CurrentStrategy/update-many", async (route) => {
    if (route.request().method() !== "PATCH" || interrupted) return route.fallback();
    interrupted = true;
    // Profile/preferences have committed by this point. A newer profile value
    // must survive reverse compensation's compare-and-swap guard.
    ownRow(state, "UserProfile").age = 59;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Interrupted save" }) });
  });
  await openRedo(page, 1);
  await page.getByRole("spinbutton", { name: "Age", exact: true }).fill("42");
  await continueTo(page, 2);
  await page.getByRole("combobox", { name: "Diet style" }).click();
  await page.getByRole("option", { name: "Vegetarian", exact: true }).click();
  await continueTo(page, 3);
  await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/refresh|review|changed|interrupted/i);
  await expect(page.getByRole("button", { name: "Use latest settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save updated plan", exact: true })).toHaveCount(0);
  expect(interrupted).toBe(true);
  expect(ownRow(state, "UserProfile").age).toBe(59);
  expect(withoutUpdateTimestamps(state.entities.UserPreferences)).toEqual(withoutUpdateTimestamps(state.before.UserPreferences));
  expect(withoutUpdateTimestamps(state.entities.CurrentStrategy)).toEqual(withoutUpdateTimestamps(state.before.CurrentStrategy));
  const profileWrites = entityWrites(state).filter((request) => request.entity === "UserProfile");
  // A fresh-read guard may skip compensation entirely once it sees the newer
  // edit. If compensation is attempted, its CAS must match only our own value.
  expect([1, 2]).toContain(profileWrites.length);
  expect(profileWrites[0].body.query.age).toBe(37);
  expect(profileWrites[0].body.data.$set.age).toBe(42);
  for (const rollback of profileWrites.slice(1)) {
    expect(rollback.body.query.age, "compensate only our own committed value").toBe(42);
    expect(rollback.body.data.$set.age).toBe(37);
  }
});

test("obsolete saved tone and invalid hidden waist do not block redo's final save", async ({ page }) => {
  const state = await installRedoAccount(page);
  // Older drafts can contain values for fields the redo form no longer edits.
  // Valid visible answers must still save directly from the Review deep link.
  await seedStorageBeforeLoad(page, {
    [redoKey()]: {
      p: { ...ownRow(state, "UserProfile"), age: "42", waist_in: "999" },
      pref: { ...ownRow(state, "UserPreferences"), tone: "unsupported_legacy_tone" },
      units: "imperial", step: 3
    }
  });
  await openRedo(page, 3);
  await expect(page.getByRole("spinbutton", { name: "Baseline waist", exact: true })).toHaveCount(0);
  await expect(page.getByText("Baseline waist", { exact: true })).toHaveCount(0);
  expect(entityWrites(state)).toEqual([]);
  await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  expect(ownRow(state, "UserProfile")).toMatchObject({ id: "profile-1", age: 42 });
  expect(ownRow(state, "UserPreferences")).toMatchObject({ id: "prefs-1", tone: "direct" });
  for (const write of entityWrites(state).filter((request) => Object.hasOwn(SETUP_IDS, request.entity))) {
    expect(write.body.data.$set).not.toHaveProperty("waist_in");
    expect(JSON.stringify(write.body.data)).not.toContain("unsupported_legacy_tone");
  }
  expect(state.entities.DailyLog).toEqual(state.before.DailyLog);
});

for (const invalid of [
  { name: "missing goal", p: { goal: "" }, pref: {} },
  { name: "missing age", p: { age: "" }, pref: {} },
  { name: "out-of-range weight", p: { current_weight_lbs: "10" }, pref: {} },
  { name: "missing diet style", p: {}, pref: { diet_style: "" } }
]) {
  test(`query step=3 cannot bypass validation: ${invalid.name}`, async ({ page }) => {
    const state = await installRedoAccount(page);
    await seedStorageBeforeLoad(page, {
      [redoKey()]: {
        p: { ...ownRow(state, "UserProfile"), ...invalid.p },
        pref: { ...ownRow(state, "UserPreferences"), ...invalid.pref }, units: "imperial", step: 3
      }
    });
    await openRedo(page, 3);
    await page.getByRole("button", { name: "Save updated plan", exact: true }).click();
    // The flow may redirect to the first invalid step or show an inline error,
    // but must give visible feedback and perform no writes at all.
    await expect(page.getByText(/pick a goal|complete the highlighted|pick a diet style|review the highlighted|required|couldn't finish|could not save/i).first()).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/onboarding" && url.searchParams.get("redo") === "1");
    expect(entityWrites(state)).toEqual([]);
    expect(state.entities).toEqual(state.before);
  });
}

test("another account's redo and initial drafts never prefill this account", async ({ page }) => {
  const state = await installRedoAccount(page);
  await seedStorageBeforeLoad(page, {
    [initialKey("other-account")]: { p: { age: "88" }, step: 1 },
    [redoKey("other-account")]: { p: { age: "99" }, pref: { safety_flags: ["pregnancy"] }, step: 1 },
    [initialKey()]: { p: { age: "71" }, step: 1 }
  });
  await openRedo(page, 1);
  await expect(page.getByRole("spinbutton", { name: "Age", exact: true })).toHaveValue("37");
  await continueTo(page, 2);
  await expect(page.getByRole("checkbox", { name: "Currently pregnant or breastfeeding" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "On weight-affecting medication" })).toBeChecked();
  expect(entityWrites(state)).toEqual([]);
});
