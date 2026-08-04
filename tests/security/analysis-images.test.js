import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_IMAGE_MAX_BYTES,
  ANALYSIS_URL_TTL_SECONDS,
  createPrivateAnalysisUrl,
  uploadPrivateAnalysisImage,
  validateAnalysisImage
} from "../../src/lib/analysisImages.js";

const validFile = { type: "image/jpeg", size: 1024 };

test("analysis images enforce an explicit type and size allowlist", () => {
  assert.doesNotThrow(() => validateAnalysisImage(validFile));
  assert.throws(
    () => validateAnalysisImage({ type: "image/svg+xml", size: 1024 }),
    /JPEG, PNG, or WebP/
  );
  assert.throws(
    () => validateAnalysisImage({ type: "image/png", size: ANALYSIS_IMAGE_MAX_BYTES + 1 }),
    /smaller than 10 MB/
  );
  assert.throws(
    () => validateAnalysisImage({ type: "image/png", size: 0 }),
    /empty or unreadable/
  );
});

test("analysis images use private storage and a short-lived signed URL", async () => {
  const calls = [];
  const core = {
    async UploadPrivateFile(payload) {
      calls.push(["upload", payload]);
      return { file_uri: "private/user/image.jpg" };
    },
    async CreateFileSignedUrl(payload) {
      calls.push(["sign", payload]);
      return { signed_url: "https://example.test/temporary-image" };
    }
  };

  const result = await createPrivateAnalysisUrl(core, validFile);

  assert.deepEqual(result, {
    fileUri: "private/user/image.jpg",
    signedUrl: "https://example.test/temporary-image"
  });
  assert.deepEqual(calls, [
    ["upload", { file: validFile }],
    [
      "sign",
      {
        file_uri: "private/user/image.jpg",
        expires_in: ANALYSIS_URL_TTL_SECONDS
      }
    ]
  ]);
});

test("analysis images can upload privately without exposing a signed URL to the client", async () => {
  const calls = [];
  const core = {
    async UploadPrivateFile(payload) {
      calls.push(payload);
      return { file_uri: "private/user/image.jpg" };
    }
  };

  assert.equal(await uploadPrivateAnalysisImage(core, validFile), "private/user/image.jpg");
  assert.deepEqual(calls, [{ file: validFile }]);
});

test("analysis upload fails closed when Base44 omits a private reference", async () => {
  const core = {
    async UploadPrivateFile() {
      return {};
    }
  };

  await assert.rejects(() => createPrivateAnalysisUrl(core, validFile), /private image upload/i);
});
