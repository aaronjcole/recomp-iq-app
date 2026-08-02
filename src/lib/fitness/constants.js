// Shared constants and friendly labels for the RecompOne fitness engine.

export const SEXES = ["male", "female", "unspecified"];

export const GOALS = [
  "fat_loss_biased_recomp",
  "body_recomposition",
  "fat_loss",
  "aggressive_fat_loss",
  "muscle_gain",
  "lean_bulk",
  "aggressive_gain",
  "maintenance",
  "strength_retention_cut"
];

export const JOB_ACTIVITIES = [
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extremely_active"
];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

export const COACH_TONES = ["direct", "encouraging", "analytical", "tough_love", "concise"];

// Friendly labels shown in onboarding / plan. Maps the algorithm's granular
// goal enum to the product's plain-language goal modes.
export const GOAL_LABELS = {
  aggressive_fat_loss: { label: "Lose quickly", blurb: "Faster fat loss with tighter recovery checks." },
  fat_loss: { label: "Lose", blurb: "Lose fat at a sustainable pace." },
  fat_loss_biased_recomp: { label: "Lean out", blurb: "Bias fat loss while protecting strength." },
  body_recomposition: { label: "Recomp", blurb: "Lean out slowly, keep training central." },
  strength_retention_cut: { label: "Strength cut", blurb: "Cut with strength retention as the guardrail." },
  maintenance: { label: "Maintain", blurb: "Hold weight steady, preserve performance." },
  lean_bulk: { label: "Build muscle", blurb: "Gain slowly while limiting fat gain." },
  muscle_gain: { label: "Gain", blurb: "Gain weight to support muscle growth." },
  aggressive_gain: { label: "Gain quickly", blurb: "Gain faster, accepting more fat-gain risk." }
};

export const JOB_ACTIVITY_LABELS = {
  sedentary: "Sedentary (desk, little movement)",
  lightly_active: "Lightly active (some walking)",
  moderately_active: "Moderately active (on feet a lot)",
  very_active: "Very active (physical job or training)",
  extremely_active: "Extremely active (athletic workload)"
};

export const ADJUSTMENT_DECISIONS = [
  "keep_plan",
  "reduce_calories",
  "increase_calories",
  "increase_steps",
  "focus_on_adherence",
  "reduce_training_fatigue",
  "seek_professional_guidance",
  "keep_collecting_data",
  "keep_plan_possible_recomp",
  "keep_plan_possible_recomp_or_water",
  "keep_plan_and_monitor"
];