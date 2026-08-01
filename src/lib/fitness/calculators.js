// Ported 1:1 from RecompIQ src/lib/fitness/calculators.ts (Mifflin-St Jeor BMR,
// activity-multiplied TDEE, goal-based calorie targets, macro split, step
// targets, 1RM estimate, sustainability score). Pure functions, no React.

export const activityMultipliers = {
  sedentary: 1.2,
  lightly_active: 1.35,
  moderately_active: 1.5,
  very_active: 1.7,
  extremely_active: 1.9
};

export const calorieGoalFactors = {
  maintenance: 1,
  body_recomposition: 0.925,
  fat_loss_biased_recomp: 0.85,
  fat_loss: 0.8,
  aggressive_fat_loss: 0.75,
  muscle_gain: 1.075,
  lean_bulk: 1.05,
  aggressive_gain: 1.12,
  strength_retention_cut: 0.875
};

export function convertLbsToKg(lbs) {
  return lbs * 0.45359237;
}

export function convertInchesToCm(inches) {
  return inches * 2.54;
}

export function calculateBMR(input) {
  const kg = convertLbsToKg(input.weight_lbs);
  const cm = convertInchesToCm(input.height_in);
  const base = 10 * kg + 6.25 * cm - 5 * input.age;
  if (input.sex === "male") return Math.round(base + 5);
  if (input.sex === "female") return Math.round(base - 161);
  // "unspecified": average the male (+5) and female (-161) Mifflin-St Jeor constants
  return Math.round(base + (5 - 161) / 2);
}

export function calculateTDEE(bmr, activity) {
  return Math.round(bmr * activityMultipliers[activity]);
}

export function calculateCalorieTarget(tdee, goal, options = {}) {
  const rawFactor = calorieGoalFactors[goal];
  const factor = options.safetyConstrained
    ? Math.max(0.925, Math.min(1.05, rawFactor))
    : rawFactor;
  const target = Math.round((tdee * factor) / 10) * 10;
  if (goal === "maintenance") return target;
  if (goal === "muscle_gain" || goal === "lean_bulk" || goal === "aggressive_gain") return target;
  return Math.max(target, 1500);
}

export function calculateMacroTargets(input) {
  const notes = [];
  const referenceWeight =
    input.goal_weight_lbs && input.goal_weight_lbs < input.current_weight_lbs
      ? input.goal_weight_lbs
      : input.current_weight_lbs;
  let protein = Math.round(referenceWeight * 0.85);
  if (input.proteinPreferenceG) protein = Math.min(input.proteinPreferenceG, 250);
  if (protein > 250) {
    protein = 250;
    notes.push("Protein default is capped at 250g to avoid an unnecessarily extreme target.");
  }
  const fatByCalories = Math.round((input.calories * 0.23) / 9);
  const fatByWeight = Math.round(referenceWeight * 0.3);
  const fat = Math.max(fatByCalories, fatByWeight, 50);
  const carbCalories = Math.max(0, input.calories - protein * 4 - fat * 9);
  return {
    protein_target_g: protein,
    fat_target_g: fat,
    carb_target_g: Math.round(carbCalories / 4),
    notes
  };
}

export function calculateStepTarget(input) {
  const baseline = input.average_steps || 4000;
  if (input.job_activity === "sedentary" || input.stepsAreHard) {
    return Math.min(
      200000,
      Math.min(
        Math.max(Math.round((baseline + 1800) / 100) * 100, 5500),
        baseline > 7000 ? baseline + 1000 : 7000
      )
    );
  }
  return Math.min(200000, Math.round((baseline + 2000) / 100) * 100, 10000);
}

export function calculateInitialStrategy(profile, preferences = {}) {
  const bmr = calculateBMR({
    sex: profile.sex,
    weight_lbs: profile.current_weight_lbs,
    height_in: profile.height_in,
    age: profile.age
  });
  const tdee = calculateTDEE(bmr, profile.job_activity);
  const safetyConstrained = (preferences?.safety_flags ?? []).length > 0;
  const calories = calculateCalorieTarget(tdee, profile.goal, { safetyConstrained });
  const macros = calculateMacroTargets({
    calories,
    current_weight_lbs: profile.current_weight_lbs,
    goal_weight_lbs: profile.goal_weight_lbs
  });
  const stepTarget = calculateStepTarget({
    job_activity: profile.job_activity,
    average_steps: profile.average_steps,
    stepsAreHard: true
  });
  return {
    bmr_estimate: bmr,
    tdee_estimate: tdee,
    calorie_target: calories,
    protein_target_g: macros.protein_target_g,
    fat_target_g: macros.fat_target_g,
    carb_target_g: macros.carb_target_g,
    step_target: stepTarget,
    confidence: "medium",
    notes: [
      "Your first target is an estimate. RecompIQ updates based on 7-day trends, waist, steps, training, recovery, and adherence.",
      ...(safetyConstrained
        ? ["Safety flags keep the starting calorie target within a conservative range; consult a qualified professional before pursuing an aggressive change."]
        : []),
      ...macros.notes
    ]
  };
}

export function estimateOneRepMax(weight, reps) {
  if (reps <= 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

export function calculateSustainabilityScore(input) {
  let score = 85;
  const deficit = Math.max(0, input.tdee - input.calorieTarget) / input.tdee;
  if ((input.hungerAverage ?? 0) >= 4) score -= 15;
  if ((input.proteinAdherence ?? 1) < 0.8) score -= 10;
  if (input.stepTarget - input.baselineSteps > 2500) score -= 10;
  if ((input.sleepAverage ?? 8) < 6.5) score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}
