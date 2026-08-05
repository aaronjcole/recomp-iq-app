import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { enabledFromEnvironment, featureFlags } from "../../src/lib/featureFlags.js";
import {
  ACCOUNT_DELETION_MAILTO,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  SUPPORT_REQUEST_MAILTO
} from "../../src/lib/support.js";
import { getRouteMetadata } from "../../src/lib/routeMetadata.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function fileExists(relativePath) {
  return existsSync(resolve(repoRoot, relativePath));
}

test("sensitive photo analysis is disabled unless explicitly enabled", () => {
  assert.equal(featureFlags.bodyCompositionScan, false);
  assert.equal(featureFlags.foodPhotoScan, false);
  assert.equal(enabledFromEnvironment(undefined), false);
  assert.equal(enabledFromEnvironment("false"), false);
  assert.equal(enabledFromEnvironment("TRUE"), false);
  assert.equal(enabledFromEnvironment("true"), true);

  const progressSource = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  assert.match(
    progressSource,
    /\(featureFlags\.bodyCompositionScan\s*\|\|\s*releaseFlags\.bodyCompositionScan\)\s*&&\s*canAccess\(PREMIUM_FEATURES\.VISUAL_PROGRESS\)/
  );

  const premiumAccessSource = readFileSync(
    resolve(repoRoot, "base44/functions/getPremiumAccess/entry.ts"),
    "utf8"
  );
  const bodyCompositionSource = readFileSync(
    resolve(repoRoot, "base44/functions/analyzeBodyComposition/entry.ts"),
    "utf8"
  );
  assert.match(premiumAccessSource, /Deno\.env\.get\(["']ENABLE_BODY_COMPOSITION_SCAN["']\)/);
  assert.match(bodyCompositionSource, /Deno\.env\.get\(["']ENABLE_BODY_COMPOSITION_SCAN["']\)/);
  assert.match(bodyCompositionSource, /BODY_COMPOSITION_SCAN_DISABLED/);

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

test("the waitlist collects nothing, and retained entries are still purged on deletion", () => {
  // The waitlist was retired: the form, the public joinWaitlist endpoint, and the
  // campaign-attribution builder are all gone. This replaces the old
  // "attribution is bounded" guarantee with a stronger one — nothing collects an
  // address or a campaign label at all.
  assert.equal(
    fileExists("base44/functions/joinWaitlist"),
    false,
    "the public waitlist endpoint must not come back without a decision about it"
  );
  assert.equal(
    fileExists("src/lib/marketingAttribution.js"),
    false,
    "campaign attribution has no caller; reviving it needs a privacy review"
  );

  const comingSoonSource = readFileSync(resolve(repoRoot, "src/pages/ComingSoon.jsx"), "utf8");
  assert.doesNotMatch(comingSoonSource, /buildWaitlistAttribution/);
  assert.doesNotMatch(comingSoonSource, /joinWaitlist/);
  assert.doesNotMatch(comingSoonSource, /type="email"/);
  assert.doesNotMatch(comingSoonSource, /waitlist-email/);
  assert.match(comingSoonSource, /No advertising cookies or cross-site tracking/);

  // The entity and its deletion path deliberately stay: addresses captured before
  // the form was removed are still stored, and account deletion must keep purging
  // a user's row. Dropping either would lose records or regress that guarantee.
  assert.equal(fileExists("base44/entities/WaitlistEntry.jsonc"), true);
  const deleteAccountSource = readFileSync(
    resolve(repoRoot, "base44/functions/deleteAccount/entry.ts"),
    "utf8"
  );
  assert.match(
    deleteAccountSource,
    /WaitlistEntry\.deleteMany/,
    "account deletion must still purge any retained waitlist row"
  );
});

test("mobile release flows prioritize primary actions and usable touch targets", () => {
  const appLayoutSource = readFileSync(resolve(repoRoot, "src/components/AppLayout.jsx"), "utf8");
  assert.match(appLayoutSource, /if \(location\.pathname !== to\) return/);
  assert.match(appLayoutSource, /scrollPositions\.current\[to\] = 0/);

  const recompContextSource = readFileSync(resolve(repoRoot, "src/lib/RecompContext.jsx"), "utf8");
  assert.ok(
    recompContextSource.indexOf("const optimistic = mergeDefined") <
      recompContextSource.indexOf('functions.invoke("upsertTrackingRecord"'),
    "daily quick logs should update the visible state before the network write"
  );
  assert.match(recompContextSource, /patchIsCurrent/);

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
  assert.match(coachSource, /preparedAction:\s*reply\.actionable\s*\?\s*preparedAction\s*:\s*null/);

  const quickLogSource = readFileSync(resolve(repoRoot, "src/components/today/QuickLogSheet.jsx"), "utf8");
  assert.match(quickLogSource, /<SheetDescription>/);
  assert.match(quickLogSource, /checked=\{!!form\.workout_completed\}/);

  const todaySource = readFileSync(resolve(repoRoot, "src/pages/Today.jsx"), "utf8");
  assert.match(todaySource, /<BestMoveCard/);
  assert.match(todaySource, /<RecompSignalHero/);
  assert.ok(
    todaySource.indexOf("<RecompSignalHero") < todaySource.indexOf("<BestMoveCard"),
    "the recomposition signal leads as the hero, with the best-move action directly beneath it"
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

  const childTopBarSource = readFileSync(resolve(repoRoot, "src/components/ChildTopBar.jsx"), "utf8");
  assert.match(childTopBarSource, /h-11 min-h-11 w-11 min-w-11/);

  const habitsSource = readFileSync(resolve(repoRoot, "src/components/today/HabitsCard.jsx"), "utf8");
  assert.doesNotMatch(habitsSource, /h-7 w-7/);
  assert.ok(
    (habitsSource.match(/h-11 min-h-11 w-11 min-w-11/g) || []).length >= 4,
    "habit edit, check, decrease, and increase controls should have real 44px targets"
  );

  const adaptiveSelectSource = readFileSync(
    resolve(repoRoot, "src/components/ui/adaptive-select.jsx"),
    "utf8"
  );
  assert.match(adaptiveSelectSource, /useIsMobile/);
  assert.match(adaptiveSelectSource, /<Drawer open=/);
  assert.match(adaptiveSelectSource, /min-h-12/);
  for (const path of [
    "src/components/onboarding/Fields.jsx",
    "src/components/onboarding/StepAbout.jsx",
    "src/pages/Profile.jsx",
    "src/components/progress/ProgressPhotos.jsx"
  ]) {
    assert.match(readFileSync(resolve(repoRoot, path), "utf8"), /AdaptiveSelect/);
  }

  for (const path of [
    "src/components/common/SignalStat.jsx",
    "src/components/common/DecisionLedgerTimeline.jsx",
    "src/components/training/StrengthProgressionCard.jsx",
    "src/components/progress/ProgressPhotos.jsx"
  ]) {
    assert.doesNotMatch(readFileSync(resolve(repoRoot, path), "utf8"), /text-\[(?:9|10)px\]/);
  }
});

test("route metadata stays accurate across public and authenticated navigation", () => {
  assert.equal(getRouteMetadata("/coach").title, "Coach | RecompOne");
  assert.equal(getRouteMetadata("/more/coach").title, "Coach | RecompOne");
  assert.equal(getRouteMetadata("/more/profile").title, "Profile | RecompOne");
  assert.equal(getRouteMetadata("/today").title, "Today | RecompOne");
  assert.equal(getRouteMetadata("/privacy/").title, "Privacy Policy | RecompOne");
  assert.equal(getRouteMetadata("/missing").title, "Page Not Found | RecompOne");

  const routeAccessibilitySource = readFileSync(
    resolve(repoRoot, "src/components/RouteAccessibility.jsx"),
    "utf8"
  );
  assert.match(routeAccessibilitySource, /document\.title = metadata\.title/);
  assert.match(routeAccessibilitySource, /href="#app-content"/);
  assert.match(routeAccessibilitySource, /aria-live="polite"/);

  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  assert.match(appSource, /id="app-content" tabIndex=\{-1\}/);

  const splashSource = readFileSync(resolve(repoRoot, "src/components/AppSplash.jsx"), "utf8");
  assert.doesNotMatch(splashSource, /id="main-content"/);
});

test("public legal and support routes are not blocked by app authentication errors", () => {
  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  for (const route of ["/privacy", "/terms", "/support", "/delete-account"]) {
    assert.match(appSource, new RegExp(`path=["']${route}["']`));
  }
  assert.doesNotMatch(appSource, /authError\?\.type\s*===\s*["']auth_required["']/);
  assert.doesNotMatch(appSource, /navigateToLogin\(\)/);
});
