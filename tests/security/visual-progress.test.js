import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("Visual Progress Check stays in the Progress tab and requires Premium access", () => {
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const page = readFileSync(resolve(repoRoot, "src/pages/VisualProgressCheck.jsx"), "utf8");
  const progress = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  const premium = readFileSync(resolve(repoRoot, "src/pages/Premium.jsx"), "utf8");

  assert.match(app, /path=["']\/progress\/visual-check["']/);
  assert.match(page, /canAccess\(PREMIUM_FEATURES\.VISUAL_PROGRESS\)/);
  assert.match(progress, /to=["']\/progress\/visual-check["']/);
  assert.match(premium, /to:\s*["']\/progress\?section=photos["']/);
  assert.match(progress, /sectionFromSearch\(location\.search\)/);
});

test("Visual Progress Check reads only the on-device photo store and makes no biometric estimate", () => {
  const page = readFileSync(resolve(repoRoot, "src/pages/VisualProgressCheck.jsx"), "utf8");
  const helper = readFileSync(resolve(repoRoot, "src/lib/fitness/visualProgress.js"), "utf8");
  const source = `${page}\n${helper}`;

  assert.match(page, /from ["']@\/lib\/progressPhotos["']/);
  assert.match(page, /listPhotos/);
  assert.match(page, /getPhotoBlob/);
  assert.match(page, /No uploads, no AI analysis/);
  assert.doesNotMatch(source, /UploadPrivateFile|CreateFileSignedUrl|InvokeLLM/);
  assert.doesNotMatch(source, /bodyFatPercentage|leanMass|body_fat|lean_mass/);
  assert.doesNotMatch(helper, /\bnote\b/);
});

// Minimal IndexedDB stand-in: enough of open/transaction/index/cursor to prove
// which records progressPhotos reads and how many connections it opens.
function installFakeIndexedDB(records) {
  const stats = { opens: 0, storeScans: 0, connections: [] };
  const later = (fn) => queueMicrotask(fn);
  const request = () => ({ onsuccess: null, onerror: null, result: undefined });
  const succeed = (req, result) => later(() => {
    req.result = result;
    req.onsuccess?.();
  });

  function cursorOver(matches) {
    const req = request();
    let position = 0;
    const step = () => {
      if (position >= matches.length) return succeed(req, null);
      const value = matches[position];
      succeed(req, {
        value,
        continue: () => {
          position += 1;
          step();
        },
        delete: () => records.splice(records.indexOf(value), 1),
      });
    };
    step();
    return req;
  }

  function objectStore() {
    return {
      getAll() {
        stats.storeScans += 1;
        const req = request();
        succeed(req, [...records]);
        return req;
      },
      get(id) {
        const req = request();
        succeed(req, records.find((record) => record.id === id));
        return req;
      },
      index(name) {
        assert.equal(name, "userId");
        return {
          openCursor(range) {
            return cursorOver(records.filter((record) => record.userId === range.only));
          },
        };
      },
    };
  }

  globalThis.IDBKeyRange = { only: (value) => ({ only: value }) };
  globalThis.indexedDB = {
    open() {
      stats.opens += 1;
      const req = request();
      const db = {
        closed: false,
        objectStoreNames: { contains: () => true },
        transaction() {
          assert.equal(db.closed, false, "transaction on a closed connection");
          return { objectStore };
        },
        close() {
          db.closed = true;
        },
      };
      stats.connections.push(db);
      succeed(req, db);
      return req;
    },
  };
  return stats;
}

test("progress photo storage reads only the signed-in user's metadata over one connection", async () => {
  const blob = (size) => ({ size, type: "image/jpeg" });
  const records = [
    { id: "a1", userId: "alice", created_at: 1, sizeBytes: 100, fullBlob: blob(80), thumbBlob: blob(20) },
    { id: "b1", userId: "bob", created_at: 2, sizeBytes: 9000, fullBlob: blob(8000), thumbBlob: blob(1000) },
    { id: "a2", userId: "alice", created_at: 3, sizeBytes: 250, fullBlob: blob(200), thumbBlob: blob(50) },
  ];
  const stats = installFakeIndexedDB(records);
  const photos = await import(`../../src/lib/progressPhotos.js?fake=${Date.now()}`);

  const [list, usage] = await Promise.all([
    photos.listPhotos("alice"),
    photos.estimateUsage("alice"),
  ]);
  assert.deepEqual(list.map((photo) => photo.id), ["a2", "a1"]);
  for (const photo of list) {
    assert.equal("fullBlob" in photo, false);
    assert.equal("thumbBlob" in photo, false);
  }
  assert.equal(usage, 350, "usage excludes other accounts on the device");
  assert.equal(photos.photoUsageBytes(list), 350);
  assert.equal(await photos.estimateUsage(null), 0);
  assert.deepEqual(await photos.listPhotos(undefined), []);

  await photos.getPhotoBlob("a1", "thumb");
  await photos.getPhotoBlob("a2", "thumb");
  assert.equal(stats.opens, 1, "every operation shares one cached connection");
  assert.equal(stats.storeScans, 0, "no whole-store getAll() of every account's blobs");

  // Another tab upgrading or deleting the database must not be blocked.
  const [first] = stats.connections;
  assert.equal(typeof first.onversionchange, "function");
  first.onversionchange();
  assert.equal(first.closed, true);
  assert.deepEqual((await photos.listPhotos("bob")).map((photo) => photo.id), ["b1"]);
  assert.equal(stats.opens, 2, "a closed connection is reopened on next use");
  delete globalThis.indexedDB;
  delete globalThis.IDBKeyRange;
});

test("progress photo helpers sort newest first and sum only declared sizes", async () => {
  const { meta, photoUsageBytes, sortPhotosNewestFirst } = await import(
    "../../src/lib/progressPhotos.js"
  );
  const input = [{ id: "x", created_at: 5 }, { id: "y", created_at: 9 }, { id: "z" }];
  assert.deepEqual(sortPhotosNewestFirst(input).map((p) => p.id), ["y", "x", "z"]);
  assert.deepEqual(input.map((p) => p.id), ["x", "y", "z"], "input is not mutated");
  assert.equal(photoUsageBytes([{ sizeBytes: 10 }, { sizeBytes: "5" }, {}, null]), 15);
  assert.deepEqual(meta({ id: "x", fullBlob: 1, thumbBlob: 2, pose: "Front" }), {
    id: "x",
    pose: "Front",
  });

  const component = readFileSync(
    resolve(repoRoot, "src/components/progress/ProgressPhotos.jsx"),
    "utf8",
  );
  assert.doesNotMatch(component, /estimateUsage\(\)/, "usage must be scoped to the user");
});
