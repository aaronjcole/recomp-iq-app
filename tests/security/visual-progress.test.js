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
