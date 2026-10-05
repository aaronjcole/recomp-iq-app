import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYSIS_UPLOAD_MAX_BYTES,
  AnalysisUploadError,
  MAX_ANALYSIS_PHOTO_REFERENCES,
  PhotoReferenceOwnershipError,
  analysisUploadRecord,
  assertOwnedPhotoReferences,
  validateAnalysisUploadFile,
  verifyPhotoReferenceOwnership
} from "../../base44/shared/analysisUploadDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const ALICE = "user-alice";
const BOB = "user-bob";
const aliceUpload = { owner_id: ALICE, file_uri: "private/a/meal.png" };
const bobUpload = { owner_id: BOB, file_uri: "private/b/meal.png" };

test("references the caller uploaded pass the ownership check", () => {
  assert.deepEqual(
    assertOwnedPhotoReferences(["private/a/meal.png"], [aliceUpload, bobUpload], ALICE),
    ["private/a/meal.png"]
  );
});

test("another account's reference is refused even when its record is supplied", () => {
  assert.throws(
    () => assertOwnedPhotoReferences(["private/b/meal.png"], [aliceUpload, bobUpload], ALICE),
    PhotoReferenceOwnershipError
  );
  // One foreign pose among owned ones refuses the whole request.
  assert.throws(
    () => assertOwnedPhotoReferences(
      ["private/a/meal.png", "private/b/meal.png"],
      [aliceUpload, bobUpload],
      ALICE
    ),
    PhotoReferenceOwnershipError
  );
});

test("unrecorded references, missing owners, and malformed lists are refused", () => {
  assert.throws(() => assertOwnedPhotoReferences(["private/x.png"], [], ALICE), PhotoReferenceOwnershipError);
  assert.throws(() => assertOwnedPhotoReferences(["private/x.png"], null, ALICE), PhotoReferenceOwnershipError);
  assert.throws(() => assertOwnedPhotoReferences(["private/a/meal.png"], [aliceUpload], ""), PhotoReferenceOwnershipError);
  assert.throws(() => assertOwnedPhotoReferences([], [aliceUpload], ALICE), PhotoReferenceOwnershipError);
  assert.throws(() => assertOwnedPhotoReferences([42], [aliceUpload], ALICE), PhotoReferenceOwnershipError);
  // A record without an owner never matches an empty/undefined owner.
  assert.throws(
    () => assertOwnedPhotoReferences(["private/x.png"], [{ file_uri: "private/x.png" }], undefined),
    PhotoReferenceOwnershipError
  );
});

test("the number of references one request may sign is bounded", () => {
  const uris = Array.from({ length: MAX_ANALYSIS_PHOTO_REFERENCES + 1 }, (_, i) => `private/a/${i}.png`);
  const records = uris.map((file_uri) => ({ owner_id: ALICE, file_uri }));
  assert.throws(() => assertOwnedPhotoReferences(uris, records, ALICE), /Too many/);
  assert.throws(
    () => assertOwnedPhotoReferences(["x".repeat(2_001)], [], ALICE),
    PhotoReferenceOwnershipError
  );
});

test("the lookup is always bound to the caller's owner_id", async () => {
  const filters = [];
  const entity = {
    async filter(query, sort, limit) {
      filters.push({ query, sort, limit });
      // A misbehaving store returning a foreign row must still not grant access.
      return [bobUpload];
    }
  };
  await assert.rejects(
    () => verifyPhotoReferenceOwnership(entity, ALICE, ["private/b/meal.png"]),
    PhotoReferenceOwnershipError
  );
  assert.deepEqual(filters, [
    { query: { owner_id: ALICE, file_uri: "private/b/meal.png" }, sort: "-created_date", limit: 1 }
  ]);

  const owned = { async filter(query) { return [{ ...query }]; } };
  assert.deepEqual(
    await verifyPhotoReferenceOwnership(owned, ALICE, ["private/a/1.png", "private/a/2.png"]),
    ["private/a/1.png", "private/a/2.png"]
  );
  await assert.rejects(() => verifyPhotoReferenceOwnership(owned, "", ["private/a/1.png"]), PhotoReferenceOwnershipError);
});

test("uploads are validated and recorded with a server-set owner", () => {
  assert.doesNotThrow(() => validateAnalysisUploadFile({ type: "image/png", size: 10 }));
  assert.throws(() => validateAnalysisUploadFile({ type: "image/svg+xml", size: 10 }), AnalysisUploadError);
  assert.throws(() => validateAnalysisUploadFile({ type: "image/png", size: 0 }), AnalysisUploadError);
  assert.throws(
    () => validateAnalysisUploadFile({ type: "image/png", size: ANALYSIS_UPLOAD_MAX_BYTES + 1 }),
    AnalysisUploadError
  );
  assert.deepEqual(analysisUploadRecord(ALICE, "private/a/x.png", "food_photo"), {
    owner_id: ALICE,
    file_uri: "private/a/x.png",
    purpose: "food_photo"
  });
  assert.deepEqual(analysisUploadRecord(ALICE, "private/a/x.png", "other"), {
    owner_id: ALICE,
    file_uri: "private/a/x.png"
  });
  assert.throws(() => analysisUploadRecord(ALICE, undefined, "food_photo"), AnalysisUploadError);
  assert.throws(() => analysisUploadRecord("", "private/a/x.png"), AnalysisUploadError);
});

test("only the server can write AnalysisUpload records", () => {
  const entity = JSON.parse(read("base44/entities/AnalysisUpload.jsonc"));
  for (const action of ["create", "update", "delete"]) {
    assert.deepEqual(entity.rls[action], { user_condition: { role: "admin" } }, action);
  }
  assert.deepEqual(entity.rls.read.$or[0], { "data.owner_id": "{{user.id}}" });

  const upload = read("base44/functions/uploadAnalysisPhoto/entry.ts");
  assert.match(upload, /user = await base44\.auth\.me\(\)/);
  assert.match(upload, /asServiceRole\.integrations\.Core\.UploadPrivateFile\(\{ file \}\)/);
  assert.match(upload, /analysisUploadRecord\(user\.id, uploaded\?\.file_uri, purpose\)/);
  assert.match(upload, /asServiceRole\.entities\.AnalysisUpload\.create\(record\)/);
  assert.ok(
    upload.indexOf("validateAnalysisUploadFile(file)") < upload.indexOf("UploadPrivateFile("),
    "the file is validated before it is stored"
  );
});

for (const [path, refs] of [
  ["base44/functions/analyzeFoodPhoto/entry.ts", "[photoUri]"],
  ["base44/functions/analyzeBodyComposition/entry.ts", "Object.values(request.photoRefs)"]
]) {
  test(`${path} verifies photo ownership before signing any reference`, () => {
    const server = read(path);
    const check = server.indexOf("await verifyPhotoReferenceOwnership(");
    const signing = server.indexOf("CreateFileSignedUrl");
    assert.ok(check >= 0 && check < signing, "ownership must be verified before a signed URL is created");
    assert.ok(server.slice(check, signing).includes("base44.asServiceRole.entities.AnalysisUpload"));
    assert.ok(server.slice(check, signing).includes("user.id"));
    assert.ok(server.slice(check, signing).includes(refs));
    assert.match(server, /error instanceof PhotoReferenceOwnershipError[\s\S]*?status: 403/);
  });
}
