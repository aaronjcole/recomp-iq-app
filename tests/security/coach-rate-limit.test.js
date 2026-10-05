import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_FEATURE_QUOTAS,
  AI_QUOTA_FEATURES,
  COACH_DAILY_LIMIT,
  COACH_HOURLY_LIMIT,
  COACH_QUOTA,
  rankReservation,
  reserveFeatureRequest
} from "../../base44/shared/coachRateLimitDomain.js";
import { accountDeletionPlan } from "../../base44/shared/accountDeletionDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-08-03T18:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A reservation row as the server returns it: requested_at is the function's
// clock, created_date and id are assigned by the server on insert.
function row(id, { minutesAgo = 0, createdMs = NOW - minutesAgo * MINUTE, requestedMs } = {}) {
  return {
    id,
    request_id: `req-${id}`,
    requested_at: new Date(requestedMs ?? createdMs).toISOString(),
    created_date: new Date(createdMs).toISOString()
  };
}

function ids(prefix, count, minutesAgoFor) {
  return Array.from({ length: count }, (_, index) => (
    row(`${prefix}-${String(index).padStart(2, "0")}`, { minutesAgo: minutesAgoFor(index) })
  ));
}

test("rankReservation admits the tenth hourly request and rejects the eleventh", () => {
  const firstTen = ids("r", COACH_HOURLY_LIMIT, (index) => 50 - index);

  assert.deepEqual(
    rankReservation(firstTen, "r-09", COACH_QUOTA, { now: NOW }),
    { allowed: true, reason: null }
  );
  assert.deepEqual(
    rankReservation([...firstTen, row("r-10")], "r-10", COACH_QUOTA, { now: NOW }),
    { allowed: false, reason: "hourly" }
  );
  // A row that ranks ahead in created_date is unaffected by later rows.
  assert.deepEqual(
    rankReservation([...firstTen, row("r-10")], "r-03", COACH_QUOTA, { now: NOW }),
    { allowed: true, reason: null }
  );
});

test("rankReservation enforces the daily ceiling and fails closed", () => {
  const dailyUsage = ids("d", COACH_DAILY_LIMIT, (index) => 1_400 - index * 30);

  assert.deepEqual(
    rankReservation([...dailyUsage, row("overflow")], "overflow", COACH_QUOTA, { now: NOW }),
    { allowed: false, reason: "daily" }
  );
  assert.deepEqual(
    rankReservation(dailyUsage, "not-persisted", COACH_QUOTA, { now: NOW }),
    { allowed: false, reason: "reservation" }
  );
  // Our row missing from a full page means more than `daily` rows precede it.
  assert.deepEqual(
    rankReservation(dailyUsage, "not-on-page", COACH_QUOTA, { now: NOW, truncated: true }),
    { allowed: false, reason: "daily" }
  );
  assert.deepEqual(
    rankReservation([{ ...row("undated"), created_date: undefined }], "undated", COACH_QUOTA, { now: NOW }),
    { allowed: false, reason: "reservation" }
  );
  assert.deepEqual(rankReservation([row("x")], "x", { hourly: 0, daily: 1 }, { now: NOW }).allowed, false);
  assert.deepEqual(rankReservation([row("x")], "", COACH_QUOTA, { now: NOW }).allowed, false);
});

test("rankReservation orders by server created_date, not the function clock", () => {
  const limits = { hourly: 2, daily: 10 };
  // "fast" came from an instance whose clock runs a minute ahead: its
  // requested_at is later than ours (and later than our now), but the server
  // created it first. It must still count, and count ahead of us.
  const rows = [
    row("a", { createdMs: NOW - 1_000 }),
    row("fast", { createdMs: NOW - 500, requestedMs: NOW + MINUTE }),
    row("own", { createdMs: NOW, requestedMs: NOW - 2_000 })
  ];
  assert.deepEqual(rankReservation(rows, "own", limits, { now: NOW }), { allowed: false, reason: "hourly" });
  assert.deepEqual(rankReservation(rows, "fast", limits, { now: NOW }), { allowed: true, reason: null });
});

test("rankReservation counts same-millisecond rows against each other both ways", () => {
  const limits = { hourly: 2, daily: 10 };
  const rows = [row("early", { createdMs: NOW - 10 }), row("tie-a"), row("tie-b")];
  assert.equal(rankReservation(rows, "tie-a", limits, { now: NOW }).allowed, false);
  assert.equal(rankReservation(rows, "tie-b", limits, { now: NOW }).allowed, false);
  assert.equal(rankReservation(rows, "early", limits, { now: NOW }).allowed, true);
});

test("rankReservation fails closed when a full page may hide a tied row", () => {
  const limits = { hourly: 5, daily: 2 };
  const page = [row("a", { createdMs: NOW - 10 }), row("own"), row("tie")];
  assert.deepEqual(
    rankReservation(page.slice(0, 2), "own", limits, { now: NOW, truncated: true }),
    { allowed: false, reason: "daily" }
  );
  // The same page with a strictly later last row proves nothing was hidden.
  const later = [row("a", { createdMs: NOW - 10 }), row("own"), row("b", { createdMs: NOW + 5 })];
  assert.deepEqual(
    rankReservation(later, "own", limits, { now: NOW, truncated: true }),
    { allowed: true, reason: null }
  );
});

test("rankReservation ignores rows outside the windows", () => {
  const limits = { hourly: 1, daily: 2 };
  const rows = [
    row("expired", { minutesAgo: 25 * 60 }),
    row("earlier-today", { minutesAgo: 120 }),
    row("own")
  ];
  assert.deepEqual(rankReservation(rows, "own", limits, { now: NOW }), { allowed: true, reason: null });
});

// ---------------------------------------------------------------------------
// Concurrency simulation
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * In-memory CoachRequestUsage accessor. Every call yields a random number of
 * times before and after it takes effect, so parallel reservations interleave
 * arbitrarily. Inserts are atomic: id and created_date are assigned at the
 * instant the row becomes visible. `tieEvery` > 1 makes consecutive inserts
 * share a millisecond, and the server's order among equal created_date values
 * is shuffled, as a real sort leaves it unspecified.
 */
function fakeUsageStore(rng, { tieEvery = 1, initial = [] } = {}) {
  const rows = initial.map((record) => ({ ...record }));
  let inserts = 0;
  const pause = async () => {
    const turns = Math.floor(rng() * 12);
    for (let turn = 0; turn < turns; turn += 1) await null;
  };
  const matches = (record, query) => Object.entries(query).every(([field, condition]) => {
    if (condition && typeof condition === "object") {
      if ("$lt" in condition && !(record[field] < condition.$lt)) return false;
      if ("$lte" in condition && !(record[field] <= condition.$lte)) return false;
      if ("$gte" in condition && !(record[field] >= condition.$gte)) return false;
      return true;
    }
    return record[field] === condition;
  });

  return {
    rows,
    async deleteMany(query) {
      await pause();
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], query)) rows.splice(index, 1);
      }
      await pause();
      return { success: true };
    },
    async create(data) {
      await pause();
      const record = {
        ...data,
        id: Math.floor(rng() * 2 ** 48).toString(16).padStart(12, "0"),
        created_date: new Date(NOW + Math.floor(inserts / tieEvery)).toISOString()
      };
      inserts += 1;
      rows.push(record);
      await pause();
      return { ...record };
    },
    async filter(query, sort, limit) {
      await pause();
      const descending = sort.startsWith("-");
      const field = sort.replace(/^[-+]/, "");
      const result = rows
        .filter((record) => matches(record, query))
        .map((record) => ({ record, shuffle: rng() }))
        .sort((left, right) => (
          (left.record[field] < right.record[field] ? -1 : left.record[field] > right.record[field] ? 1 : 0)
            * (descending ? -1 : 1)
          || left.shuffle - right.shuffle
        ))
        .slice(0, limit)
        .map(({ record }) => ({ ...record }));
      await pause();
      return result;
    },
    async delete(id) {
      await pause();
      const index = rows.findIndex((record) => record.id === id);
      if (index !== -1) rows.splice(index, 1);
      await pause();
      return { success: true };
    }
  };
}

// Each parallel call runs on an instance whose clock is off by up to +-2s.
async function burst(store, rng, count, limits, reserve = reserveFeatureRequest) {
  return await Promise.all(Array.from({ length: count }, () => (
    reserve(store, "owner-1", AI_QUOTA_FEATURES.COACH, limits, NOW + Math.round((rng() - 0.5) * 4_000))
  )));
}

const allowedCount = (results) => results.filter((result) => result.allowed).length;

test("parallel reservations admit exactly the hourly limit across many interleavings", async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const rng = mulberry32(seed);
    const store = fakeUsageStore(rng);
    const results = await burst(store, rng, 50, COACH_QUOTA);
    assert.equal(allowedCount(results), COACH_HOURLY_LIMIT, `seed ${seed}`);
    assert.equal(store.rows.length, COACH_HOURLY_LIMIT, `seed ${seed}: rejected rows are removed`);
    for (const result of results.filter((entry) => !entry.allowed)) {
      assert.ok(["hourly", "daily"].includes(result.reason), `seed ${seed}: ${result.reason}`);
    }
  }
});

test("parallel reservations never exceed the limit when inserts share a millisecond", async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const rng = mulberry32(seed);
    const store = fakeUsageStore(rng, { tieEvery: 4 });
    const results = await burst(store, rng, 50, COACH_QUOTA);
    const allowed = allowedCount(results);
    assert.ok(allowed <= COACH_HOURLY_LIMIT, `seed ${seed}: ${allowed} allowed`);
    assert.ok(allowed > 0, `seed ${seed}: nothing allowed`);
    assert.equal(store.rows.length, allowed, `seed ${seed}`);
  }
  // Small limits with every insert in one millisecond make the case where two
  // tied requests each miss the other's row frequent rather than rare.
  for (const [limits, parallel] of [[{ hourly: 1, daily: 5 }, 3], [{ hourly: 2, daily: 5 }, 4]]) {
    for (let seed = 1; seed <= 500; seed += 1) {
      const rng = mulberry32(seed * 31 + parallel);
      const store = fakeUsageStore(rng, { tieEvery: 1_000 });
      const allowed = allowedCount(await burst(store, rng, parallel, limits));
      assert.ok(allowed <= limits.hourly, `seed ${seed}: ${allowed} allowed of ${limits.hourly}`);
    }
  }
});

test("parallel reservations respect remaining daily allowance and every feature quota", async () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const rng = mulberry32(seed);
    const usedToday = Array.from({ length: COACH_DAILY_LIMIT - 3 }, (_, index) => ({
      owner_id: "owner-1",
      feature: AI_QUOTA_FEATURES.COACH,
      ...row(`old-${index}`, { minutesAgo: 120 + index * 10 })
    }));
    const store = fakeUsageStore(rng, { initial: usedToday });
    const results = await burst(store, rng, 30, COACH_QUOTA);
    assert.equal(allowedCount(results), 3, `seed ${seed}`);
  }
  for (const limits of Object.values(AI_FEATURE_QUOTAS)) {
    const rng = mulberry32(limits.hourly * 97 + limits.daily);
    const results = await burst(fakeUsageStore(rng), rng, 80, limits);
    assert.equal(allowedCount(results), Math.min(limits.hourly, limits.daily));
  }
});

test("sequential reservations stop at the limit and pruning keeps in-window rows", async () => {
  const rng = mulberry32(7);
  const keep = {
    owner_id: "owner-1",
    feature: AI_QUOTA_FEATURES.FOOD_PHOTO,
    ...row("almost-expired", { createdMs: NOW - DAY - 30 * MINUTE })
  };
  const expired = {
    owner_id: "owner-1",
    feature: AI_QUOTA_FEATURES.COACH,
    ...row("expired", { createdMs: NOW - DAY - 2 * HOUR })
  };
  const store = fakeUsageStore(rng, { initial: [keep, expired] });
  const results = [];
  for (let index = 0; index < COACH_HOURLY_LIMIT + 2; index += 1) {
    results.push(await reserveFeatureRequest(store, "owner-1", AI_QUOTA_FEATURES.COACH, COACH_QUOTA, NOW));
  }
  assert.equal(allowedCount(results), COACH_HOURLY_LIMIT);
  assert.deepEqual(results.at(-1), { allowed: false, reason: "hourly" });
  assert.ok(store.rows.some((record) => record.id === "almost-expired"));
  assert.ok(!store.rows.some((record) => record.id === "expired"));
});

test("the simulation detects the original function-clock reservation race", async () => {
  // The previous algorithm: rank by requested_at and count only rows up to
  // our own timestamp. Kept here so the harness is shown to catch the race.
  async function legacyReserve(usage, ownerId, feature, limits, now) {
    const requestedAt = new Date(now).toISOString();
    const own = await usage.create({ owner_id: ownerId, feature, request_id: crypto.randomUUID(), requested_at: requestedAt });
    const recent = await usage.filter(
      { owner_id: ownerId, feature, requested_at: { $gte: new Date(now - DAY).toISOString(), $lte: requestedAt } },
      "requested_at",
      limits.daily + 1
    );
    const rank = recent.findIndex((record) => record.id === own.id);
    const allowed = rank !== -1 && rank < limits.hourly;
    if (!allowed) await usage.delete(own.id);
    return { allowed };
  }
  let worst = 0;
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = mulberry32(seed);
    worst = Math.max(worst, allowedCount(await burst(fakeUsageStore(rng), rng, 50, COACH_QUOTA, legacyReserve)));
  }
  assert.ok(worst > COACH_HOURLY_LIMIT, `legacy algorithm admitted at most ${worst}`);
});

test("coach rate limiting is shared, precedes paid inference, and is deleted with the account", () => {
  const coach = readFileSync(
    resolve(repoRoot, "base44/functions/coachReply/entry.ts"),
    "utf8"
  );
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "base44/entities/CoachRequestUsage.jsonc"), "utf8")
  );

  assert.match(coach, /asServiceRole\.entities\.CoachRequestUsage/);
  assert.match(coach, /status:\s*429/);
  assert.ok(
    coach.indexOf("const quota = await reserveCoachRequest")
      < coach.indexOf("integrations.Core.InvokeLLM")
  );
  assert.ok(
    accountDeletionPlan({ id: "user-1" }).some(
      (step) => step.entity === "CoachRequestUsage" && step.query.owner_id === "user-1"
    ),
    "CoachRequestUsage must be deleted with the account by owner_id"
  );
  assert.equal(schema.properties.owner_id.maxLength, 128);
  assert.equal(schema.properties.request_id.maxLength, 64);
  assert.deepEqual(schema.rls.read, { user_condition: { role: "admin" } });
});
