import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITLEMENT_PAGE_SIZE,
  MAX_ENTITLEMENT_RECORDS,
  TESTER_FULL_RECORD,
  isPremiumTester,
  loadPremiumAccessRecords
} from "../../base44/shared/entitlementAccess.js";
import {
  EMPTY_PREMIUM_ACCESS,
  PREMIUM_FEATURES,
  PREMIUM_PRODUCTS,
  resolvePremiumAccess
} from "../../base44/shared/premiumDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const functionsDir = resolve(repoRoot, "base44/functions");

/**
 * Fake Base44 client holding `rows`; each owner's rows are served in
 * pages exactly as `filter(query, sort, limit, skip, fields)` would.
 */
function fakeBase44({ rows = [], fail = null, malformed = false } = {}) {
  const calls = [];
  const filter = async (query, sort, limit, skip, fields) => {
    calls.push({ query, sort, limit, skip, fields });
    if (fail) throw fail;
    if (malformed) return { items: [] };
    return rows.filter((row) => row.owner_id === query.owner_id).slice(skip, skip + limit);
  };
  return {
    calls,
    asServiceRole: { entities: { PremiumEntitlement: { filter } } }
  };
}

function activeRow(ownerId, overrides = {}) {
  return {
    owner_id: ownerId,
    product_id: PREMIUM_PRODUCTS.BUNDLE,
    source: "apple_store",
    status: "active",
    expires_at: null,
    ...overrides
  };
}

const TESTERS = " Tester@Example.com , second@example.com ";

test("a listed tester gets full bundle access without a database read", async () => {
  const base44 = fakeBase44({ fail: new Error("must not be read") });
  const user = { id: "user-tester", email: "tester@example.COM" };
  const records = await loadPremiumAccessRecords(base44, user, { testerEmails: TESTERS });

  assert.deepEqual(records, [TESTER_FULL_RECORD]);
  assert.equal(base44.calls.length, 0);
  const access = resolvePremiumAccess(records);
  assert.equal(access.hasBundleAccess, true);
  assert.equal(access.testerAccess, true);
  for (const feature of Object.values(PREMIUM_FEATURES)) {
    assert.equal(access.features[feature], true, `${feature} must unlock for testers`);
  }
});

test("a non-tester with no entitlement rows gets no access", async () => {
  const base44 = fakeBase44({ rows: [activeRow("someone-else")] });
  const user = { id: "user-1", email: "plain@example.com" };
  const records = await loadPremiumAccessRecords(base44, user, { testerEmails: TESTERS });

  assert.deepEqual(records, []);
  assert.deepEqual(resolvePremiumAccess(records), EMPTY_PREMIUM_ACCESS);
  assert.deepEqual(base44.calls[0].query, { owner_id: "user-1" });
});

test("tester matching is exact and an unset secret grants nothing", async () => {
  for (const testerEmails of [undefined, "", " , ", null]) {
    assert.equal(isPremiumTester({ id: "u", email: "tester@example.com" }, testerEmails), false);
  }
  assert.equal(isPremiumTester({ id: "u" }, TESTERS), false);
  assert.equal(isPremiumTester({ id: "u", email: "" }, TESTERS), false);
  assert.equal(isPremiumTester({ id: "u", email: "tester@example.com.evil" }, TESTERS), false);
  assert.equal(isPremiumTester({ id: "u", email: "ester@example.com" }, TESTERS), false);

  const base44 = fakeBase44();
  const records = await loadPremiumAccessRecords(
    base44,
    { id: "user-1", email: "tester@example.com" },
    {}
  );
  assert.deepEqual(records, []);
  assert.equal(base44.calls.length, 1);
});

test("owner scoping comes from the authenticated user and a missing id is refused", async () => {
  const base44 = fakeBase44();
  await assert.rejects(loadPremiumAccessRecords(base44, null, {}));
  await assert.rejects(loadPremiumAccessRecords(base44, { email: "tester@example.com" }, { testerEmails: TESTERS }));
  assert.equal(base44.calls.length, 0);
});

test("entitlements are read in bounded pages of 500, at most 1,000 rows, newest first", async () => {
  assert.equal(ENTITLEMENT_PAGE_SIZE, 500);
  assert.equal(MAX_ENTITLEMENT_RECORDS, 1_000);
  const base44 = fakeBase44({ rows: [activeRow("user-1")] });
  await loadPremiumAccessRecords(base44, { id: "user-1" }, {});
  assert.deepEqual(base44.calls.map(({ query, sort, limit, skip }) => ({ query, sort, limit, skip })), [
    { query: { owner_id: "user-1" }, sort: "-created_date", limit: ENTITLEMENT_PAGE_SIZE, skip: 0 }
  ]);
});

test("pagination reads beyond the first page", async () => {
  const rows = Array.from({ length: ENTITLEMENT_PAGE_SIZE + 3 }, (_, index) =>
    activeRow("user-1", { status: "expired", source: "google_play", id: index })
  );
  rows[ENTITLEMENT_PAGE_SIZE + 2] = activeRow("user-1");
  const base44 = fakeBase44({ rows });
  const records = await loadPremiumAccessRecords(base44, { id: "user-1" }, {});

  assert.equal(records.length, ENTITLEMENT_PAGE_SIZE + 3);
  assert.deepEqual(base44.calls.map((call) => call.skip), [0, ENTITLEMENT_PAGE_SIZE]);
  assert.deepEqual(base44.calls[0].fields, ["product_id", "source", "status", "expires_at"]);
  // The only active row sat on the second page.
  assert.equal(resolvePremiumAccess(records).hasBundleAccess, true);
});

test("pagination stops at the record cap and fails closed instead of truncating", async () => {
  const rows = Array.from({ length: MAX_ENTITLEMENT_RECORDS + 50 }, () =>
    activeRow("user-1", { status: "expired" })
  );
  const base44 = fakeBase44({ rows });
  await assert.rejects(
    loadPremiumAccessRecords(base44, { id: "user-1" }, {}),
    /exceeded the safe record limit/
  );
  const requested = base44.calls.reduce((sum, call) => sum + call.limit, 0);
  assert.equal(requested, MAX_ENTITLEMENT_RECORDS);
  assert.ok(base44.calls.length <= Math.ceil(MAX_ENTITLEMENT_RECORDS / ENTITLEMENT_PAGE_SIZE));
});

test("a read error or malformed page fails closed", async () => {
  const user = { id: "user-1", email: "plain@example.com" };
  await assert.rejects(
    loadPremiumAccessRecords(fakeBase44({ fail: new Error("db down") }), user, { testerEmails: TESTERS }),
    /db down/
  );
  await assert.rejects(
    loadPremiumAccessRecords(fakeBase44({ malformed: true }), user, {}),
    /Invalid entitlement response/
  );
});

// --- Source guards ------------------------------------------------------------

const functionSources = readdirSync(functionsDir)
  .map((name) => ({ name, path: resolve(functionsDir, name, "entry.ts") }))
  .filter(({ path }) => existsSync(path))
  .map(({ name, path }) => ({ name, source: readFileSync(path, "utf8") }));

const LOADER_IMPORT =
  /import \{[^}]*\bloadPremiumAccessRecords\b[^}]*\} from "\.\.\/\.\.\/shared\/entitlementAccess\.js"/;

test("no backend function keeps its own entitlement reader", () => {
  assert.ok(functionSources.length > 10);
  for (const { name, source } of functionSources) {
    assert.doesNotMatch(source, /function listAllEntitlements/, `${name} must use the shared loader`);
  }
});

test("every function that checks PREMIUM_FEATURES resolves access through the shared loader", () => {
  const gated = functionSources.filter(({ source }) => /PREMIUM_FEATURES\./.test(source));
  const names = gated.map(({ name }) => name);
  for (const expected of [
    "analyzeBodyComposition",
    "analyzeFoodPhoto",
    "generateAdaptiveMealPlan",
    "generateAdaptiveTrainingBlock",
    "generateWeeklyAutopilot",
    "lifestyleCoachReply",
    "swapAdaptiveMeal"
  ]) {
    assert.ok(names.includes(expected), `${expected} must be premium-gated`);
  }
  for (const { name, source } of [...gated, functionSources.find((f) => f.name === "getPremiumAccess")]) {
    assert.match(source, LOADER_IMPORT, `${name} must import the shared loader`);
    assert.match(
      source,
      /loadPremiumAccessRecords\(base44, user, \{ testerEmails: Deno\.env\.get\("PREMIUM_TESTER_EMAILS"\) \}\)/,
      `${name} must pass the tester secret into the shared loader`
    );
    assert.doesNotMatch(source, /PremiumEntitlement\.filter/, `${name} must not read entitlements directly`);
    assert.doesNotMatch(source, /TESTER_EMAIL_SET|TESTER_FULL_RECORD/, `${name} must not keep a local bypass`);
  }
});

test("the shared loader never reads the environment itself", () => {
  const loader = readFileSync(resolve(repoRoot, "base44/shared/entitlementAccess.js"), "utf8");
  assert.doesNotMatch(loader, /Deno\.|process\.env|base44:runtime/);
});

test("swapAdaptiveMeal checks meal-planning Premium before reading the request", () => {
  const source = functionSources.find((f) => f.name === "swapAdaptiveMeal").source;
  const auth = source.indexOf("base44.auth.me()");
  const gate = source.indexOf("PREMIUM_FEATURES.MEAL_PLANNING");
  // The 403 is either `status: 403` or the file's failure(message, 403) helper.
  const locked = source.search(/status: 403|, 403\)/);
  const body = source.indexOf("req.json()");
  assert.ok(auth >= 0 && auth < gate && gate < locked && locked < body);
});
