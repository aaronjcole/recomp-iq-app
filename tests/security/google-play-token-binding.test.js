import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_PLAY_SOURCE,
  bindGooglePlayPurchaseToken,
  rankGooglePlayBinding
} from "../../base44/shared/googlePlayPurchaseDomain.js";
import { PREMIUM_PRODUCTS } from "../../base44/shared/premiumDomain.js";
import { fakeEntityStore, mulberry32 } from "./fakeEntityStore.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-10-20T12:00:00.000Z");
// One purchase token, hashed exactly as the function stores it.
const TOKEN_HASH = "a".repeat(64);
const at = (ms) => new Date(ms).toISOString();
const row = (id, ms) => ({ id, created_date: ms === null ? undefined : at(ms) });

test("rankGooglePlayBinding keeps the earliest binding and names the rest duplicates", () => {
  assert.deepEqual(rankGooglePlayBinding([row("own", NOW)], "own"), {
    isWinner: true,
    duplicateIds: []
  });
  assert.deepEqual(rankGooglePlayBinding([row("own", NOW), row("later", NOW + 1)], "own"), {
    isWinner: true,
    duplicateIds: ["later"]
  });
  assert.deepEqual(rankGooglePlayBinding([row("first", NOW - 1), row("own", NOW)], "own"), {
    isWinner: false,
    duplicateIds: []
  });
  // Same millisecond: the lowest id wins, so every racer agrees on one winner.
  assert.deepEqual(rankGooglePlayBinding([row("a-own", NOW), row("b-other", NOW)], "a-own"), {
    isWinner: true,
    duplicateIds: ["b-other"]
  });
  assert.deepEqual(rankGooglePlayBinding([row("b-own", NOW), row("a-other", NOW)], "b-own"), {
    isWinner: false,
    duplicateIds: []
  });
  // An undatable row might be older than ours, so it outranks us.
  assert.deepEqual(rankGooglePlayBinding([{ id: "undated" }, row("own", NOW)], "own"), {
    isWinner: false,
    duplicateIds: []
  });
  assert.deepEqual(rankGooglePlayBinding([row("own", null)], "own"), {
    isWinner: false,
    duplicateIds: []
  });
  // Our own write is not visible yet: nothing can be proven.
  assert.deepEqual(rankGooglePlayBinding([row("other", NOW)], "own"), {
    isWinner: false,
    duplicateIds: []
  });
  assert.deepEqual(rankGooglePlayBinding(null, "own"), { isWinner: false, duplicateIds: [] });
});

const bind = (store, userId) => bindGooglePlayPurchaseToken(store, {
  userId,
  productId: PREMIUM_PRODUCTS.BUNDLE,
  tokenHash: TOKEN_HASH,
  expiresAt: null
});

const countActive = (store) => store.rows.filter(
  (entry) => entry.external_transaction_id === TOKEN_HASH
    && entry.source === GOOGLE_PLAY_SOURCE
    && entry.status === "active"
).length;

test("parallel verifications of one purchase token leave one account entitled", async () => {
  for (const tieEvery of [1, 8]) {
    for (let seed = 1; seed <= 100; seed += 1) {
      const store = fakeEntityStore(mulberry32(seed), { now: NOW, tieEvery });
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) => bind(store, `user-${index}`))
      );
      assert.equal(countActive(store), 1, `tieEvery ${tieEvery} seed ${seed}: active bindings`);
      assert.ok(
        results.some((result) => result.linked),
        `tieEvery ${tieEvery} seed ${seed}: one request keeps the token`
      );
    }
  }
});

test("the simulation detects the original check-then-create purchase-token race", async () => {
  async function legacy(store, userId) {
    const linked = await store.filter(
      { external_transaction_id: TOKEN_HASH, source: GOOGLE_PLAY_SOURCE },
      "-created_date",
      1
    );
    if (linked.length && linked[0].owner_id !== userId) return { linked: false };
    const existing = await store.filter(
      { owner_id: userId, product_id: PREMIUM_PRODUCTS.BUNDLE, source: GOOGLE_PLAY_SOURCE },
      "-created_date",
      1
    );
    if (!existing.length) {
      await store.create({
        owner_id: userId,
        product_id: PREMIUM_PRODUCTS.BUNDLE,
        source: GOOGLE_PLAY_SOURCE,
        status: "active",
        external_transaction_id: TOKEN_HASH
      });
    }
    return { linked: true };
  }

  let fannedOut = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const store = fakeEntityStore(mulberry32(seed), { now: NOW });
    await Promise.all(Array.from({ length: 8 }, (_, index) => legacy(store, `user-${index}`)));
    if (countActive(store) > 1) fannedOut += 1;
  }
  assert.ok(fannedOut > 0, "the old read-then-write binding must fan one purchase out");
});

test("a repeat verification refreshes the same binding instead of adding one", async () => {
  const store = fakeEntityStore(mulberry32(3), { now: NOW, tieEvery: 1 });
  assert.deepEqual(await bind(store, "user-1"), { linked: true, conflict: false });
  assert.deepEqual(await bind(store, "user-1"), { linked: true, conflict: false });
  assert.equal(store.rows.length, 1);
  assert.equal(countActive(store), 1);

  const repeat = await bind(store, "user-2");
  assert.deepEqual(repeat, { linked: false, conflict: true });
  assert.equal(store.rows.length, 1, "the replaying account adds nothing");
  assert.equal(store.rows[0].owner_id, "user-1");
});

test("an entitlement from before token binding is bound to the token once", async () => {
  const store = fakeEntityStore(mulberry32(5), {
    now: NOW,
    initial: [{
      id: "legacy-1",
      owner_id: "user-1",
      product_id: PREMIUM_PRODUCTS.BUNDLE,
      source: GOOGLE_PLAY_SOURCE,
      status: "active",
      created_date: at(NOW)
    }]
  });
  assert.deepEqual(await bind(store, "user-1"), { linked: true, conflict: false });
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].external_transaction_id, TOKEN_HASH);
  assert.equal(countActive(store), 1);
});

test("verifyGooglePlayPurchase binds the token through the shared race-safe module", () => {
  const source = readFileSync(
    resolve(repoRoot, "base44/functions/verifyGooglePlayPurchase/entry.ts"),
    "utf8"
  );
  assert.match(source, /bindGooglePlayPurchaseToken\(/);
  assert.match(source, /enqueueByToken\(tokenHash/);
  // The check-then-act token lookup must not come back into the entry.
  assert.doesNotMatch(source, /PremiumEntitlement\.filter/);
  assert.doesNotMatch(source, /PremiumEntitlement\.create/);
});