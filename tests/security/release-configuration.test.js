import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { enabledFromEnvironment, featureFlags } from "../../src/lib/featureFlags.js";
import {
  ACCOUNT_DELETION_MAILTO,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  SUPPORT_REQUEST_MAILTO
} from "../../src/lib/support.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("sensitive photo analysis is disabled unless explicitly enabled", () => {
  assert.equal(featureFlags.bodyCompositionScan, false);
  assert.equal(featureFlags.foodPhotoScan, false);
  assert.equal(enabledFromEnvironment(undefined), false);
  assert.equal(enabledFromEnvironment("false"), false);
  assert.equal(enabledFromEnvironment("TRUE"), false);
  assert.equal(enabledFromEnvironment("true"), true);

  const progressSource = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  assert.match(progressSource, /featureFlags\.bodyCompositionScan\s*&&\s*<BodyCompositionScan/);

  const nutritionSource = readFileSync(resolve(repoRoot, "src/pages/Nutrition.jsx"), "utf8");
  assert.match(nutritionSource, /featureFlags\.foodPhotoScan\s*&&/);
  assert.match(nutritionSource, /featureFlags\.foodPhotoScan\s*&&\s*showPhotoScan/);
});

test("support contact is consistent and exposed in the app and privacy policy", () => {
  assert.equal(SUPPORT_EMAIL, "recompappsupport@gmail.com");
  assert.equal(SUPPORT_MAILTO, `mailto:${SUPPORT_EMAIL}`);
  assert.match(SUPPORT_REQUEST_MAILTO, /^mailto:recompappsupport@gmail\.com\?/);
  assert.match(ACCOUNT_DELETION_MAILTO, /^mailto:recompappsupport@gmail\.com\?/);

  const expectedSupportTokens = new Map([
    ["src/pages/More.jsx", ["SUPPORT_EMAIL"]],
    ["src/pages/Privacy.jsx", ["SUPPORT_EMAIL", "SUPPORT_MAILTO"]],
    ["src/pages/Support.jsx", ["SUPPORT_EMAIL", "SUPPORT_REQUEST_MAILTO"]],
    ["src/pages/DeleteAccount.jsx", ["SUPPORT_EMAIL", "ACCOUNT_DELETION_MAILTO"]]
  ]);
  for (const [path, tokens] of expectedSupportTokens) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    for (const token of tokens) assert.match(source, new RegExp(token));
  }
});

test("launch configuration disables undeclared telemetry and unfinished store claims", () => {
  const viteSource = readFileSync(resolve(repoRoot, "vite.config.js"), "utf8");
  assert.match(viteSource, /analyticsTracker:\s*false/);

  for (const path of ["src/pages/Hero.jsx", "src/pages/ComingSoon.jsx", "src/pages/More.jsx", "index.html"]) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    assert.doesNotMatch(source, /Low monthly price|Cancel anytime|Get it on Google Play|Download on Google Play|Rate on Play Store|everything saves instantly|syncs across devices/i);
  }

  const moreSource = readFileSync(resolve(repoRoot, "src/pages/More.jsx"), "utf8");
  assert.doesNotMatch(moreSource, /Weekly email & export|Demo data/);
});

test("public legal and support routes are not blocked by app authentication errors", () => {
  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  for (const route of ["/privacy", "/terms", "/support", "/delete-account"]) {
    assert.match(appSource, new RegExp(`path=["']${route}["']`));
  }
  assert.doesNotMatch(appSource, /authError\?\.type\s*===\s*["']auth_required["']/);
  assert.doesNotMatch(appSource, /navigateToLogin\(\)/);
});
