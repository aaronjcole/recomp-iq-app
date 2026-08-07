import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("Weekly Autopilot verifies server entitlement before reading fitness history", () => {
  const server = readFileSync(
    resolve(repoRoot, "base44/functions/generateWeeklyAutopilot/entry.ts"),
    "utf8"
  );

  assert.match(server, /req\.method !== "POST"/);
  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /PREMIUM_FEATURES\.WEEKLY_AUTOPILOT/);
  assert.match(server, /created_by_id:\s*userId/);
  assert.doesNotMatch(server, /InvokeLLM/);
  assert.doesNotMatch(server, /\bemail\b/i);

  const authorization = server.indexOf("const entitlements = await listAllEntitlements");
  const historyRead = server.indexOf('ownedRecords(base44, "DailyLog"');
  assert.ok(authorization >= 0 && authorization < historyRead);
});

test("Weekly Autopilot stays in the Today tab and is gated in UI and backend", () => {
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const page = readFileSync(resolve(repoRoot, "src/pages/WeeklyAutopilot.jsx"), "utf8");
  const today = readFileSync(resolve(repoRoot, "src/pages/Today.jsx"), "utf8");

  assert.match(app, /path=["']\/today\/autopilot["']/);
  assert.match(page, /canAccess\(PREMIUM_FEATURES\.WEEKLY_AUTOPILOT\)/);
  assert.match(page, /generateWeeklyAutopilot/);
  assert.match(today, /to=["']\/today\/autopilot["']/);
});
