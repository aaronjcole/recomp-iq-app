import assert from "node:assert/strict";
import test from "node:test";
import {
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
});
