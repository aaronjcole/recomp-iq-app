// Ported 1:1 from RecompOne src/lib/fitness/trainingAnalysis.ts. Pure functions.

import { estimateOneRepMax } from "./calculators";
import { average, sortLogs } from "./trends";

export function summarizeTrainingLoad(sessions, targetLiftingDays, targetCardioDays) {
  const recent = sortLogs(sessions).slice(-7);
  const strengthSessions = recent.filter((session) => session.type === "strength" || session.type === "mixed").length;
  const cardioSessions = recent.filter((session) => session.type === "cardio" || session.type === "mixed").length;
  const minutes = recent.reduce((sum, session) => sum + (session.duration_minutes ?? 0), 0);
  const exertion = average(recent.map((session) => session.perceived_exertion));
  return {
    strength_sessions: strengthSessions,
    cardio_sessions: cardioSessions,
    total_minutes: minutes,
    average_exertion: exertion === null ? null : Number(exertion.toFixed(1)),
    lifting_adherence: targetLiftingDays ? Math.min(1, strengthSessions / targetLiftingDays) : null,
    cardio_adherence: targetCardioDays ? Math.min(1, cardioSessions / targetCardioDays) : null
  };
}

export function summarizeStrengthProgress(strengthLogs, liftName) {
  const logs = sortLogs(strengthLogs.filter((log) => log.lift_name === liftName));
  if (logs.length < 2)
    return { lift_name: liftName, change_lbs: null, current_estimated_1rm: logs.at(-1)?.estimated_1rm ?? null, label: "need_more_data" };
  const first = logs[0].estimated_1rm || estimateOneRepMax(logs[0].weight, logs[0].reps);
  const last = logs[logs.length - 1].estimated_1rm || estimateOneRepMax(logs[logs.length - 1].weight, logs[logs.length - 1].reps);
  const change = last - first;
  return {
    lift_name: liftName,
    change_lbs: change,
    current_estimated_1rm: last,
    label: change > 5 ? "building" : change < -5 ? "declining" : "stable"
  };
}