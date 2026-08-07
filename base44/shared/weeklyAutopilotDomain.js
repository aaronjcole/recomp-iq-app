const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export class AutopilotRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "AutopilotRequestError";
  }
}

function validDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeAutopilotRequest(value) {
  if (!value || typeof value !== "object" || !validDateString(value.weekEnd)) {
    throw new AutopilotRequestError("weekEnd must be a valid date in YYYY-MM-DD format");
  }
  return { weekEnd: value.weekEnd };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function withinPeriod(date, start, end) {
  return validDateString(date) && date >= start && date <= end;
}

function recordTimestamp(record, fallbackIndex) {
  for (const field of ["updated_date", "created_date"]) {
    const value = Date.parse(record?.[field]);
    if (Number.isFinite(value)) return value;
  }
  return fallbackIndex;
}

function newestByKey(records, keyFor) {
  const latest = new Map();
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    const key = keyFor(record);
    if (!key) return;
    const timestamp = recordTimestamp(record, index);
    const existing = latest.get(key);
    if (!existing || timestamp >= existing.timestamp) latest.set(key, { record, timestamp });
  });
  return [...latest.values()].map((item) => item.record);
}

function average(values) {
  const finite = values.filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function rounded(value, digits = 0) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function nutritionSignal(logs, strategy) {
  const calorieTarget = Number(strategy?.calorie_target);
  const proteinTarget = Number(strategy?.protein_target_g);
  const validTargets = calorieTarget > 0 && proteinTarget > 0;
  const nutritionLogs = logs.filter((log) => Number(log.calories) > 0 || Number(log.protein_g) > 0);
  if (!validTargets || nutritionLogs.length < 3) {
    return {
      key: "nutrition",
      label: "Nutrition consistency",
      status: "insufficient",
      value: `${nutritionLogs.length} logged day${nutritionLogs.length === 1 ? "" : "s"}`,
      detail: "Log at least three complete intake days before treating adherence as a trend.",
      score: null
    };
  }
  const calorieHits = nutritionLogs.filter((log) => {
    const calories = Number(log.calories);
    return Number.isFinite(calories) && Math.abs(calories - calorieTarget) <= calorieTarget * 0.1;
  }).length;
  const proteinHits = nutritionLogs.filter((log) => Number(log.protein_g) >= proteinTarget * 0.9).length;
  const score = (calorieHits + proteinHits) / (nutritionLogs.length * 2);
  return {
    key: "nutrition",
    label: "Nutrition consistency",
    status: score >= 0.75 ? "on_track" : "opportunity",
    value: `${Math.round(score * 100)}% target consistency`,
    detail: `${nutritionLogs.length} intake days reviewed against your current calorie and protein targets.`,
    score: rounded(score, 2)
  };
}

function trainingSignal(sessions, strategy, profile) {
  const completed = new Set(sessions
    .filter((session) => session.type === "strength" || session.type === "mixed")
    .map((session) => session.date)).size;
  const target = Math.max(1, Math.min(7, Math.round(Number(
    strategy?.lifting_days_target ?? profile?.training_days_per_week ?? 0
  )) || 0));
  const score = Math.min(1, completed / target);
  return {
    key: "training",
    label: "Training follow-through",
    status: completed >= Math.max(1, Math.ceil(target * 0.75)) ? "on_track" : "opportunity",
    value: `${completed} of ${target} strength days`,
    detail: completed === 0
      ? "No strength or mixed session was logged in this review window."
      : "Each calendar day counts once, even when multiple sessions are logged.",
    score: rounded(score, 2)
  };
}

function recoverySignal(logs) {
  const recoveryLogs = logs.filter((log) => [log.sleep_hours, log.energy_rating, log.soreness_rating]
    .some((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))));
  if (recoveryLogs.length < 3) {
    return {
      key: "recovery",
      label: "Recovery",
      status: "insufficient",
      value: `${recoveryLogs.length} recovery day${recoveryLogs.length === 1 ? "" : "s"}`,
      detail: "Three or more recovery check-ins make this signal useful.",
      score: null
    };
  }
  const sleep = average(recoveryLogs.map((log) => log.sleep_hours));
  const energy = average(recoveryLogs.map((log) => log.energy_rating));
  const soreness = average(recoveryLogs.map((log) => log.soreness_rating));
  const strained = (sleep !== null && sleep < 6.5)
    || (energy !== null && energy < 3)
    || (soreness !== null && soreness > 4);
  const parts = [];
  if (sleep !== null) parts.push(`${rounded(sleep, 1)}h sleep`);
  if (energy !== null) parts.push(`${rounded(energy, 1)}/5 energy`);
  if (soreness !== null) parts.push(`${rounded(soreness, 1)}/5 soreness`);
  return {
    key: "recovery",
    label: "Recovery",
    status: strained ? "opportunity" : "on_track",
    value: parts.join(" · "),
    detail: strained
      ? "One or more recovery signals favor a more conservative training week."
      : "Logged recovery supports the current training direction.",
    score: strained ? 0.5 : 1
  };
}

function habitSignal(habits, entries, weekStart, weekEnd) {
  const activeHabits = (Array.isArray(habits) ? habits : []).filter((habit) => habit?.id && habit.archived !== true);
  if (activeHabits.length === 0) {
    return {
      key: "habits",
      label: "Habit follow-through",
      status: "insufficient",
      value: "No active habits",
      detail: "Add a daily habit to include it in the next review.",
      score: null
    };
  }
  const byHabit = new Map(activeHabits.map((habit) => [habit.id, habit]));
  const latestEntries = newestByKey(
    (Array.isArray(entries) ? entries : []).filter((entry) => (
      byHabit.has(entry?.habit_id) && withinPeriod(entry?.date, weekStart, weekEnd)
    )),
    (entry) => `${entry.habit_id}|${entry.date}`
  );
  const complete = latestEntries.filter((entry) => {
    const habit = byHabit.get(entry.habit_id);
    return habit.kind === "count"
      ? Number(entry.value) >= Number(habit.target_value ?? 1)
      : entry.done === true;
  }).length;
  const opportunities = activeHabits.length * 7;
  const score = complete / opportunities;
  return {
    key: "habits",
    label: "Habit follow-through",
    status: score >= 0.7 ? "on_track" : "opportunity",
    value: `${Math.round(score * 100)}% completed`,
    detail: `${complete} of ${opportunities} daily habit opportunities were completed.`,
    score: rounded(score, 2)
  };
}

function progressSignal(logs, goal) {
  const weights = logs
    .filter((log) => Number.isFinite(Number(log.weight_lbs)) && Number(log.weight_lbs) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length < 2) {
    return {
      key: "progress",
      label: "Weight trend",
      status: "insufficient",
      value: `${weights.length} weigh-in${weights.length === 1 ? "" : "s"}`,
      detail: "Two or more weigh-ins are needed to describe direction; one week alone should not drive a target change.",
      score: null
    };
  }
  const change = rounded(Number(weights.at(-1).weight_lbs) - Number(weights[0].weight_lbs), 1);
  const fatLossGoal = ["fat_loss_biased_recomp", "fat_loss", "aggressive_fat_loss", "strength_retention_cut"].includes(goal);
  const gainGoal = ["muscle_gain", "lean_bulk", "aggressive_gain"].includes(goal);
  const goalOpposed = (fatLossGoal && change > 0.5) || (gainGoal && change < -0.5);
  return {
    key: "progress",
    label: "Weight trend",
    status: goalOpposed ? "opportunity" : "on_track",
    value: `${change > 0 ? "+" : ""}${change} lb observed`,
    detail: goalOpposed
      ? "Direction ran against the current goal; confirm it with a second week before changing targets."
      : `${weights.length} weigh-ins describe direction, not a stand-alone reason to change the plan.`,
    score: 1
  };
}

function actionFor(scorecard, safetyActive, loggedDays) {
  if (safetyActive) {
    return {
      key: "safety_guidance",
      title: "Pause automated adjustments",
      detail: "Keep activity conservative and review nutrition or training changes with a qualified professional.",
      route: "/more/profile"
    };
  }
  if (loggedDays < 3) {
    return {
      key: "collect_evidence",
      title: "Complete three useful check-ins",
      detail: "Add nutrition, recovery, and weight data before asking one partial week to change your plan.",
      route: "/today"
    };
  }
  const signals = Object.fromEntries(scorecard.map((signal) => [signal.key, signal]));
  if (signals.nutrition.status === "opportunity") {
    return {
      key: "nutrition_consistency",
      title: "Choose one repeatable meal anchor",
      detail: "Repeat one protein-forward meal on your hardest days before tightening calorie targets.",
      route: "/nutrition/meal-plan"
    };
  }
  if (signals.training.status === "opportunity") {
    return {
      key: "training_consistency",
      title: "Schedule the next strength session",
      detail: "Protect one concrete training slot before adding more volume or complexity.",
      route: "/training/plan"
    };
  }
  if (signals.recovery.status === "opportunity") {
    return {
      key: "recovery_priority",
      title: "Create one easier recovery night",
      detail: "Use an earlier wind-down or a lower-fatigue session before progressing training load.",
      route: "/today"
    };
  }
  if (signals.progress.status === "opportunity") {
    return {
      key: "validate_progress",
      title: "Validate the progress signal",
      detail: "Keep targets steady and look for the same direction across a second week before adjusting.",
      route: "/progress"
    };
  }
  if (signals.habits.status === "opportunity") {
    return {
      key: "habit_simplification",
      title: "Shrink one habit to its minimum version",
      detail: "Make the easiest repeatable version count this week, then rebuild frequency.",
      route: "/today"
    };
  }
  if (signals.progress.status === "insufficient") {
    return {
      key: "progress_evidence",
      title: "Add a second comparable weigh-in",
      detail: "Use similar conditions so next week's direction is easier to interpret.",
      route: "/progress"
    };
  }
  return {
    key: "hold_steady",
    title: "Hold the plan steady",
    detail: "The strongest move is another consistent week—not a new target.",
    route: "/today"
  };
}

function supportingActions(scorecard, primaryKey) {
  const candidates = {
    nutrition: { key: "nutrition", title: "Use the adaptive meal planner", route: "/nutrition/meal-plan" },
    training: { key: "training", title: "Review the next training block", route: "/training/plan" },
    recovery: { key: "recovery", title: "Protect tonight's recovery window", route: "/today" },
    habits: { key: "habits", title: "Choose one minimum habit", route: "/today" },
    progress: { key: "progress", title: "Add a comparable progress check", route: "/progress" }
  };
  const primarySignal = {
    nutrition_consistency: "nutrition",
    training_consistency: "training",
    recovery_priority: "recovery",
    habit_simplification: "habits",
    progress_evidence: "progress",
    validate_progress: "progress"
  }[primaryKey];
  return scorecard
    .filter((signal) => signal.status !== "on_track" && signal.key !== primarySignal)
    .map((signal) => candidates[signal.key])
    .filter(Boolean)
    .slice(0, 2);
}

export function buildWeeklyAutopilotReview({
  weekEnd,
  strategy,
  profile,
  preferences,
  logs,
  sessions,
  habits,
  habitEntries,
  checkIn
}) {
  normalizeAutopilotRequest({ weekEnd });
  if (!strategy || typeof strategy !== "object") {
    throw new AutopilotRequestError("A current strategy is required");
  }
  const weekStart = addDays(weekEnd, -6);
  const periodLogs = newestByKey(
    (Array.isArray(logs) ? logs : []).filter((log) => withinPeriod(log?.date, weekStart, weekEnd)),
    (log) => log.date
  );
  const periodSessions = newestByKey(
    (Array.isArray(sessions) ? sessions : []).filter((session) => withinPeriod(session?.date, weekStart, weekEnd)),
    (session) => session.id || `${session.date}|${session.type}|${session.title ?? ""}`
  );
  const scorecard = [
    nutritionSignal(periodLogs, strategy),
    trainingSignal(periodSessions, strategy, profile),
    recoverySignal(periodLogs),
    habitSignal(habits, habitEntries, weekStart, weekEnd),
    progressSignal(periodLogs, strategy?.goal_type ?? profile?.goal)
  ];
  const loggedDays = periodLogs.length;
  const confidence = loggedDays >= 6 && scorecard.find((signal) => signal.key === "progress").status !== "insufficient"
    ? { level: "high", loggedDays, detail: "Six or more daily logs and a usable progress trend support this review." }
    : loggedDays >= 3
      ? { level: "medium", loggedDays, detail: "The review can identify consistency gaps, but another complete week would improve confidence." }
      : { level: "low", loggedDays, detail: "This review is evidence-limited and will not recommend target changes." };
  const safetyActive = Array.isArray(preferences?.safety_flags) && preferences.safety_flags.length > 0;
  const primaryAction = actionFor(scorecard, safetyActive, loggedDays);
  const adjustmentsAllowed = !safetyActive && confidence.level !== "low";

  return {
    weekStart,
    weekEnd,
    confidence,
    scorecard,
    primaryAction,
    supportingActions: supportingActions(scorecard, primaryAction.key),
    adjustmentsAllowed,
    latestDecision: typeof checkIn?.recommendation_decision === "string"
      ? checkIn.recommendation_decision
      : null,
    mealPlanImpact: safetyActive
      ? "Pause automated meal-plan changes until safety guidance is reviewed."
      : scorecard[0].status === "opportunity"
        ? "Use a simplified meal rotation and repeat ingredients before changing targets."
        : "Keep current nutrition targets and carry the same meal structure into next week.",
    trainingBlockImpact: safetyActive
      ? "Pause automated training progression until safety guidance is reviewed."
      : scorecard[2].status === "opportunity"
        ? "Use a recovery-biased starting week before progressing the training block."
        : scorecard[1].status === "opportunity"
          ? "Keep the next block simple and prioritize schedule completion over added volume."
          : "Progress the current training direction while keeping the planned deload.",
    notice: "Weekly Autopilot summarizes logged patterns. It does not diagnose conditions or replace qualified medical, nutrition, or training care."
  };
}
