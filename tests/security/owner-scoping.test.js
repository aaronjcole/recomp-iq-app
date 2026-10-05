import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OwnerScopeError,
  isOwnedBy,
  ownedQuery
} from "../../base44/shared/ownerScope.js";
import { normalizeTrackingRequest } from "../../base44/shared/trackingRecordDomain.js";
import {
  DEFAULT_HABITS,
  mergeDefaultHabitEntries,
  needsDefaultHabitReconciliation,
  planDefaultHabitReconciliation
} from "../../base44/shared/defaultHabitsDomain.js";

// Entity RLS grants admins read/update/delete on every row, so RLS alone does
// not keep an admin's app session on their own data. These tests execute the
// shared query builders and reconciliation planner to prove the caller is
// always named as owner, and that other owners' rows are never touched.

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CALLER = "user-caller";
const OTHER = "user-other";

function starterTrio(ownerId, { idPrefix, createdDay }) {
  return DEFAULT_HABITS.map(({ system_key: _systemKey, ...definition }, index) => ({
    ...definition,
    id: `${idPrefix}-${index}`,
    created_by_id: ownerId,
    created_date: `2026-08-0${createdDay}T0${index}:00:00.000Z`
  }));
}

test("ownedQuery always pins the owner and cannot be overridden by the caller's query", () => {
  assert.deepEqual(ownedQuery(CALLER), { created_by_id: CALLER });
  assert.deepEqual(ownedQuery(CALLER, { date: "2026-08-01" }), {
    date: "2026-08-01",
    created_by_id: CALLER
  });
  assert.deepEqual(ownedQuery(CALLER, { created_by_id: OTHER }), { created_by_id: CALLER });
  for (const missing of [undefined, null, "", "  ", 42]) {
    assert.throws(() => ownedQuery(missing, { date: "2026-08-01" }), OwnerScopeError);
  }
  assert.equal(isOwnedBy({ created_by_id: CALLER }, CALLER), true);
  assert.equal(isOwnedBy({ created_by_id: OTHER }, CALLER), false);
  assert.equal(isOwnedBy({}, CALLER), false);
  assert.equal(isOwnedBy({ created_by_id: undefined }, undefined), false);
});

test("tracking lookups for daily logs and habit entries are scoped to the caller", () => {
  const daily = normalizeTrackingRequest(
    { kind: "daily_log", date: "2026-08-01", fields: { calories: 1900 } },
    CALLER
  );
  assert.equal(daily.query.created_by_id, CALLER);
  assert.deepEqual(daily.query, { date: "2026-08-01", created_by_id: CALLER });

  const habit = normalizeTrackingRequest(
    { kind: "habit_entry", habit_id: "habit-1", date: "2026-08-01", fields: { done: true } },
    CALLER
  );
  assert.deepEqual(habit.query, {
    habit_id: "habit-1",
    date: "2026-08-01",
    created_by_id: CALLER
  });
  // Client-supplied data must never be able to choose the owner.
  assert.equal("created_by_id" in daily.createData, false);
  assert.equal("created_by_id" in habit.createData, false);
});

test("tracking requests without an authenticated owner fail closed", () => {
  for (const missing of [undefined, null, ""]) {
    assert.throws(
      () => normalizeTrackingRequest(
        { kind: "daily_log", date: "2026-08-01", fields: { calories: 1900 } },
        missing
      ),
      OwnerScopeError
    );
  }
});

test("default-habit reconciliation ignores other owners' habits even when passed in", () => {
  // Another user's starter trio is older, so an unscoped planner would make it
  // canonical and schedule the caller's habits (or theirs) for deletion.
  const others = starterTrio(OTHER, { idPrefix: "other", createdDay: 1 });
  const mine = starterTrio(CALLER, { idPrefix: "mine", createdDay: 2 });
  const plan = planDefaultHabitReconciliation([...others, ...mine], { ownerId: CALLER });

  assert.equal(plan.length, 3);
  for (const group of plan) {
    assert.equal(group.canonical.created_by_id, CALLER);
    assert.deepEqual(group.duplicates, []);
  }
  const touched = plan.flatMap((group) => [group.canonical, ...group.duplicates]);
  assert.ok(touched.every((habit) => habit.created_by_id === CALLER));

  // Only other owners' rows (or unowned rows) means nothing to reconcile.
  assert.deepEqual(planDefaultHabitReconciliation(others, { ownerId: CALLER }), []);
  const unowned = others.map(({ created_by_id: _owner, ...habit }) => habit);
  assert.deepEqual(planDefaultHabitReconciliation(unowned, { ownerId: CALLER }), []);
  assert.equal(needsDefaultHabitReconciliation(others, { ownerId: CALLER }), false);
});

test("default-habit reconciliation with a null owner touches nothing", () => {
  const mine = starterTrio(CALLER, { idPrefix: "mine", createdDay: 2 });
  assert.deepEqual(planDefaultHabitReconciliation(mine, { ownerId: null }), []);
});

test("duplicate history merges never adopt or delete another owner's entries", () => {
  const habit = { id: "mine-0", kind: "count", target_value: 100 };
  const result = mergeDefaultHabitEntries([
    { id: "theirs", habit_id: "other-0", date: "2026-09-08", value: 900, created_by_id: OTHER, created_date: "2026-09-08T09:00:00Z" },
    { id: "mine-old", habit_id: "mine-0", date: "2026-09-08", value: 40, created_by_id: CALLER, created_date: "2026-09-08T10:00:00Z" },
    { id: "mine-new", habit_id: "mine-1", date: "2026-09-08", value: 70, created_by_id: CALLER, created_date: "2026-09-08T11:00:00Z" }
  ], habit, { ownerId: CALLER });

  assert.equal(result.canonical.id, "mine-old");
  assert.deepEqual(result.duplicates.map((entry) => entry.id), ["mine-new"]);
  assert.equal(result.fields.value, 70);
  assert.equal(
    mergeDefaultHabitEntries([{ id: "theirs", date: "2026-09-08", created_by_id: OTHER }], habit, {
      ownerId: CALLER
    }),
    null
  );
});

// ── Static guard: user-owned entity reads must name the owner ──────────────

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

// Entities whose RLS scopes rows by Base44's built-in created_by_id.
function createdByOwnedEntities() {
  const dir = resolve(repoRoot, "base44/entities");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".jsonc"))
    .filter((file) =>
      /"created_by_id"\s*:\s*"\{\{user\.id\}\}"/.test(readFileSync(join(dir, file), "utf8"))
    )
    .map((file) => file.replace(/\.jsonc$/, ""));
}

function stripComments(source) {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

test("user-owned entity list/filter calls in functions and src always name the owner", () => {
  const owned = createdByOwnedEntities();
  assert.ok(owned.includes("DailyLog") && owned.includes("Habit"), "schema discovery works");

  const functionsDir = resolve(repoRoot, "base44/functions");
  // base44/shared holds helpers moved out of entries (tracking persistence,
  // default-habit provisioning), so it is scanned too.
  const files = [
    ...readdirSync(functionsDir).map((name) => join(functionsDir, name, "entry.ts")),
    ...walk(resolve(repoRoot, "base44/shared")),
    ...walk(resolve(repoRoot, "src"))
  ];
  const ownedNames = owned.join("|");
  // `base44.entities.X.list(` / `.filter(` through the user-scoped client, plus
  // the generic `entities[entityName].filter(` helper used by functions.
  const callPattern = new RegExp(
    `(?<!asServiceRole\\.)entities(?:\\.(${ownedNames})|\\[\\w+\\])\\.(list|filter)\\(`,
    "g"
  );
  const violations = [];
  let scanned = 0;

  for (const file of files) {
    let source;
    try {
      source = stripComments(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const match of source.matchAll(callPattern)) {
      scanned += 1;
      const firstArgument = source.slice(match.index + match[0].length, match.index + match[0].length + 160);
      const scoped =
        match[2] === "filter"
        && /^\s*(?:own\(|ownedQuery\(|\{\s*created_by_id\s*:)/.test(firstArgument);
      if (!scoped) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${relative(repoRoot, file)}:${line} ${match[0]}`);
      }
    }
  }

  assert.ok(scanned > 20, `expected to scan many entity reads, found ${scanned}`);
  assert.deepEqual(violations, [], "unscoped user-owned entity reads");
});

// Habit ownership in the tracking upsert (not just existence) is executed in
// tracking-persistence.test.js against an admin-visibility fake client.
