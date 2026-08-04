// A coherent, credential-free authenticated dataset for render smoke tests.
// Dates are generated relative to "now" so the fitness engine treats them as
// recent (analyzeTrends looks back ~14-28 days). Keep this dataset "healthy"
// enough that Today's signal, best move, habits, and progress all render.

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const AUTH_USER = {
  id: "user-test",
  email: "tester@example.com",
  full_name: "Test Pro",
  role: "user",
};

const dailyLogs = Array.from({ length: 28 }, (_, i) => {
  const day = 27 - i; // oldest first is irrelevant; the app sorts by date
  return {
    id: `log-${day}`,
    date: isoDaysAgo(day),
    weight_lbs: 181 - day * 0.05,
    waist_in: 34 - day * 0.01,
    calories: 2100 + ((day % 3) - 1) * 120,
    protein_g: 165 + (day % 2) * 8,
    carbs_g: 200,
    fat_g: 68,
    steps: 8500 + (day % 4) * 500,
    workout_completed: day % 2 === 0,
    sleep_hours: 7 + (day % 2) * 0.5,
    energy_rating: 4,
    soreness_rating: 2,
    hunger_rating: 3,
  };
});

const habits = [
  { id: "habit-water", name: "Water", kind: "count", target_value: 100, unit: "oz", sort_order: 0 },
  { id: "habit-read", name: "Read", kind: "check", sort_order: 1 },
  { id: "habit-meditate", name: "Meditate", kind: "check", sort_order: 2 },
];

const habitEntries = [
  { id: "he-water-0", habit_id: "habit-water", date: isoDaysAgo(0), value: 80 },
  { id: "he-read-0", habit_id: "habit-read", date: isoDaysAgo(0), done: true },
  { id: "he-read-1", habit_id: "habit-read", date: isoDaysAgo(1), done: true },
  { id: "he-meditate-1", habit_id: "habit-meditate", date: isoDaysAgo(1), done: true },
];

const sessions = Array.from({ length: 6 }, (_, i) => ({
  id: `sess-${i}`,
  date: isoDaysAgo(i * 3),
  type: "strength",
  name: "Full body",
  duration_min: 55,
}));

const strengthLogs = Array.from({ length: 8 }, (_, i) => ({
  id: `str-${i}`,
  date: isoDaysAgo(i * 3),
  exercise: "Back Squat",
  weight_lbs: 225 + i * 5,
  reps: 5,
  sets: 3,
}));

// One entry per entity name that RecompContext.loadAll() fetches.
export const ENTITY_FIXTURES = {
  UserProfile: [{
    id: "profile-1",
    goal: "recomp",
    sex: "male",
    age: 31,
    height_in: 70,
    current_weight_lbs: 181,
    activity_level: "moderate",
  }],
  UserPreferences: [{
    id: "prefs-1",
    adaptive_mode: true,
    safety_flags: [],
    units: "imperial",
  }],
  CurrentStrategy: [{
    id: "strategy-1",
    goal_type: "recomp",
    calorie_target: 2200,
    protein_target_g: 170,
    carb_target_g: 210,
    fat_target_g: 70,
    step_target: 9000,
    lifting_days_target: 4,
  }],
  DailyLog: dailyLogs,
  ExerciseSession: sessions,
  StrengthLog: strengthLogs,
  WeeklyCheckIn: [],
  FoodItem: [
    { id: "food-1", name: "Greek Yogurt", calories: 150, protein_g: 20, carbs_g: 8, fat_g: 4, source: "manual" },
    { id: "food-2", name: "Chicken Breast", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4, source: "manual" },
  ],
  Recipe: [],
  DecisionLedger: [
    { id: "dl-1", date: isoDaysAgo(7), reason: "Weekly review", previous_targets: {}, new_targets: {} },
  ],
  MealTemplate: [],
  Habit: habits,
  HabitEntry: habitEntries,
};

export const PUBLIC_SETTINGS = { id: "playwright-local", public_settings: {} };

export const PREMIUM_TESTER_ACCESS = {
  hasAnyAccess: true,
  hasBundleAccess: true,
  testerAccess: true,
  features: {
    meal_planning: true,
    training_planning: true,
    weekly_autopilot: true,
    visual_progress: true,
  },
  products: ["recompone_premium"],
  sources: ["tester"],
};

export const BODY_COMPOSITION_RESULT = {
  bodyFatRangeLowPct: 18,
  bodyFatRangeHighPct: 22,
  leanMassRangeLowLbs: 141.2,
  leanMassRangeHighLbs: 148.4,
  confidence: "moderate",
  summary: "The three views support a broad visual estimate while lighting and pose still limit precision.",
  tips: [
    "Keep protein near the current target.",
    "Use the weekly weight trend before changing calories."
  ]
};

export const ADAPTIVE_MEAL_PLAN = {
  weekStart: isoDaysAgo(0),
  dietStyle: "omnivore",
  dailyTargets: { calories: 2200, proteinG: 170, carbsG: 210, fatG: 70 },
  adaptation: {
    mode: "balanced_variety",
    summary: "Portions use the targets from your latest weekly review while keeping a balanced meal rotation.",
  },
  days: Array.from({ length: 7 }, (_, index) => ({
    date: isoDaysAgo(-index),
    totals: { calories: 2200, proteinG: 168, carbsG: 214, fatG: 69 },
    meals: [
      { id: "oats", slot: "breakfast", title: "Overnight protein oats", servingScale: 1.05, calories: 500, proteinG: 40, carbsG: 60, fatG: 12, ingredients: [] },
      { id: "chicken-bowl", slot: "lunch", title: "Chicken rice power bowl", servingScale: 1.05, calories: 620, proteinG: 53, carbsG: 65, fatG: 16, ingredients: [] },
      { id: "salmon-plate", slot: "dinner", title: "Salmon, potatoes, and greens", servingScale: 1.05, calories: 690, proteinG: 49, carbsG: 57, fatG: 28, ingredients: [] },
      { id: "yogurt", slot: "snack", title: "Yogurt berry crunch", servingScale: 1.05, calories: 390, proteinG: 26, carbsG: 32, fatG: 13, ingredients: [] },
    ],
  })),
  groceryList: [
    { name: "berries", quantity: 7, unit: "cup" },
    { name: "chicken breast", quantity: 42, unit: "oz" },
  ],
  allergyNotice: "Review every ingredient for allergies, intolerances, medication interactions, and dietary restrictions before using this plan.",
  nutritionNotice: "Calories and macros are estimates for planning—not medical advice. Confirm portions and labels when logging.",
};

export const ADAPTIVE_TRAINING_BLOCK = {
  weekStart: isoDaysAgo(0),
  blockLengthWeeks: 5,
  equipment: "full_gym",
  split: "upper_lower",
  adaptation: {
    mode: "progressive_build",
    consistency: 0.8,
    averageRpe: 7,
    summary: "Recent training supports a progressive block with planned rep, load, and volume steps.",
  },
  trackedLifts: ["Back Squat", "Barbell Bench Press"],
  preferredTraining: "strength",
  progressionRule: "Stay inside the listed rep range. Add reps first; only add the smallest practical load after every set reaches the top of the range with clean form and the target RPE.",
  safetyNotice: "Stop for sharp pain, dizziness, or unusual symptoms. Exercise selection and progression are educational and are not medical care.",
  schedule: ["Upper A", "Lower A", "Upper B", "Lower B"].map((title, index) => ({
    day: index + 1,
    title,
    focus: index % 2 === 0 ? "Upper body" : "Lower body",
    estimatedMinutes: 55,
    exercises: [
      { name: index % 2 === 0 ? "Barbell Bench Press" : "Back Squat", movement: index % 2 === 0 ? "horizontal_push" : "squat", sets: 3, reps: "6–10", targetRpe: 7, alternatives: ["Machine press"] },
      { name: index % 2 === 0 ? "Chest-supported row" : "Romanian deadlift", movement: index % 2 === 0 ? "horizontal_pull" : "hinge", sets: 3, reps: "6–10", targetRpe: 7, alternatives: ["Cable row"] },
      { name: "Accessory movement", movement: "accessory", sets: 3, reps: "10–15", targetRpe: 7, alternatives: [] },
      { name: "Core movement", movement: "core", sets: 3, reps: "10–15", targetRpe: 7, alternatives: [] },
    ],
  })),
  weeks: Array.from({ length: 5 }, (_, index) => ({
    week: index + 1,
    phase: index === 4 ? "deload" : index === 0 ? "baseline" : "progress_load",
    targetRpe: index === 4 ? 6 : index === 0 ? 7 : 8,
    setMultiplier: index === 4 ? 0.67 : 1,
    instruction: index === 4 ? "Reduce sets by about one-third." : "Progress while form and recovery remain solid.",
  })),
};

export const WEEKLY_AUTOPILOT_REVIEW = {
  weekStart: isoDaysAgo(6),
  weekEnd: isoDaysAgo(0),
  confidence: {
    level: "high",
    loggedDays: 7,
    detail: "Six or more daily logs and a usable progress trend support this review.",
  },
  primaryAction: {
    key: "hold_steady",
    title: "Hold the plan steady",
    detail: "The strongest move is another consistent week—not a new target.",
    route: "/today",
  },
  scorecard: [
    { key: "nutrition", label: "Nutrition consistency", status: "on_track", value: "86% target consistency", detail: "Seven intake days reviewed.", score: 0.86 },
    { key: "training", label: "Training follow-through", status: "on_track", value: "3 of 4 strength days", detail: "Calendar days count once.", score: 0.75 },
    { key: "recovery", label: "Recovery", status: "on_track", value: "7.4h sleep · 4/5 energy", detail: "Recovery supports the current direction.", score: 1 },
    { key: "habits", label: "Habit follow-through", status: "on_track", value: "82% completed", detail: "Daily habit opportunities reviewed.", score: 0.82 },
    { key: "progress", label: "Weight trend", status: "on_track", value: "-0.4 lb observed", detail: "Direction is descriptive, not a stand-alone target change.", score: 1 },
  ],
  supportingActions: [],
  adjustmentsAllowed: true,
  latestDecision: "keep_plan",
  mealPlanImpact: "Keep current nutrition targets and carry the same meal structure into next week.",
  trainingBlockImpact: "Progress the current training direction while keeping the planned deload.",
  notice: "Weekly Autopilot summarizes logged patterns. It does not diagnose conditions or replace qualified medical, nutrition, or training care.",
};
