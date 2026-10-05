import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("sleep insights stay in the free Today experience and use explicit logs", () => {
  const today = readFileSync(resolve(repoRoot, "src/pages/Today.jsx"), "utf8");
  const checklist = readFileSync(resolve(repoRoot, "src/components/today/TodayChecklist.jsx"), "utf8");
  const card = readFileSync(resolve(repoRoot, "src/components/today/SleepCard.jsx"), "utf8");
  const quickLog = readFileSync(resolve(repoRoot, "src/components/today/QuickLogSheet.jsx"), "utf8");

  assert.match(today, /<TodayChecklist/);
  assert.match(checklist, /<SleepCard/);
  assert.doesNotMatch(card, /Premium|usePremiumAccess|canAccess|featureFlags/);
  // Sleep hours save from Simple view; sleep quality from Full view, which
  // saves every EMPTY_FORM field through buildDailyLogPatch.
  assert.match(quickLog, /const SIMPLE_KEYS = \[[^\]]*"sleep_hours"/);
  assert.match(quickLog, /const FULL_KEYS = Object\.keys\(EMPTY_FORM\)/);
  assert.match(quickLog, /EMPTY_FORM = \{[^}]*sleep_quality: ""/);
  assert.match(quickLog, /set\("sleep_hours", v\)/);
  assert.match(quickLog, /set\("sleep_quality", v\)/);
});
