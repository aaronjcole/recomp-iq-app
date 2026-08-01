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

test("mobile release flows prioritize primary actions and usable touch targets", () => {
  const nutritionSource = readFileSync(resolve(repoRoot, "src/pages/Nutrition.jsx"), "utf8");
  assert.ok(
    nutritionSource.indexOf("Quick add food") < nutritionSource.indexOf("Macro breakdown"),
    "food logging should appear before secondary nutrition analysis"
  );
  assert.match(nutritionSource, /<details className="group border-b border-lineSoft">/);
  assert.match(nutritionSource, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);

  const moreSource = readFileSync(resolve(repoRoot, "src/pages/More.jsx"), "utf8");
  assert.match(moreSource, /\/nutrition\?panel=targets/);

  const coachSource = readFileSync(resolve(repoRoot, "src/pages/Coach.jsx"), "utf8");
  assert.match(coachSource, /Start with what happened today/);
  assert.match(coachSource, /grid grid-cols-2 gap-2/);
  assert.match(coachSource, /Review prepared action/);
  assert.match(coachSource, /No target, meal, or workout has been changed/);
  assert.match(coachSource, /preparedAction:\s*reply\.safetyNote\s*\?\s*null/);

  const todaySource = readFileSync(resolve(repoRoot, "src/pages/Today.jsx"), "utf8");
  assert.match(todaySource, /<BestMoveCard/);
  assert.ok(
    todaySource.indexOf("<BestMoveCard") < todaySource.indexOf("<RecompSignalHero"),
    "the single daily action should appear before supporting signal detail"
  );
  const bestMoveSource = readFileSync(resolve(repoRoot, "src/components\/today\/BestMoveCard.jsx"), "utf8");
  assert.match(bestMoveSource, /Today&apos;s best move/);
  assert.match(bestMoveSource, /Why not the alternatives/);
  assert.match(bestMoveSource, /What would change this call/);

  const progressSource = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  assert.match(progressSource, /visibleData\.length < 2/);
  assert.match(progressSource, /Log a weigh-in/);
  assert.doesNotMatch(progressSource, /Log your first weigh-in/);
  assert.match(progressSource, /\{projection\.confidence\} confidence<\/Badge>/);

  const trainingSource = readFileSync(
    resolve(repoRoot, "src/components/training/SessionBuilder.jsx"),
    "utf8"
  );
  assert.doesNotMatch(trainingSource, /min-h-\[28px\]/);
  assert.match(trainingSource, /min-h-11/);
});

test("public legal and support routes are not blocked by app authentication errors", () => {
  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  for (const route of ["/privacy", "/terms", "/support", "/delete-account"]) {
    assert.match(appSource, new RegExp(`path=["']${route}["']`));
  }
  assert.doesNotMatch(appSource, /authError\?\.type\s*===\s*["']auth_required["']/);
  assert.doesNotMatch(appSource, /navigateToLogin\(\)/);
});
