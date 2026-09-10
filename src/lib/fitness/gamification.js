// Ported 1:1 from RecompOne src/lib/fitness/gamification.ts. Signal strength,
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

// --- Streak engine ---
// A streak counts consecutive days hitting nutrition + step targets. A single
// missed day is absorbed ("frozen") once the run reaches FREEZE_THRESHOLD hits,
// so one rest day doesn't erase weeks of consistency. All values are derived
// from the log history — no persisted streak state is needed.

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function hitTargets(log, strategy) {
  if (!log || !strategy) return false;
  const cal = log.calories;
  const protein = log.protein_g;
  const steps = log.steps;
  if (cal == null || protein == null) return false;
  const calTarget = strategy.calorie_target;
  const proteinTarget = strategy.protein_target_g;
  const stepTarget = strategy.step_target;
  const calOk = calTarget > 0 && cal >= calTarget * 0.85 && cal <= calTarget * 1.15;
  const proteinOk = proteinTarget > 0 && protein >= proteinTarget * 0.9;
  const stepsOk = stepTarget > 0 ? steps != null && steps >= stepTarget : true;
  return calOk && proteinOk && stepsOk;
}

const FREEZE_THRESHOLD = 5;

function scanRunBackward(byDate, strategy, startOffset) {
  let length = 0;
  let freezeUsed = false;
  let frozenDate = null;
  for (let i = startOffset; i < 400; i++) {
    const log = byDate.get(daysAgoKey(i));
    if (log && hitTargets(log, strategy)) {
      length++;
    } else if (log && !hitTargets(log, strategy)) {
      if (!freezeUsed && length >= FREEZE_THRESHOLD) {
        freezeUsed = true;
        frozenDate = daysAgoKey(i);
        length++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return { length, freezeUsed, frozenDate };
}

function calculateLongestStreak(byDate, strategy) {
  if (byDate.size === 0) return 0;
  const sorted = [...byDate.keys()].sort();
  const spanDays = Math.round(
    (new Date(localTodayKey() + "T00:00:00") - new Date(sorted[0] + "T00:00:00")) / 86400000
  );
  let longest = 0;
  let run = 0;
  let freezeUsed = false;
  for (let i = spanDays; i >= 0; i--) {
    const log = byDate.get(daysAgoKey(i));
    if (log && hitTargets(log, strategy)) {
      run++;
    } else if (log && !hitTargets(log, strategy)) {
      if (!freezeUsed && run >= FREEZE_THRESHOLD) {
        freezeUsed = true;
        run++;
      } else {
        if (run > longest) longest = run;
        run = 0;
        freezeUsed = false;
      }
    } else {
      if (run > longest) longest = run;
      run = 0;
      freezeUsed = false;
    }
  }
  return Math.max(longest, run);
}

function findLastBrokenRun(byDate, strategy) {
  for (let i = 0; i < 400; i++) {
    const log = byDate.get(daysAgoKey(i));
    if (log && hitTargets(log, strategy)) {
      return scanRunBackward(byDate, strategy, i).length;
    }
  }
  return 0;
}

export function calculateStreakStats(logs, strategy) {
  if (!strategy) {
    return { current: 0, longest: 0, lastBroken: 0, freezeUsed: false, freezeArmed: false, frozenDate: null };
  }
  const byDate = new Map();
  for (const l of logs) byDate.set(l.date, l);
  const todayLog = byDate.get(localTodayKey());

  let currentRun;
  if (todayLog && hitTargets(todayLog, strategy)) {
    currentRun = scanRunBackward(byDate, strategy, 0);
  } else if (todayLog && !hitTargets(todayLog, strategy)) {
    currentRun = { length: 0, freezeUsed: false, frozenDate: null };
  } else {
    currentRun = scanRunBackward(byDate, strategy, 1);
  }

  const current = currentRun.length;
  return {
    current,
    longest: calculateLongestStreak(byDate, strategy),
    lastBroken: current === 0 ? findLastBrokenRun(byDate, strategy) : 0,
    freezeUsed: currentRun.freezeUsed,
    freezeArmed: current >= FREEZE_THRESHOLD && !currentRun.freezeUsed,
    frozenDate: currentRun.frozenDate,
  };
}