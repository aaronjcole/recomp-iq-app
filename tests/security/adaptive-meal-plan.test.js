import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("adaptive meal planning verifies server entitlement before reading nutrition data", () => {
  const server = readFileSync(
    resolve(repoRoot, "base44/functions/generateAdaptiveMealPlan/entry.ts"),
    "utf8"
  );

  assert.match(server, /req\.method !== "POST"/);
  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /PREMIUM_FEATURES\.MEAL_PLANNING/);
  assert.match(server, /created_by_id:\s*userId/);
  assert.match(server, /preferences\?\.safety_flags/);
  assert.doesNotMatch(server, /InvokeLLM/);
  assert.doesNotMatch(server, /\bemail\b/i);

  const authorization = server.indexOf("const entitlements = await listAllEntitlements");
  const nutritionRead = server.indexOf('ownedRecords(base44, "CurrentStrategy"');
  assert.ok(authorization >= 0 && authorization < nutritionRead);
});

test("meal planning is exposed inside Fuel and remains gated in both UI and backend", () => {
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const page = readFileSync(resolve(repoRoot, "src/pages/AdaptiveMealPlan.jsx"), "utf8");
  const nutrition = readFileSync(resolve(repoRoot, "src/pages/Nutrition.jsx"), "utf8");

  assert.match(app, /path=["']\/nutrition\/meal-plan["']/);
  assert.match(page, /canAccess\(PREMIUM_FEATURES\.MEAL_PLANNING\)/);
  assert.match(page, /generateAdaptiveMealPlan/);
  assert.match(nutrition, /to=["']\/nutrition\/meal-plan["']/);
});
