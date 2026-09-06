import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYSIS_IMAGE_MAX_BYTES,
  uploadPrivateAnalysisImage,
  validateAnalysisImage
} from "../../src/lib/analysisImages.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
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

test("analysis images keep signed URL creation and paid inference on the server", () => {
  const client = readFileSync(resolve(repoRoot, "src/lib/analysisImages.js"), "utf8");
  assert.doesNotMatch(client, /CreateFileSignedUrl|InvokeLLM/);

  for (const path of [
    "base44/functions/analyzeFoodPhoto/entry.ts",
    "base44/functions/analyzeBodyComposition/entry.ts"
  ]) {
    const server = readFileSync(resolve(repoRoot, path), "utf8");
    assert.match(server, /base44\.asServiceRole\.integrations\.Core\.CreateFileSignedUrl/);
    assert.match(server, /SIGNED_URL_TTL_SECONDS = 300/);
    assert.match(server, /expires_in:\s*SIGNED_URL_TTL_SECONDS/);
    assert.match(server, /base44\.asServiceRole\.integrations\.Core\.InvokeLLM/);
    assert.ok(
      server.indexOf("CreateFileSignedUrl") < server.indexOf("InvokeLLM"),
      `${path} must create the short-lived URL before invoking the model`
    );
  }
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

  await assert.rejects(() => uploadPrivateAnalysisImage(core, validFile), /private image upload/i);
});
