import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_DELETION_CASCADE,
  NON_USER_DATA_ENTITIES,
  accountDeletionPlan,
  runAccountDeletionCascade
} from "../../base44/shared/accountDeletionDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const entityDirectory = join(repoRoot, "base44/entities");
const USER = Object.freeze({ id: "user-123", email: "  Person@Example.COM " });

function entityNames() {
  return readdirSync(entityDirectory)
    .filter((file) => file.endsWith(".jsonc"))
    .map((file) => file.replace(/\.jsonc$/, ""))
    .sort();
}

function readEntity(name) {
  return JSON.parse(readFileSync(join(entityDirectory, `${name}.jsonc`), "utf8"));
}

function fakeEntities({ failOn = new Set(), counts = {} } = {}) {
  const calls = [];
  const entities = new Proxy(
    {},
    {
      get(_target, entity) {
        return {
          async deleteMany(query) {
            calls.push({ entity, query });
            if (failOn.has(entity)) throw new Error(`${String(entity)} unavailable`);
            return { success: true, deleted: counts[entity] ?? 1 };
          }
        };
      }
    }
  );
  return { entities, calls };
}

test("every entity is either deleted with the account or explicitly allowlisted", () => {
  const cascaded = new Set(ACCOUNT_DELETION_CASCADE.map((step) => step.entity));
  const allowlisted = new Set(Object.keys(NON_USER_DATA_ENTITIES));

  for (const name of entityNames()) {
    assert.ok(
      cascaded.has(name) || allowlisted.has(name),
      `${name} must be added to ACCOUNT_DELETION_CASCADE or NON_USER_DATA_ENTITIES`
    );
    assert.ok(!(cascaded.has(name) && allowlisted.has(name)), `${name} is both cascaded and allowlisted`);
  }
  for (const name of [...cascaded, ...allowlisted]) {
    assert.ok(entityNames().includes(name), `${name} is listed but has no entity schema`);
  }
  for (const [name, reason] of Object.entries(NON_USER_DATA_ENTITIES)) {
    assert.ok(typeof reason === "string" && reason.length > 10, `${name} needs an allowlist reason`);
  }
});

test("each cascade filter uses a field the entity actually keys ownership on", () => {
  for (const { entity, query } of accountDeletionPlan(USER)) {
    const schema = readEntity(entity);
    const rls = JSON.stringify(schema.rls);
    for (const field of Object.keys(query)) {
      if (field === "created_by_id") {
        assert.match(rls, /"created_by_id":"\{\{user\.id\}\}"/, `${entity} RLS is not keyed on created_by_id`);
      } else {
        assert.ok(Object.hasOwn(schema.properties, field), `${entity} has no ${field} property`);
      }
    }
  }
});

test("Referral rows are deleted whether the user was the referrer or the referee", () => {
  const referralQueries = accountDeletionPlan(USER)
    .filter((step) => step.entity === "Referral")
    .map((step) => step.query);

  assert.deepEqual(referralQueries, [{ referrer_id: USER.id }, { referee_id: USER.id }]);
});

test("filters bind to the given user's id or normalized email only", () => {
  const plan = accountDeletionPlan(USER);
  for (const { entity, query } of plan) {
    assert.ok(Object.keys(query).length > 0, `${entity} filter must not be empty`);
    for (const value of Object.values(query)) {
      assert.ok(
        value === USER.id || value === "person@example.com",
        `${entity} filter value ${JSON.stringify(value)} is not bound to the user`
      );
    }
  }
  assert.deepEqual(
    plan.find((step) => step.entity === "WaitlistEntry").query,
    { email: "person@example.com" }
  );

  const other = accountDeletionPlan({ id: "someone-else" });
  for (const { query } of other) {
    assert.ok(Object.values(query).every((value) => value === "someone-else"));
  }
});

test("a user without an email skips the waitlist rather than deleting every row", () => {
  for (const email of [undefined, null, "", "   "]) {
    const plan = accountDeletionPlan({ id: USER.id, email });
    assert.equal(plan.some((step) => step.entity === "WaitlistEntry"), false);
  }
});

test("a missing user id refuses to build a plan", () => {
  for (const user of [null, undefined, {}, { id: "" }, { id: "  " }, { id: 42 }]) {
    assert.throws(() => accountDeletionPlan(user), /authenticated user id/);
  }
});

test("the cascade records per-step counts and calls every step", async () => {
  const { entities, calls } = fakeEntities({ counts: { FoodLogEntry: 7 } });
  const result = await runAccountDeletionCascade(entities, USER);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(calls.length, accountDeletionPlan(USER).length);
  assert.equal(result.deleted["FoodLogEntry:created_by_id"], 7);
  assert.equal(result.deleted["Referral:referrer_id"], 1);
  assert.equal(result.deleted["Referral:referee_id"], 1);
  assert.equal(calls.some((call) => call.entity === "User"), false);
});

test("a failed step is reported, does not stop the rest, and marks the run not ok", async () => {
  const { entities, calls } = fakeEntities({ failOn: new Set(["PushDevice"]) });
  const result = await runAccountDeletionCascade(entities, USER);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map((failure) => failure.step), ["PushDevice:owner_id"]);
  assert.equal(calls.length, accountDeletionPlan(USER).length);
  assert.equal(Object.hasOwn(result.deleted, "PushDevice:owner_id"), false);
});

test("a deleteMany that reports success: false counts as a failure", async () => {
  const entities = new Proxy({}, {
    get: () => ({ deleteMany: async () => ({ success: false, deleted: 0 }) })
  });
  const result = await runAccountDeletionCascade(entities, USER);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, accountDeletionPlan(USER).length);
});

test("deleteAccount only removes the user record after a fully successful cascade", () => {
  const source = readFileSync(join(repoRoot, "base44/functions/deleteAccount/entry.ts"), "utf8");
  const cascadeAt = source.indexOf("runAccountDeletionCascade(base44.asServiceRole.entities, user)");
  const guardAt = source.indexOf("if (!cascade.ok)");
  const userDeleteAt = source.indexOf("asServiceRole.entities.User.delete(user.id)");

  assert.ok(cascadeAt > 0 && guardAt > cascadeAt && userDeleteAt > guardAt);
  assert.ok(source.indexOf('confirmation !== "DELETE"') < cascadeAt);
  assert.doesNotMatch(source, /deleteMany\(/, "deletes must go through the shared cascade");
});
