import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("sleep insights stay in the free Today experience and use explicit logs", () => {
  const today = readFileSync(resolve(repoRoot, "src/pages/Today.jsx"), "utf8");
  const card = readFileSync(resolve(repoRoot, "src/components/today/SleepCard.jsx"), "utf8");
  const quickLog = readFileSync(resolve(repoRoot, "src/components/today/QuickLogSheet.jsx"), "utf8");

  assert.match(today, /<SleepCard/);
  assert.doesNotMatch(card, /Premium|usePremiumAccess|canAccess|featureFlags/);
  assert.match(quickLog, /sleep_hours: num\(form\.sleep_hours\)/);
  assert.match(quickLog, /sleep_quality: num\(form\.sleep_quality\)/);
});

