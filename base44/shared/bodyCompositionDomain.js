const POSES = Object.freeze(["front", "side", "back"]);
const MAX_FILE_REFERENCE_LENGTH = 2_000;
const MIN_BODY_FAT_PCT = 2;
const MAX_BODY_FAT_PCT = 60;
const MIN_RANGE_WIDTH_PCT = 2;
const MAX_SUMMARY_LENGTH = 800;
const MAX_TIP_LENGTH = 240;
const MIN_TIPS = 2;
const MAX_TIPS = 5;

export const BODY_COMPOSITION_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    body_fat_range_low_pct: {
      type: "number",
      minimum: MIN_BODY_FAT_PCT,
      maximum: MAX_BODY_FAT_PCT,
      description: "Conservative lower bound of an educational photo-based body-fat range (2-60)"
    },
    body_fat_range_high_pct: {
      type: "number",
      minimum: MIN_BODY_FAT_PCT,
      maximum: MAX_BODY_FAT_PCT,
      description: "Conservative upper bound of an educational photo-based body-fat range (2-60)"
    },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    summary: {
      type: "string",
      description: "Short, neutral explanation of visible patterns and estimate limitations"
    },
    tips: {
      type: "array",
      items: { type: "string" },
      minItems: MIN_TIPS,
      maxItems: MAX_TIPS,
      description: "Two to five practical, non-medical suggestions"
    }
  },
  required: [
    "body_fat_range_low_pct",
    "body_fat_range_high_pct",
    "confidence",
    "summary",
    "tips"
  ]
});

export class BodyCompositionRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BodyCompositionRequestError";
  }
}

function boundedString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function finiteNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

/** Validate the bounded private references accepted by the analysis function. */
export function normalizeBodyCompositionRequest(value) {
  const refs = value?.photoRefs;
  if (!refs || typeof refs !== "object" || Array.isArray(refs)) {
    throw new BodyCompositionRequestError("Front, side, and back private photos are required.");
  }

  const photoRefs = Object.fromEntries(POSES.map((pose) => {
    const rawRef = refs[pose];
    if (typeof rawRef !== "string") {
      throw new BodyCompositionRequestError(`The ${pose} private photo reference is invalid.`);
    }
    const normalizedRef = rawRef.trim().replace(/\s+/g, " ");
    const ref = boundedString(rawRef, MAX_FILE_REFERENCE_LENGTH);
    if (!ref || ref.length !== normalizedRef.length) {
      throw new BodyCompositionRequestError(`The ${pose} private photo reference is invalid.`);
    }
    if (/^(?:data|blob):/i.test(ref)) {
      throw new BodyCompositionRequestError(`The ${pose} private photo reference is invalid.`);
    }
    return [pose, ref];
  }));

  if (new Set(Object.values(photoRefs)).size !== POSES.length) {
    throw new BodyCompositionRequestError("Use three distinct photos for the estimate.");
  }

  return { photoRefs };
}

/** Build a non-diagnostic prompt from the server-owned fitness context. */
export function buildBodyCompositionPrompt({ profile, strategy }) {
  const currentWeight = finiteNumber(profile?.current_weight_lbs);
  const calorieTarget = finiteNumber(strategy?.calorie_target);
  const proteinTarget = finiteNumber(strategy?.protein_target_g);
  const goal = boundedString(profile?.goal, 40) || "unspecified";
  const experience = boundedString(profile?.experience_level, 40) || "unspecified";

  return `You are analyzing three optional physique photos for a general fitness progress tool.

The photos are FRONT, SIDE, and BACK views of the same consenting adult, in that order.

AVAILABLE FITNESS CONTEXT:
- Current weight: ${currentWeight ?? "not provided"} lb
- Goal: ${goal}
- Training experience: ${experience}
- Current nutrition targets: ${calorieTarget ?? "not provided"} kcal and ${proteinTarget ?? "not provided"} g protein

Return a conservative body-fat RANGE, never a single exact percentage. Photo-based estimates are approximate and are not a medical measurement. Use a range at least ${MIN_RANGE_WIDTH_PCT} percentage points wide; widen it when lighting, pose, clothing, or image quality limits confidence. Do not diagnose a condition, infer identity or sensitive traits, sexualize the subject, or use shaming language. Describe only fitness-relevant visible patterns. Give two to five sustainable training, recovery, or nutrition suggestions aligned with the supplied goal. Do not prescribe extreme restriction.

Return only JSON matching the supplied schema.`;
}

/** Normalize model output and derive lean-mass ranges from a trusted weight. */
export function normalizeBodyCompositionResult(value, currentWeightLbs) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BodyCompositionRequestError("The analysis provider returned an invalid result.");
  }

  const low = finiteNumber(value.body_fat_range_low_pct);
  const high = finiteNumber(value.body_fat_range_high_pct);
  if (
    low === null ||
    high === null ||
    low < MIN_BODY_FAT_PCT ||
    high > MAX_BODY_FAT_PCT ||
    high - low < MIN_RANGE_WIDTH_PCT
  ) {
    throw new BodyCompositionRequestError("The analysis provider did not return a usable estimate range.");
  }

  const confidence = ["low", "moderate", "high"].includes(value.confidence)
    ? value.confidence
    : "low";
  const summary = boundedString(value.summary, MAX_SUMMARY_LENGTH);
  const tips = Array.isArray(value.tips)
    ? value.tips
      .map((tip) => boundedString(tip, MAX_TIP_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_TIPS)
    : [];
  if (!summary || tips.length < MIN_TIPS) {
    throw new BodyCompositionRequestError("The analysis provider returned an incomplete result.");
  }

  const weight = finiteNumber(currentWeightLbs);
  const leanMassRangeLowLbs = weight && weight > 0
    ? roundOne(weight * (1 - high / 100))
    : null;
  const leanMassRangeHighLbs = weight && weight > 0
    ? roundOne(weight * (1 - low / 100))
    : null;

  return {
    bodyFatRangeLowPct: roundOne(low),
    bodyFatRangeHighPct: roundOne(high),
    leanMassRangeLowLbs,
    leanMassRangeHighLbs,
    confidence,
    summary,
    tips
  };
}
