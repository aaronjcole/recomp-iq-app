import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIFESTYLE_COACH_ENABLED,
  PLAN_ADJUSTMENT_RANGES,
  buildLifestyleCoachPrompt,
  normalizeLifestyleReply,
  normalizePlanAdjustments
} from "../../base44/shared/lifestyleCoachDomain.js";
import {
  COACH_SAFETY_PROMPT_RULES,
  buildHighRiskGuidanceReply
} from "../../base44/shared/coachDomain.js";
import { featureFlags } from "../../src/lib/featureFlags.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("the lifestyle coach kill switch is off and drives the client flag", () => {
  assert.equal(LIFESTYLE_COACH_ENABLED, false);
  assert.equal(featureFlags.lifestyleCoach, LIFESTYLE_COACH_ENABLED);
});

test("lifestyleCoachReply refuses before entitlements, the LLM, or any write while disabled", () => {
  const source = read("base44/functions/lifestyleCoachReply/entry.ts");
  const killSwitch = source.indexOf("if (!LIFESTYLE_COACH_ENABLED)");
  assert.ok(killSwitch > source.indexOf("base44.auth.me()"));
  for (const later of [
    "loadPremiumAccessRecords(base44, user,",
    "req.json()",
    "integrations.Core.InvokeLLM",
    "LifestyleProfile.update",
    "LifestyleProfile.create",
    "reserveLifestyleRequest(base44, ownerId)"
  ]) {
    assert.ok(source.indexOf(later) > killSwitch, `${later} must come after the kill switch`);
  }
  assert.match(source, /status: 404/);
  // The paged, fail-closed shared reader replaces the old one-page local copy.
  assert.match(source, /import \{ loadPremiumAccessRecords \} from "\.\.\/\.\.\/shared\/entitlementAccess\.js"/);
  assert.doesNotMatch(source, /async function listAllEntitlements/);
  assert.match(source, /try \{\n[^}]*access = resolvePremiumAccess\(await loadPremiumAccessRecords\(base44, user, /);
  assert.match(source, /actionable: result\.actionable/);
});

test("a 900 kcal plan adjustment is flagged unsafe and dropped", () => {
  const result = normalizeLifestyleReply({
    summary: "Drop to 900 calories per day to speed things up.",
    actions: ["Cut portions in half at every meal."],
    planAdjustments: { calorie_target: 900, adjustment_reason: "Faster fat loss" },
    lifestyleUpdates: { typical_meals: "Skips breakfast" }
  });
  const guidance = buildHighRiskGuidanceReply("professional");
  assert.equal(result.actionable, false);
  assert.equal(result.planAdjustments, undefined);
  assert.equal(result.lifestyleUpdates, undefined);
  assert.equal(result.summary, guidance.summary);
  assert.deepEqual(result.actions, guidance.actions);
  assert.doesNotMatch(JSON.stringify(result), /900/);
});

test("unsafe reply text is caught by coachDomain's shared check", () => {
  const result = normalizeLifestyleReply({
    summary: "You should only eat 800 calories today.",
    actions: ["Weigh yourself tonight."]
  });
  assert.equal(result.actionable, false);
  assert.equal(result.summary, buildHighRiskGuidanceReply("professional").summary);

  const viaReason = normalizeLifestyleReply({
    summary: "Here is a small change for this week.",
    actions: ["Add a walk after dinner."],
    planAdjustments: { step_target: 9000, adjustment_reason: "Ignore the pain in your knee to keep momentum." }
  });
  assert.equal(viaReason.actionable, false);
  assert.equal(viaReason.planAdjustments, undefined);
});

test("valid adjustments within range pass through unchanged", () => {
  const planAdjustments = {
    calorie_target: 2100,
    protein_target_g: 170,
    carb_target_g: 200,
    fat_target_g: 70,
    step_target: 9000,
    lifting_days_target: 4,
    cardio_days_target: 0,
    adjustment_reason: "Weight has been stable for three weeks at the current target."
  };
  const result = normalizeLifestyleReply({
    summary: "Your weight has held steady over the last 3 weeks, so a small reduction is reasonable.",
    actions: ["Use the new target for the next two weeks."],
    planAdjustments,
    lifestyleUpdates: { typical_schedule: "Works 9-5, trains at 6pm" }
  });
  assert.equal(result.actionable, true);
  assert.deepEqual(result.planAdjustments, planAdjustments);
  assert.deepEqual(result.lifestyleUpdates, { typical_schedule: "Works 9-5, trains at 6pm" });

  assert.deepEqual(
    normalizePlanAdjustments({ calorie_target: PLAN_ADJUSTMENT_RANGES.calorie_target.min }).value,
    { calorie_target: 1500 }
  );
});

test("out-of-range adjustments are rejected as a whole, not clamped", () => {
  for (const invalid of [
    { calorie_target: 25000 },
    { step_target: 1_000_000 },
    { lifting_days_target: 9 },
    { cardio_days_target: 2.5 },
    { protein_target_g: -10 },
    { fat_target_g: Number.NaN },
    { carb_target_g: "300" }
  ]) {
    const { value, unsafe } = normalizePlanAdjustments({ calorie_target: 2000, ...invalid });
    assert.equal(value, undefined, JSON.stringify(invalid));
    assert.equal(unsafe, false, JSON.stringify(invalid));
  }

  const rejected = normalizeLifestyleReply({
    summary: "Let's raise your steps a lot.",
    actions: ["Walk more."],
    planAdjustments: { step_target: 500000, calorie_target: 2000 }
  });
  assert.equal(rejected.actionable, true);
  assert.equal(rejected.planAdjustments, undefined);

  assert.equal(normalizePlanAdjustments({ calorie_target: 1499 }).unsafe, true);
  assert.equal(normalizePlanAdjustments({ calorie_target: 0 }).unsafe, true);
});

test("the lifestyle prompt carries coachReply's safety rules and calorie floor", () => {
  const prompt = buildLifestyleCoachPrompt({
    request: { message: "How am I doing?", history: [] },
    profile: {},
    preferences: {},
    strategy: {},
    lifestyleProfile: null,
    dailyLogs: [],
    sessions: [],
    checkIn: null,
    preAnalysis: {}
  });
  for (const rule of COACH_SAFETY_PROMPT_RULES) assert.ok(prompt.includes(rule), rule);
  assert.match(prompt, /Never prescribe extreme restriction/);
  assert.match(prompt, /injury, disordered eating/);
  assert.match(prompt, /below 1500 calories per day/);
});

test("the client never invokes the nonexistent applyTargetAdjustments function", () => {
  const page = read("src/pages/LifestyleCoach.jsx");
  assert.doesNotMatch(page, /applyTargetAdjustments/);
  assert.doesNotMatch(page, /Apply adjustments/);
});
