// Ported 1:1 from RecompIQ src/lib/fitness/adherence.ts. Pure functions.

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateTargetAdherence(values, target, tolerance = 0.1) {
  const logged = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!logged.length || target <= 0) return null;
  const scores = logged.map((value) => Math.max(0, 1 - Math.abs(value - target) / (target * tolerance * 2)));
  return Number(average(scores).toFixed(2));
}

export function calculateMinimumAdherence(values, target) {
  const logged = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!logged.length || target <= 0) return null;
  const scores = logged.map((value) => Math.min(value / target, 1));
  return Number(average(scores).toFixed(2));
}

export function summarizeAdherence(logs, targets) {
  const workoutDays = logs.filter((log) => log.workout_completed).length;
  return {
    calorie_adherence: calculateTargetAdherence(logs.map((log) => log.calories), targets.calories),
    protein_adherence: calculateMinimumAdherence(logs.map((log) => log.protein_g), targets.protein),
    step_adherence: calculateMinimumAdherence(logs.map((log) => log.steps), targets.steps),
    workout_adherence: Number(Math.min(workoutDays / targets.workouts, 1).toFixed(2))
  };
}