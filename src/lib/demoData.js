// Demo data seeding for RecompIQ. Creates ~35 days of realistic records for the
// current user through the Base44 SDK so created_by_id / RLS are honoured.
// Does NOT touch any fitness math — only uses recalculateTargets (for a missing
// strategy) and estimateOneRepMax (for strength logs) from @/lib/fitness.

import { base44 } from "@/api/base44Client";
import { recalculateTargets, estimateOneRepMax } from "@/lib/fitness";

const DEMO_KEY = "recomp-demo-ids";

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function round(n, p = 1) {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
function randBetween(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(randBetween(a, b + 1));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function seedDemoData({ profile, strategy }) {
  // Replace any prior demo records so re-running stays clean.
  await clearDemoData();

  const p = profile || {};
  const currentWeight = p.current_weight_lbs ?? 220;
  const goalWeight = p.goal_weight_lbs ?? currentWeight;
  const trainingDays = p.training_days_per_week ?? 3;

  let strat = strategy;
  if (!strat) {
    const computed = recalculateTargets(p);
    strat = await base44.entities.CurrentStrategy.create({ ...computed, goal_type: p.goal });
  }

  const calTarget = strat.calorie_target ?? 2200;
  const proTarget = strat.protein_target_g ?? 160;
  const stepTarget = strat.step_target ?? 8000;

  // --- 35 DailyLog records (oldest -> newest) -------------------------------
  const startWeight = currentWeight + Math.sign(currentWeight - goalWeight) * Math.abs(currentWeight - goalWeight) * 0.25 || currentWeight;
  const dailyLogs = [];
  for (let i = 0; i < 35; i++) {
    const frac = i / 34;
    const base = startWeight + (currentWeight - startWeight) * frac;
    const weight = round(base + randBetween(-0.8, 0.8), 1);
    const workout = Math.random() < trainingDays / 7;
    const entry = {
      date: daysAgoStr(34 - i),
      weight_lbs: weight,
      calories: Math.round((calTarget + randInt(-180, 180)) / 10) * 10,
      protein_g: proTarget + randInt(-8, 8),
      carbs_g: Math.round((strat.carb_target_g ?? 200) / 10) * 10 + randInt(-20, 20),
      fat_g: Math.round((strat.fat_target_g ?? 70) + randInt(-6, 6)),
      steps: Math.max(0, Math.round((stepTarget + randInt(-1500, 1500)) / 100) * 100),
      workout_completed: workout,
      workout_type: workout ? pick(["strength", "cardio", "mixed"]) : undefined,
      hunger_rating: randInt(2, 4),
      energy_rating: randInt(3, 5),
      sleep_hours: round(randBetween(6, 8.5), 1),
      sleep_quality: randInt(3, 5),
      soreness_rating: randInt(1, 3),
      notes: "demo"
    };
    if (i % 7 === 6) entry.waist_in = round(38 - i * 0.02, 1);
    dailyLogs.push(entry);
  }
  const createdLogs = await base44.entities.DailyLog.bulkCreate(dailyLogs);

  // --- StrengthLog records (slight upward 1RM progression) ------------------
  const liftPlans = [
    { name: "Squat", weights: [225, 235, 245], reps: [5, 5, 4] },
    { name: "Bench Press", weights: [185, 190, 195], reps: [6, 5, 5] },
    { name: "Deadlift", weights: [275, 285, 295], reps: [3, 3, 2] },
    { name: "Overhead Press", weights: [95, 100, 105], reps: [6, 5, 5] }
  ];
  const strengthLogs = [];
  let dayOffset = 34;
  for (const lift of liftPlans) {
    for (let k = 0; k < lift.weights.length; k++) {
      const weight = lift.weights[k];
      const reps = lift.reps[k];
      strengthLogs.push({
        date: daysAgoStr(dayOffset),
        lift_name: lift.name,
        weight,
        reps,
        sets: 3,
        estimated_1rm: estimateOneRepMax(weight, reps),
        notes: "demo"
      });
      dayOffset -= 3;
      if (dayOffset < 1) dayOffset = 1;
    }
  }
  const createdStrength = await base44.entities.StrengthLog.bulkCreate(strengthLogs);

  // --- ExerciseSession records (mix of strength + cardio) -----------------
  const sessions = [
    { date: daysAgoStr(30), type: "strength", title: "Push day", duration_minutes: 55, perceived_exertion: 7, muscle_groups: ["chest", "triceps", "shoulders"], notes: "demo" },
    { date: daysAgoStr(22), type: "cardio", title: "Zone 2 run", duration_minutes: 35, perceived_exertion: 5, notes: "demo" },
    { date: daysAgoStr(14), type: "strength", title: "Pull day", duration_minutes: 50, perceived_exertion: 7, muscle_groups: ["back", "biceps"], notes: "demo" },
    { date: daysAgoStr(6), type: "mixed", title: "Legs + conditioning", duration_minutes: 60, perceived_exertion: 8, muscle_groups: ["quads", "hamstrings", "glutes"], notes: "demo" }
  ];
  const createdSessions = await base44.entities.ExerciseSession.bulkCreate(sessions);

  // --- One WeeklyCheckIn ----------------------------------------------------
  const checkIn = await base44.entities.WeeklyCheckIn.create({
    start_date: daysAgoStr(7),
    end_date: todayStr(),
    avg_weight_current: round(currentWeight, 1),
    avg_weight_previous: round(currentWeight + 1.2, 1),
    weight_change: -1.2,
    calorie_adherence: 0.82,
    protein_adherence: 0.88,
    step_adherence: 0.74,
    workout_adherence: 0.9,
    hunger_average: 3.1,
    energy_average: 3.8,
    sleep_average: 7.1,
    recommendation_decision: "keep_plan",
    ai_summary: "demo: solid adherence with a gentle downward weight trend. Keep the current plan and monitor for another week.",
    targets_for_next_week: {
      calorie_target: calTarget,
      protein_target_g: proTarget,
      step_target: stepTarget
    }
  });

  // --- One DecisionLedger (small calorie change) ----------------------------
  const newCal = Math.round((calTarget - 100) / 10) * 10;
  const ledger = await base44.entities.DecisionLedger.create({
    date: daysAgoStr(7),
    previous_targets: { calorie_target: calTarget },
    new_targets: { calorie_target: newCal },
    reason: "demo: small calorie reduction after a 7-day plateau",
    supporting_metrics: { weight_change_lbs: 0.1, calorie_adherence: 0.83 }
  });

  // Remember the IDs of records without a notes field so clearDemoData can remove them.
  localStorage.setItem(
    DEMO_KEY,
    JSON.stringify({
      checkIns: [checkIn.id],
      ledger: [ledger.id]
    })
  );

  return { dailyLogs: createdLogs, strengthLogs: createdStrength, sessions: createdSessions, checkIn, ledger };
}

export async function clearDemoData() {
  await Promise.all([
    base44.entities.DailyLog.deleteMany({ notes: "demo" }),
    base44.entities.StrengthLog.deleteMany({ notes: "demo" }),
    base44.entities.ExerciseSession.deleteMany({ notes: "demo" })
  ]);
  let ids = {};
  try {
    ids = JSON.parse(localStorage.getItem(DEMO_KEY) || "{}");
  } catch {
    ids = {};
  }
  const del = (entity, arr) => (arr && arr.length ? Promise.all(arr.map((id) => base44.entities[entity].delete(id))) : Promise.resolve());
  await Promise.all([del("WeeklyCheckIn", ids.checkIns), del("DecisionLedger", ids.ledger)]);
  localStorage.removeItem(DEMO_KEY);
}