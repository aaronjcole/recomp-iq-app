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

  const foodPhoto = readFileSync(
    resolve(repoRoot, "base44/functions/analyzeFoodPhoto/entry.ts"),
    "utf8"
  );
  assert.match(foodPhoto, /SIGNED_URL_TTL_SECONDS = 300/);
  assert.match(
    foodPhoto,
    /const\s+signed\s*=\s*await\s+base44\.asServiceRole\.integrations\.Core\.CreateFileSignedUrl\(\s*\{\s*file_uri:\s*photoUri,\s*expires_in:\s*SIGNED_URL_TTL_SECONDS\s*\}\s*\)/
  );
  assert.match(
    foodPhoto,
    /base44\.asServiceRole\.integrations\.Core\.InvokeLLM\(\s*\{[\s\S]*?file_urls:\s*\[\s*signed\.signed_url\s*\][\s\S]*?\}\s*\)/
  );

  const bodyComposition = readFileSync(
    resolve(repoRoot, "base44/functions/analyzeBodyComposition/entry.ts"),
    "utf8"
  );
  assert.match(bodyComposition, /SIGNED_URL_TTL_SECONDS = 300/);
  assert.match(
    bodyComposition,
    /const\s+fileUrls\s*=\s*await\s+Promise\.all\([\s\S]*?const\s+signed\s*=\s*await\s+base44\.asServiceRole\.integrations\.Core\.CreateFileSignedUrl\(\s*\{\s*file_uri:\s*request\.photoRefs\[pose\],\s*expires_in:\s*SIGNED_URL_TTL_SECONDS\s*\}\s*\)[\s\S]*?return\s+signed\.signed_url;[\s\S]*?\)\s*\)/
  );
  assert.match(
    bodyComposition,
    /base44\.asServiceRole\.integrations\.Core\.InvokeLLM\(\s*\{[\s\S]*?file_urls:\s*fileUrls[\s\S]*?\}\s*\)/
  );
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
