import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_REPORT_HOURLY_LIMIT,
  AI_REPORT_RANK_PAGE_SIZE,
  createRateLimitedAiReport,
  rankAiReport
} from "../../base44/shared/aiReportRateLimitDomain.js";
import { fakeEntityStore, mulberry32 } from "./fakeEntityStore.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const MINUTE = 60_000;
const row = (id, minutesAgo = 0) => ({ id, created_date: new Date(NOW - minutesAgo * MINUTE).toISOString() });
const tenEarlier = () => Array.from({ length: AI_REPORT_HOURLY_LIMIT }, (_, index) => row(`r${index}`, 50 - index));

test("rankAiReport admits the tenth report in an hour and rejects the eleventh", () => {
  const ten = tenEarlier();
  assert.deepEqual(rankAiReport(ten, "r9"), { allowed: true, reason: null });
  assert.deepEqual(rankAiReport([...ten, row("own")], "own"), { allowed: false, reason: "hourly" });
  // Rows created after ours do not count against it.
  assert.deepEqual(rankAiReport([...ten, row("own")], "r3"), { allowed: true, reason: null });
  // Reports older than the hour before ours are outside the window.
  const old = Array.from({ length: 15 }, (_, index) => row(`old${index}`, 61 + index));
  assert.deepEqual(rankAiReport([row("own"), ...old], "own"), { allowed: true, reason: null });
});

test("rankAiReport counts ties both ways and fails closed", () => {
  const tied = Array.from({ length: AI_REPORT_HOURLY_LIMIT }, (_, index) => row(`t${index}`));
  assert.equal(rankAiReport([...tied, row("own")], "own").allowed, false);
  assert.equal(rankAiReport([{ id: "undated" }, ...tenEarlier().slice(1), row("own")], "own").allowed, false);
  assert.deepEqual(rankAiReport([row("x")], "own"), { allowed: false, reason: "reservation" });
  assert.deepEqual(rankAiReport([row("x")], "own", { truncated: true }), { allowed: false, reason: "hourly" });
  assert.deepEqual(rankAiReport([{ id: "own" }], "own"), { allowed: false, reason: "reservation" });
  assert.deepEqual(rankAiReport([row("own")], ""), { allowed: false, reason: "reservation" });
  // A full page whose oldest row is still inside the window may hide rows ahead of ours.
  const newer = Array.from({ length: AI_REPORT_RANK_PAGE_SIZE - 1 }, (_, index) => ({
    id: `n${index}`,
    created_date: new Date(NOW + 1 + index).toISOString()
  }));
  assert.equal(rankAiReport([...newer, row("own")], "own", { truncated: true }).allowed, false);
  assert.equal(
    rankAiReport([...newer.slice(1), row("own"), row("old", 90)], "own", { truncated: true }).allowed,
    true
  );
});

const report = (index) => ({
  owner_id: "owner-1",
  message_id: `message-${index}`,
  category: "other",
  reported_content: "content",
  status: "received"
});

test("parallel reports keep exactly the hourly limit across many interleavings", async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const store = fakeEntityStore(mulberry32(seed), { now: NOW });
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) => createRateLimitedAiReport(store, report(index)))
    );
    const allowed = results.filter((result) => result.allowed).length;
    assert.equal(allowed, AI_REPORT_HOURLY_LIMIT, `seed ${seed}`);
    assert.equal(store.rows.length, AI_REPORT_HOURLY_LIMIT, `seed ${seed}: rejected reports are removed`);
  }
});

test("parallel reports never exceed the limit when inserts share a millisecond", async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const store = fakeEntityStore(mulberry32(seed), { now: NOW, tieEvery: 5 });
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) => createRateLimitedAiReport(store, report(index)))
    );
    const allowed = results.filter((result) => result.allowed).length;
    assert.ok(allowed <= AI_REPORT_HOURLY_LIMIT, `seed ${seed}: ${allowed} allowed`);
    assert.ok(allowed > 0, `seed ${seed}: nothing allowed`);
    assert.equal(store.rows.length, allowed, `seed ${seed}`);
  }
});

test("a flood larger than the read-back page fails closed", async () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const store = fakeEntityStore(mulberry32(seed), { now: NOW });
    const results = await Promise.all(
      Array.from({ length: AI_REPORT_RANK_PAGE_SIZE * 2 }, (_, index) => createRateLimitedAiReport(store, report(index)))
    );
    const allowed = results.filter((result) => result.allowed).length;
    assert.ok(allowed <= AI_REPORT_HOURLY_LIMIT, `seed ${seed}: ${allowed} allowed`);
    assert.equal(store.rows.length, allowed, `seed ${seed}`);
  }
});

test("sequential reports stop at the limit and other owners are unaffected", async () => {
  const store = fakeEntityStore(mulberry32(3), { now: NOW });
  for (let index = 0; index < AI_REPORT_HOURLY_LIMIT; index += 1) {
    assert.equal((await createRateLimitedAiReport(store, report(index))).allowed, true);
  }
  assert.deepEqual(
    await createRateLimitedAiReport(store, report(99)),
    { allowed: false, reason: "hourly", report: null }
  );
  assert.equal(
    (await createRateLimitedAiReport(store, { ...report(100), owner_id: "owner-2" })).allowed,
    true
  );
});

test("the simulation detects the original check-then-create report race", async () => {
  async function legacy(store, data) {
    const recent = await store.filter({ owner_id: data.owner_id }, "-created_date", AI_REPORT_HOURLY_LIMIT);
    if (recent.length >= AI_REPORT_HOURLY_LIMIT) return { allowed: false };
    await store.create(data);
    return { allowed: true };
  }
  const store = fakeEntityStore(mulberry32(1), { now: NOW });
  await Promise.all(Array.from({ length: 40 }, (_, index) => legacy(store, report(index))));
  assert.ok(store.rows.length > AI_REPORT_HOURLY_LIMIT);
});

test("reportAiContent enforces its limit through rank-after-insert", () => {
  const source = readFileSync(resolve(repoRoot, "base44/functions/reportAiContent/entry.ts"), "utf8");
  assert.match(source, /createRateLimitedAiReport\(reports, \{/);
  assert.doesNotMatch(source, /reports\.create\(/);
  assert.match(source, /status: 429/);
});
