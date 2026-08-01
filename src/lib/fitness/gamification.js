// Ported 1:1 from RecompIQ src/lib/fitness/gamification.ts. Signal strength,
// recomp level, weekly quests, and the "boss battle" framing. Pure functions.

import { dedupeLogsByDate, logsInCalendarWindow } from "./trends.js";

function localTodayKey() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function calculateSignalStrength(trend) {
  let score = 0;
  if (trend.days_logged >= 7) score += 24;
  if (trend.days_logged >= 14) score += 16;
  if ((trend.calorie_adherence ?? 0) >= 0.8) score += 16;
  if ((trend.protein_adherence ?? 0) >= 0.8) score += 14;
  if ((trend.step_adherence ?? 0) >= 0.75) score += 12;
  if ((trend.workout_adherence ?? 0) >= 0.8) score += 10;
  if (trend.waist_label !== "unavailable") score += 8;

  const clamped = Math.min(100, score);
  if (clamped >= 80) return { score: clamped, label: "High confidence", copy: "Enough consistent data to make a measured plan decision." };
  if (clamped >= 55) return { score: clamped, label: "Building confidence", copy: "The trend is useful. A few more logs will sharpen the read." };
  return { score: clamped, label: "Early read", copy: "No problem. Resume today and rebuild the data trail." };
}

export function getRecompLevel(signalScore) {
  if (signalScore >= 85) return { level: "Stage 5", title: "Ready to adjust", next: "Use the weekly review before changing targets." };
  if (signalScore >= 70) return { level: "Stage 4", title: "Strength protected", next: "Keep key lifts stable while waist and trend data mature." };
  if (signalScore >= 55) return { level: "Stage 3", title: "Trend visible", next: "Compare weekly averages, not single weigh-ins." };
  if (signalScore >= 35) return { level: "Stage 2", title: "Routine forming", next: "Hit protein early and log the basics." };
  return { level: "Stage 1", title: "Baseline week", next: "Collect enough logs for the first useful read." };
}

export function buildWeeklyQuests(logs, strategy, options = {}) {
  const referenceDate = options.referenceDate || localTodayKey();
  const recent = logsInCalendarWindow(dedupeLogsByDate(logs), referenceDate, 7);
  const weighIns = recent.filter((log) => typeof log.weight_lbs === "number").length;
  const proteinDays = recent.filter((log) => (log.protein_g ?? 0) >= strategy.protein_target_g * 0.9).length;
  const stepAttempts = recent.filter((log) => (log.steps ?? 0) >= strategy.step_target * 0.8).length;
  const workouts = recent.filter((log) => log.workout_completed).length;
  const waistLogs = recent.filter((log) => typeof log.waist_in === "number").length;

  return [
    { id: "weigh-ins", title: "Weigh-in rhythm", detail: `${weighIns}/5 morning weights`, complete: weighIns >= 5 },
    { id: "protein", title: "Protein floor", detail: `${proteinDays}/4 solid protein days`, complete: proteinDays >= 4 },
    { id: "steps", title: "Step floor", detail: `${stepAttempts}/4 step attempts`, complete: stepAttempts >= 4 },
    { id: "strength", title: "Lift schedule", detail: `${workouts}/${strategy.lifting_days_target} sessions completed`, complete: workouts >= strategy.lifting_days_target },
    { id: "measurement", title: "Waist check", detail: waistLogs ? "waist logged this week" : "waist check open", complete: waistLogs > 0 }
  ];
}

export function getBossBattle(trend) {
  if (trend.recovery_label === "poor") return { title: "Recovery is the limiter", countermove: "Hold calories, protect sleep, and avoid adding more fatigue." };
  if ((trend.step_adherence ?? 1) < 0.75) return { title: "Steps are the quiet lever", countermove: "Use lunch and after-dinner walks before lowering calories." };
  if (trend.trend_label === "gaining" && trend.waist_label !== "up") return { title: "Scale noise is likely", countermove: "Check sodium, soreness, creatine, and weigh-in timing before reacting." };
  if ((trend.calorie_adherence ?? 1) < 0.8) return { title: "Consistency before adjustment", countermove: "Plan one flexible meal and keep protein anchored." };
  return { title: "Hold the line", countermove: "Let the weekly review decide. No single day gets the steering wheel." };
}
