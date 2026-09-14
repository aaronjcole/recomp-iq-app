import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const FUEL_SEGMENTS = ["diary", "library", "tools"];

/**
 * Indices of the balanced `open`/`close` pair that starts at the first `open`
 * at or after `from`. Lets these oracles read source *structure* (which branch
 * a node lives in) instead of grepping the whole file, which is what let the
 * buried-meal-planner regression slip through.
 */
function balancedRange(source, from, open, close) {
  const start = source.indexOf(open, from);
  assert.ok(start >= 0, `expected to find "${open}" after index ${from}`);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return { start, end: index };
    }
  }
  throw new Error(`unbalanced "${open}" starting at index ${start}`);
}

function balancedSource(source, from, open, close) {
  const { start, end } = balancedRange(source, from, open, close);
  return source.slice(start + 1, end);
}

/** The `{segment === "<value>" && ( … )}` JSX expression container. */
function segmentBlock(source, value) {
  const marker = source.indexOf(`segment === "${value}"`);
  assert.ok(marker >= 0, `Nutrition should render a "${value}" segment block`);
  const braceStart = source.lastIndexOf("{", marker);
  assert.ok(braceStart >= 0, `the "${value}" segment block should be a JSX expression`);
  const { start, end } = balancedRange(source, braceStart, "{", "}");
  return { value, start, end };
}

test("adaptive meal planning verifies server entitlement before reading nutrition data", () => {
  const server = read("base44/functions/generateAdaptiveMealPlan/entry.ts");

  assert.match(server, /req\.method !== "POST"/);
  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /PREMIUM_FEATURES\.MEAL_PLANNING/);
  assert.match(server, /created_by_id:\s*userId/);
  assert.match(server, /preferences\?\.safety_flags/);
  assert.doesNotMatch(server, /\bemail\b/i);

  const authorization = server.indexOf("const entitlements = await listAllEntitlements");
  const nutritionRead = server.indexOf('ownedRecords(base44, "CurrentStrategy"');
  assert.ok(authorization >= 0 && authorization < nutritionRead);
});

test("the AI variety path keeps the meal-plan LLM call behind every deterministic guardrail", () => {
  // This replaces a blanket `doesNotMatch(/InvokeLLM/)`. Meal planning is no
  // longer LLM-free — an explicit AI variety mode was added — so the invariant
  // is now about *where* that call sits: behind entitlement, behind the safety
  // pause, behind an explicit opt-in mode, and with a deterministic fallback.
  const server = read("base44/functions/generateAdaptiveMealPlan/entry.ts");

  const llmCalls = [...server.matchAll(/InvokeLLM/g)].map((match) => match.index);
  assert.equal(
    llmCalls.length,
    1,
    "meal planning should make exactly one LLM call; a second call would need its own guardrail review"
  );
  const llmCall = llmCalls[0];

  const entitlementGate = server.indexOf("access.features[PREMIUM_FEATURES.MEAL_PLANNING] !== true");
  assert.ok(entitlementGate >= 0, "the server should resolve Premium entitlement itself");
  assert.ok(
    entitlementGate < llmCall,
    "the Premium entitlement check must run before the LLM call, so credits are never spent for an unentitled caller"
  );

  const safetyGate = server.indexOf("preferences.safety_flags.length > 0");
  assert.ok(safetyGate >= 0, "the safety-flag pause should still exist");
  assert.match(
    server.slice(safetyGate, llmCall),
    /status: 409/,
    "the safety-flag pause must return 409 before the LLM call, so a paused user's plan is never generated"
  );
  assert.ok(safetyGate < llmCall, "the safety-flag pause must precede the LLM call");

  // The LLM path is only reachable for an explicit opt-in mode; every other
  // request returns the deterministic plan and never reaches the model.
  const deterministicBuild = server.indexOf("buildAdaptiveMealPlan({");
  assert.ok(
    deterministicBuild >= 0 && deterministicBuild < llmCall,
    "the deterministic plan must be built before the LLM call so a fallback is always available"
  );
  assert.match(
    server,
    /if \(request\.mode !== "ai_variety"\) \{\s*return json\(deterministicPlan\);\s*\}/,
    "any request that is not mode=ai_variety must return the deterministic plan without calling the LLM"
  );
  const modeGate = server.indexOf('request.mode !== "ai_variety"');
  assert.ok(modeGate >= 0 && modeGate < llmCall, "the mode gate must precede the LLM call");

  // Failure of the model (or of its output shape) degrades to the
  // deterministic plan rather than surfacing an error or partial plan.
  const fallbacks = [...server.matchAll(/return json\(\{\s*\.\.\.deterministicPlan,\s*aiVarietyError/g)];
  assert.ok(
    fallbacks.length >= 2,
    "both the LLM call and the merge step should fall back to the deterministic plan on failure"
  );
  assert.ok(
    fallbacks.every((match) => match.index > llmCall),
    "the deterministic fallbacks belong to the LLM failure handling"
  );
  assert.match(server, /mergeAiMealsIntoPlan\(\{/, "LLM output must go through the validating merge, never straight to the client");
  assert.match(server, /response_json_schema: AI_VARIETY_SCHEMA/, "the LLM call must constrain output with the shared schema");
});

test("the AI variety prompt carries only macro targets, diet style, a decision enum and meal titles", () => {
  const server = read("base44/functions/generateAdaptiveMealPlan/entry.ts");
  const domain = read("base44/shared/adaptiveMealPlanDomain.js");

  // The prompt is the only place user-derived data leaves the backend, so its
  // inputs are pinned rather than trusted.
  const promptArgs = balancedSource(server, server.indexOf("prompt: buildAiVarietyPrompt("), "{", "}");
  assert.deepEqual(
    promptArgs
      .split(",")
      .map((entry) => entry.split(":")[0].trim())
      .filter(Boolean)
      .sort(),
    ["avoidIds", "checkIn", "dailyTargets", "dietStyle"],
    "the prompt call site must pass only the audited inputs — no strategy, preferences, profile or user record"
  );

  const builderStart = domain.indexOf("export function buildAiVarietyPrompt(");
  assert.ok(builderStart >= 0, "buildAiVarietyPrompt should exist in the shared domain");
  const paramsRange = balancedRange(domain, builderStart, "{", "}");
  assert.deepEqual(
    domain
      .slice(paramsRange.start + 1, paramsRange.end)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .sort(),
    ["avoidIds", "checkIn", "dailyTargets", "dietStyle"],
    "buildAiVarietyPrompt must not accept additional user data"
  );
  const builderBody = balancedSource(domain, paramsRange.end + 1, "{", "}");

  // The check-in is the only nested record reaching the prompt; only its
  // recommendation enum may be read from it.
  const checkInReads = [...builderBody.matchAll(/checkIn\??\.(\w+)/g)].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(checkInReads)].sort(),
    ["recommendation_decision"],
    "the prompt may only read the check-in recommendation enum, never weights, notes or other check-in fields"
  );

  for (const forbidden of [
    /email/i,
    /\buser\b/i,
    /profile/i,
    /first_?name/i,
    /full_?name/i,
    /created_by/i,
    /\bweight/i,
    /\bage\b/i,
    /height/i
  ]) {
    assert.doesNotMatch(
      builderBody,
      forbidden,
      `the AI variety prompt must not interpolate ${forbidden} data`
    );
  }

  // Everything the model returns is clamped and bounded before it is trusted.
  const merge = domain.slice(domain.indexOf("export function mergeAiMealsIntoPlan("));
  assert.match(merge, /did not return 7 days/, "the merge step must reject a short or long week");
  assert.match(merge, /String\(raw\.title \|\| "AI meal"\)\.slice\(0, 80\)/, "meal titles must be coerced and length-capped");
  assert.match(merge, /Math\.round\(Number\(raw\.calories\) \|\| 0\)/, "returned macros must be coerced to numbers");
  assert.match(merge, /raw\.ingredients\.slice\(0, 8\)/, "ingredient lists must be bounded");
});

test("meal planning is exposed inside Fuel and remains gated in both UI and backend", () => {
  const app = read("src/App.jsx");
  const page = read("src/pages/AdaptiveMealPlan.jsx");
  const nutrition = read("src/pages/Nutrition.jsx");

  assert.match(app, /path=["']\/nutrition\/meal-plan["']/);
  assert.match(page, /canAccess\(PREMIUM_FEATURES\.MEAL_PLANNING\)/);
  assert.match(page, /generateAdaptiveMealPlan/);
  assert.match(nutrition, /to=["']\/nutrition\/meal-plan["']/);
});

test("the Fuel meal-planner entry point renders on the default segment", () => {
  // The assertion above only proves the route string exists *somewhere* in the
  // page. It stayed green the whole time the link lived exclusively in the
  // Tools segment, i.e. two taps away and invisible on the surface the tab
  // actually opens on. This test pins the branch the link renders in.
  const nutrition = read("src/pages/Nutrition.jsx");

  const segmentState = balancedSource(
    nutrition,
    nutrition.indexOf("const [segment, setSegment] = useState("),
    "(",
    ")"
  );
  assert.match(
    segmentState,
    /:\s*"diary"/,
    'the Fuel tab must still default to the "diary" segment'
  );

  const blocks = FUEL_SEGMENTS.map((value) => segmentBlock(nutrition, value));
  // Cross-check the parsed extents: overlapping ranges mean the brace matching
  // went wrong, and a silently widened block would weaken every check below.
  for (const block of blocks) {
    for (const other of blocks) {
      if (other.value === block.value) continue;
      assert.ok(
        other.start >= block.end || other.end <= block.start,
        `the ${block.value} and ${other.value} segment blocks should not overlap — the segment parse is wrong`
      );
    }
  }

  const ownerOf = (position) =>
    blocks.find((block) => position > block.start && position < block.end) ?? null;

  const links = [...nutrition.matchAll(/to=["']\/nutrition\/meal-plan["']/g)].map((match) => match.index);
  assert.ok(links.length > 0, "Nutrition should link to /nutrition/meal-plan");

  const onDefaultSegment = links.filter((position) => {
    const owner = ownerOf(position);
    // `null` means the link is outside every segment block, i.e. always rendered.
    return owner === null || owner.value === "diary";
  });
  assert.ok(
    onDefaultSegment.length > 0,
    'the "Open meal planner" link must render on the default Diary segment (or outside every segment block); a link only inside Library/Tools is a discoverability regression'
  );

  // The e2e oracle resolves the link by accessible name, so the name has to
  // travel with the href, not just exist elsewhere in the file.
  assert.ok(
    onDefaultSegment.some((position) => /Open meal planner/i.test(nutrition.slice(position, position + 400))),
    'the default-segment meal-plan link must be named "Open meal planner"'
  );
});

test("the Fuel segmented control implements a complete ARIA tabs pattern", () => {
  const control = read("src/components/nutrition/FuelSegmentedControl.jsx");
  const nutrition = read("src/pages/Nutrition.jsx");

  assert.match(control, /role="tablist"/);
  assert.match(control, /aria-label="Fuel sections"/);
  assert.match(control, /role="tab"/);
  assert.match(control, /aria-selected=\{active\}/);
  assert.match(control, /aria-controls=\{fuelPanelId\(seg\.value\)\}/);
  assert.match(control, /id=\{fuelTabId\(seg\.value\)\}/);
  assert.match(control, /tabIndex=\{active \? 0 : -1\}/);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.match(control, new RegExp(`"${key}"`), `the tablist should handle ${key}`);
  }

  // Every rendered segment panel must be a labelled tabpanel.
  for (const value of FUEL_SEGMENTS) {
    const block = segmentBlock(nutrition, value);
    const body = nutrition.slice(block.start, block.end);
    assert.match(body, /role="tabpanel"/, `the ${value} panel should expose role="tabpanel"`);
    assert.match(
      body,
      new RegExp(`id=\\{fuelPanelId\\("${value}"\\)\\}`),
      `the ${value} panel should carry its stable panel id`
    );
    assert.match(
      body,
      new RegExp(`aria-labelledby=\\{fuelTabId\\("${value}"\\)\\}`),
      `the ${value} panel should be labelled by its tab`
    );
  }
});
