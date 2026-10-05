import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFERRAL_ATTRIBUTION_WINDOW_MS,
  isReferralCode,
  rankReferralAttribution,
  recordReferralAttribution,
  referralEligibility
} from "../../base44/shared/referralDomain.js";
import { fakeEntityStore, mulberry32 } from "./fakeEntityStore.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (ms) => new Date(ms).toISOString();

test("referral eligibility blocks self-referral and accounts outside the signup window", () => {
  const fresh = { id: "referee", created_date: at(NOW - 60_000) };
  assert.deepEqual(referralEligibility(fresh, "referrer", NOW), { eligible: true, reason: null });
  assert.equal(referralEligibility(fresh, "referee", NOW).reason, "self_referral");
  assert.equal(referralEligibility(fresh, "", NOW).reason, "self_referral");
  assert.equal(
    referralEligibility({ id: "referee", created_date: at(NOW - REFERRAL_ATTRIBUTION_WINDOW_MS) }, "referrer", NOW).eligible,
    true
  );
  assert.equal(
    referralEligibility({ id: "referee", created_date: at(NOW - 8 * DAY) }, "referrer", NOW).reason,
    "account_too_old"
  );
  assert.equal(referralEligibility({ id: "referee" }, "referrer", NOW).reason, "account_age_unknown");
  assert.equal(
    referralEligibility({ id: "referee", created_date: "not a date" }, "referrer", NOW).reason,
    "account_age_unknown"
  );
  // Small clock skew between auth and the function must not reject a new account.
  assert.equal(
    referralEligibility({ id: "referee", created_date: at(NOW + 5_000) }, "referrer", NOW).eligible,
    true
  );
  assert.equal(isReferralCode("Abc123"), true);
  assert.equal(isReferralCode("ab"), false);
  assert.equal(isReferralCode("abc-123"), false);
});

test("rankReferralAttribution keeps only a strictly earliest row", () => {
  const row = (id, ms) => ({ id, created_date: at(ms) });
  assert.deepEqual(rankReferralAttribution([row("own", NOW)], "own"), { outcome: "recorded" });
  assert.deepEqual(
    rankReferralAttribution([row("own", NOW), row("later", NOW + 1)], "own"),
    { outcome: "recorded" }
  );
  assert.deepEqual(
    rankReferralAttribution([row("first", NOW - 1), row("own", NOW)], "own"),
    { outcome: "duplicate" }
  );
  assert.deepEqual(
    rankReferralAttribution([row("tied", NOW), row("own", NOW)], "own"),
    { outcome: "retry" }
  );
  assert.deepEqual(
    rankReferralAttribution([{ id: "undated" }, row("own", NOW)], "own"),
    { outcome: "duplicate" }
  );
  assert.deepEqual(rankReferralAttribution([row("other", NOW)], "own"), { outcome: "retry" });
  assert.deepEqual(
    rankReferralAttribution([row("other", NOW)], "own", { truncated: true }),
    { outcome: "duplicate" }
  );
  assert.deepEqual(rankReferralAttribution([{ id: "own" }], "own"), { outcome: "retry" });
});

async function burst(store, count, refereeId = "referee") {
  return await Promise.all(Array.from({ length: count }, (_, index) => (
    recordReferralAttribution(store, {
      referrerId: `referrer-${index % 3}`,
      refereeId,
      code: `CODE${index % 3}`
    })
  )));
}

test("parallel attributions for one referee leave exactly one Referral row", async () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = mulberry32(seed);
    const store = fakeEntityStore(rng, { now: NOW });
    const results = await burst(store, 8);
    const recorded = results.filter((result) => result.recorded).length;
    assert.equal(recorded, 1, `seed ${seed}: ${recorded} recorded`);
    assert.equal(store.rows.length, 1, `seed ${seed}: one row survives`);
    assert.equal(results.filter((result) => result.outcome === "retry").length, 0, `seed ${seed}`);
  }
});

test("same-millisecond parallel attributions never leave more than one row", async () => {
  let settledByRetry = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = mulberry32(seed);
    const store = fakeEntityStore(rng, { now: NOW, tieEvery: 8 });
    const results = await burst(store, 8);
    assert.ok(store.rows.length <= 1, `seed ${seed}: ${store.rows.length} rows`);
    assert.equal(results.filter((result) => result.recorded).length, store.rows.length, `seed ${seed}`);
    if (store.rows.length === 0) {
      // Every tied request backed off; the client's retry records it sequentially.
      assert.ok(results.some((result) => result.outcome === "retry"), `seed ${seed}`);
      const [retry] = await burst(store, 1);
      assert.equal(retry.recorded, true, `seed ${seed}`);
      settledByRetry += 1;
    }
    assert.equal(store.rows.length, 1, `seed ${seed}`);
  }
  assert.ok(settledByRetry > 0, "the simulation exercised the tie path");
});

test("a referee with an existing attribution is not attributed again", async () => {
  const rng = mulberry32(7);
  const store = fakeEntityStore(rng, { now: NOW });
  assert.deepEqual(
    await recordReferralAttribution(store, { referrerId: "a", refereeId: "referee", code: "CODEA" }),
    { recorded: true, outcome: "recorded" }
  );
  assert.deepEqual(
    await recordReferralAttribution(store, { referrerId: "b", refereeId: "referee", code: "CODEB" }),
    { recorded: false, outcome: "existing" }
  );
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].referrer_id, "a");
  // Another referee is unaffected.
  assert.equal(
    (await recordReferralAttribution(store, { referrerId: "a", refereeId: "other", code: "CODEA" })).recorded,
    true
  );
});

test("the simulation detects the original check-then-create referral race", async () => {
  async function legacy(store, { referrerId, refereeId, code }) {
    const existing = await store.filter({ referee_id: refereeId }, "-created_date", 1);
    if (existing.length) return { recorded: false };
    await store.create({ referrer_id: referrerId, referee_id: refereeId, code, status: "pending" });
    return { recorded: true };
  }
  let duplicated = false;
  for (let seed = 1; seed <= 20 && !duplicated; seed += 1) {
    const store = fakeEntityStore(mulberry32(seed), { now: NOW });
    await Promise.all(Array.from({ length: 8 }, () => (
      legacy(store, { referrerId: "r", refereeId: "referee", code: "CODE1" })
    )));
    duplicated = store.rows.length > 1;
  }
  assert.ok(duplicated);
});

test("recordReferralSignup uses the shared eligibility and rank-after-insert attribution", () => {
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/recordReferralSignup/entry.ts"),
    "utf8"
  );
  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.match(source, /referralEligibility\(user, referrerId\)/);
  assert.match(source, /recordReferralAttribution\(/);
  assert.doesNotMatch(source, /Referral\.create\(/);
});
