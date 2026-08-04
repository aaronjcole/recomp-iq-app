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
