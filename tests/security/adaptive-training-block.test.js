import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("adaptive training verifies server entitlement before reading training history", () => {
  const server = readFileSync(
    resolve(repoRoot, "base44/functions/generateAdaptiveTrainingBlock/entry.ts"),
    "utf8"
  );

  assert.match(server, /req\.method !== "POST"/);
  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /PREMIUM_FEATURES\.TRAINING_PLANNING/);
  assert.match(server, /created_by_id:\s*userId/);
  assert.match(server, /preferences\?\.safety_flags/);
  assert.doesNotMatch(server, /InvokeLLM/);
  assert.doesNotMatch(server, /\bemail\b/i);

  const authorization = server.indexOf("const entitlements = await listAllEntitlements");
  const historyRead = server.indexOf('ownedRecords(base44, "ExerciseSession"');
  assert.ok(authorization >= 0 && authorization < historyRead);
});

test("training blocks stay in the Train tab and are gated in UI and backend", () => {
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const page = readFileSync(resolve(repoRoot, "src/pages/AdaptiveTrainingBlock.jsx"), "utf8");
  const training = readFileSync(resolve(repoRoot, "src/pages/Training.jsx"), "utf8");

  assert.match(app, /path=["']\/training\/plan["']/);
  assert.match(page, /canAccess\(PREMIUM_FEATURES\.TRAINING_PLANNING\)/);
  assert.match(page, /generateAdaptiveTrainingBlock/);
  assert.match(training, /to=["']\/training\/plan["']/);
});
