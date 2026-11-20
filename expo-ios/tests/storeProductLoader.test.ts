import test from "node:test";
import assert from "node:assert/strict";
import { createStoreProductLoader } from "../src/storeProductLoader.ts";

test("startup and paywall share one request and reuse prices", async () => {
  let calls = 0;
  const loader = createStoreProductLoader(async () => { calls++; return ["price"]; });
  assert.equal(loader.load(), loader.load());
  assert.deepEqual(await loader.load(), ["price"]);
  await loader.load();
  assert.equal(calls, 1);
});

test("empty and failed lookups are retried instead of cached forever", async () => {
  let calls = 0;
  const loader = createStoreProductLoader(async () => {
    calls++;
    if (calls === 1) return [];
    if (calls === 2) throw new Error("offline");
    return ["price"];
  });
  await assert.rejects(loader.load(), /no products/);
  await assert.rejects(loader.load(), /offline/);
  assert.deepEqual(await loader.load(), ["price"]);
});

test("timed-out results cannot overwrite a successful retry", async () => {
  let finish!: (value: string[]) => void;
  let calls = 0;
  const loader = createStoreProductLoader(() => ++calls === 1
    ? new Promise<string[]>((resolve) => { finish = resolve; }) : Promise.resolve(["new"]), 10);
  await assert.rejects(loader.load(), /timed out/);
  assert.deepEqual(await loader.load(), ["new"]);
  finish(["stale"]);
  await Promise.resolve();
  assert.deepEqual(await loader.load(), ["new"]);
  loader.dispose();
  await assert.rejects(loader.load(), /closed/);
});
