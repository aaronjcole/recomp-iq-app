// Ported 1:1 from RecompOne src/lib/fitness/adherence.ts. Pure functions.

function averageAcrossExpectedDays(scores, expectedDays) {
  if (!scores.length) return null;
  const denominator =
    typeof expectedDays === "number" && Number.isFinite(expectedDays) && expectedDays > 0
      ? Math.max(scores.length, Math.floor(expectedDays))
      : scores.length;
  return scores.reduce((sum, value) => sum + value, 0) / denominator;
}

function dateKey(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function recordTimestamp(log, index) {
  const timestamp = Date.parse(log?.updated_date || log?.created_date || "");
  return Number.isFinite(timestamp) ? timestamp : index;
}

function dedupeByDate(logs) {
  const ordered = (Array.isArray(logs) ? logs : [])
    .map((log, index) => ({ log, index, key: dateKey(log?.date) }))
    .filter((item) => item.key)
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) ||
        recordTimestamp(a.log, a.index) - recordTimestamp(b.log, b.index)
    );
  const byDate = new Map();
  for (const { log, key } of ordered) {
    const previous = byDate.get(key) || {};
    const merged = { ...previous };
    for (const [key, value] of Object.entries(log)) {
      if (value !== undefined) merged[key] = value;
    }
    byDate.set(key, { ...merged, date: key });
  }
  return [...byDate.values()];
}

export function calculateTargetAdherence(values, target, tolerance = 0.1, expectedDays) {
  const logged = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!logged.length || target <= 0) return null;
  const scores = logged.map((value) => Math.max(0, 1 - Math.abs(value - target) / (target * tolerance * 2)));
  return Number(averageAcrossExpectedDays(scores, expectedDays).toFixed(2));
}

export function calculateMinimumAdherence(values, target, expectedDays) {
  const logged = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!logged.length || target <= 0) return null;
  const scores = logged.map((value) => Math.max(0, Math.min(value / target, 1)));
  return Number(averageAcrossExpectedDays(scores, expectedDays).toFixed(2));
}

export function summarizeAdherence(logs, targets, options = {}) {
  const dailyLogs = dedupeByDate(logs);
  const workoutDays = dailyLogs.filter((log) => log.workout_completed).length;
  const expectedDays = options.expectedDays;
  return {
    calorie_adherence: calculateTargetAdherence(
      dailyLogs.map((log) => log.calories),
      targets.calories,
      0.1,
      expectedDays
    ),
    protein_adherence: calculateMinimumAdherence(
      dailyLogs.map((log) => log.protein_g),
      targets.protein,
      expectedDays
    ),
    step_adherence: calculateMinimumAdherence(dailyLogs.map((log) => log.steps), targets.steps, expectedDays),
    workout_adherence:
      typeof targets.workouts === "number" && targets.workouts > 0
        ? Number(Math.min(workoutDays / targets.workouts, 1).toFixed(2))
        : null
  };
}
