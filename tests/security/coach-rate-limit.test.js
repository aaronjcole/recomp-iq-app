import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COACH_DAILY_LIMIT,
  COACH_HOURLY_LIMIT,
  evaluateCoachQuota
} from "../../base44/shared/coachRateLimitDomain.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const NOW = Date.parse("2026-08-03T18:00:00.000Z");

function usage(requestId, minutesAgo) {
  return {
    request_id: requestId,
    requested_at: new Date(NOW - minutesAgo * 60_000).toISOString()
  };
}

test("coach quota admits the tenth hourly request and rejects the eleventh", () => {
  const firstTen = Array.from({ length: COACH_HOURLY_LIMIT }, (_, index) => (
    usage(`request-${String(index).padStart(2, "0")}`, 50 - index)
  ));

  assert.deepEqual(
    evaluateCoachQuota(firstTen, "request-09", NOW),
    { allowed: true, reason: null }
  );
  assert.deepEqual(
    evaluateCoachQuota([...firstTen, usage("request-10", 0)], "request-10", NOW),
    { allowed: false, reason: "hourly" }
  );
});

test("coach quota enforces a daily ceiling and fails closed for a missing reservation", () => {
  const dailyUsage = Array.from({ length: COACH_DAILY_LIMIT }, (_, index) => (
    usage(`daily-${String(index).padStart(2, "0")}`, 1_400 - index * 30)
  ));

  assert.deepEqual(
    evaluateCoachQuota([...dailyUsage, usage("daily-overflow", 0)], "daily-overflow", NOW),
    { allowed: false, reason: "daily" }
  );
  assert.deepEqual(
    evaluateCoachQuota(dailyUsage, "not-persisted", NOW),
    { allowed: false, reason: "reservation" }
  );
});

test("coach rate limiting is shared, precedes paid inference, and is deleted with the account", () => {
  const coach = readFileSync(
    resolve(repoRoot, "base44/functions/coachReply/entry.ts"),
    "utf8"
  );
  const deletion = readFileSync(
    resolve(repoRoot, "base44/functions/deleteAccount/entry.ts"),
    "utf8"
  );
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, "base44/entities/CoachRequestUsage.jsonc"), "utf8")
  );

  assert.match(coach, /asServiceRole\.entities\.CoachRequestUsage/);
  assert.match(coach, /status:\s*429/);
  assert.ok(
    coach.indexOf("const quota = await reserveCoachRequest")
      < coach.indexOf("integrations.Core.InvokeLLM")
  );
  assert.match(deletion, /CoachRequestUsage\.deleteMany\(\{ owner_id: user\.id \}\)/);
  assert.equal(schema.properties.owner_id.maxLength, 128);
  assert.equal(schema.properties.request_id.maxLength, 64);
  assert.deepEqual(schema.rls.read, { user_condition: { role: "admin" } });
});
