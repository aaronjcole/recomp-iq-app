import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_COMPOSITION_RESPONSE_SCHEMA,
  BodyCompositionRequestError,
  buildBodyCompositionPrompt,
  normalizeBodyCompositionRequest,
  normalizeBodyCompositionResult
} from "../../base44/shared/bodyCompositionDomain.js";

const photoRefs = {
  front: "private/account/front.jpg",
  side: "private/account/side.jpg",
  back: "private/account/back.jpg"
};

test("body composition requests require three distinct bounded private file references", () => {
  assert.deepEqual(normalizeBodyCompositionRequest({ photoRefs }), { photoRefs });
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: { ...photoRefs, back: "" } }),
    BodyCompositionRequestError
  );
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: { ...photoRefs, back: photoRefs.front } }),
    /distinct/i
  );
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: { ...photoRefs, side: "x".repeat(2_001) } }),
    /invalid/i
  );
  assert.throws(() => normalizeBodyCompositionRequest({}), BodyCompositionRequestError);
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: "private/account/photos" }),
    BodyCompositionRequestError
  );
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: { ...photoRefs, front: "data:image/png;base64,abc" } }),
    /invalid/i
  );
  assert.throws(
    () => normalizeBodyCompositionRequest({ photoRefs: { ...photoRefs, side: "blob:https://example.test/id" } }),
    /invalid/i
  );
});

test("the provider schema carries the same range and tip limits as normalization", () => {
  const properties = BODY_COMPOSITION_RESPONSE_SCHEMA.properties;
  assert.equal(properties.body_fat_range_low_pct.minimum, 2);
  assert.equal(properties.body_fat_range_low_pct.maximum, 60);
  assert.equal(properties.body_fat_range_high_pct.minimum, 2);
  assert.equal(properties.body_fat_range_high_pct.maximum, 60);
  assert.equal(properties.tips.minItems, 2);
  assert.equal(properties.tips.maxItems, 5);
});

test("body composition output is a bounded range with server-derived lean mass", () => {
  const result = normalizeBodyCompositionResult({
    body_fat_range_low_pct: 17.2,
    body_fat_range_high_pct: 21.8,
    confidence: "moderate",
    summary: "Visible changes are consistent across the three views.",
    tips: ["Keep the current protein target.", "Use the weekly trend before changing calories."]
  }, 180);

  assert.deepEqual(result, {
    bodyFatRangeLowPct: 17.2,
    bodyFatRangeHighPct: 21.8,
    leanMassRangeLowLbs: 140.8,
    leanMassRangeHighLbs: 149,
    confidence: "moderate",
    summary: "Visible changes are consistent across the three views.",
    tips: ["Keep the current protein target.", "Use the weekly trend before changing calories."]
  });
  assert.throws(
    () => normalizeBodyCompositionResult({
      body_fat_range_low_pct: 18,
      body_fat_range_high_pct: 18,
      confidence: "high",
      summary: "Too precise.",
      tips: ["No range."]
    }, 180),
    /range/i
  );
  assert.throws(
    () => normalizeBodyCompositionResult({
      body_fat_range_low_pct: 18,
      body_fat_range_high_pct: 22,
      confidence: "moderate",
      summary: "The range is usable but the guidance is incomplete.",
      tips: ["Only one suggestion."]
    }, 180),
    /incomplete/i
  );

  for (const weight of [null, 0]) {
    const withoutWeight = normalizeBodyCompositionResult({
      body_fat_range_low_pct: 17.2,
      body_fat_range_high_pct: 21.8,
      confidence: "moderate",
      summary: "Visible changes are consistent across the three views.",
      tips: ["Keep the current protein target.", "Use the weekly trend before changing calories."]
    }, weight);
    assert.equal(withoutWeight.leanMassRangeLowLbs, null);
    assert.equal(withoutWeight.leanMassRangeHighLbs, null);
  }
});

test("the body composition prompt frames the result as educational and non-diagnostic", () => {
  const prompt = buildBodyCompositionPrompt({
    profile: { current_weight_lbs: 180, goal: "lose_fat", experience_level: "intermediate" },
    strategy: { calorie_target: 2_200, protein_target_g: 170 }
  });

  assert.match(prompt, /range/i);
  assert.match(prompt, /not a medical/i);
  assert.match(prompt, /do not diagnose/i);
  assert.doesNotMatch(prompt, /as accurately as/i);

  const unsetPrompt = buildBodyCompositionPrompt({
    profile: { current_weight_lbs: null },
    strategy: { calorie_target: "", protein_target_g: null }
  });
  assert.match(unsetPrompt, /Current weight: not provided/);
  assert.match(unsetPrompt, /not provided kcal and not provided g protein/);
});
