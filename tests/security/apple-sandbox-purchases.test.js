import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appleEnvironmentDecision, parseIdAllowlist } from "../../base44/shared/premiumDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("production purchases always grant Premium", () => {
  for (const allowlistRaw of [undefined, "", "user-tester"]) {
    assert.deepEqual(
      appleEnvironmentDecision({ environment: "Production", userId: "user-anyone", allowlistRaw }),
      { allowed: true, sandbox: false, unconfigured: false }
    );
  }
});

test("with the allowlist configured, only listed accounts get Premium from a sandbox purchase", () => {
  const allowlistRaw = " user-tester, user-review-demo ";
  assert.equal(appleEnvironmentDecision({ environment: "Sandbox", userId: "user-tester", allowlistRaw }).allowed, true);
  assert.equal(appleEnvironmentDecision({ environment: "Sandbox", userId: "user-review-demo", allowlistRaw }).allowed, true);
  assert.equal(appleEnvironmentDecision({ environment: "Sandbox", userId: "user-stranger", allowlistRaw }).allowed, false);
  assert.equal(appleEnvironmentDecision({ environment: "Sandbox", userId: null, allowlistRaw }).allowed, false);
  assert.equal(appleEnvironmentDecision({ environment: "Xcode", userId: "user-stranger", allowlistRaw }).allowed, false);
  assert.equal(appleEnvironmentDecision({ environment: null, userId: "user-stranger", allowlistRaw }).allowed, false,
    "a missing environment is treated as sandbox");
});

test("an unset allowlist keeps accepting sandbox purchases and says so", () => {
  const decision = appleEnvironmentDecision({ environment: "Sandbox", userId: "user-stranger", allowlistRaw: undefined });
  assert.deepEqual(decision, { allowed: true, sandbox: true, unconfigured: true });
  assert.equal(parseIdAllowlist(" , ").size, 0);
});

test("verifyApplePurchase applies the decision after the ownership check, before writing an entitlement", () => {
  const source = readFileSync(resolve(repoRoot, "base44/functions/verifyApplePurchase/entry.ts"), "utf8");
  const ownership = source.indexOf("Purchase is already linked to another account");
  const decision = source.indexOf("appleEnvironmentDecision({");
  const write = source.indexOf("PremiumEntitlement.filter(");
  assert.ok(ownership > 0 && decision > ownership && write > decision);
  assert.match(source, /allowlistRaw: secrets\.get\("APPLE_SANDBOX_ALLOWED_USER_IDS"\)/);
  assert.match(source, /status: 403/);
});
