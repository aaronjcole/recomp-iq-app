const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EQUIPMENT_OPTIONS = Object.freeze(["bodyweight_home", "dumbbells", "full_gym"]);
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 42;

export class TrainingPlanRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrainingPlanRequestError";
  }
}

const EXERCISES = Object.freeze({
  full_gym: {
    squat: ["Back squat", "Leg press"],
    hinge: ["Romanian deadlift", "Hip thrust"],
    single_leg: ["Bulgarian split squat", "Walking lunge"],
    horizontal_push: ["Bench press", "Machine chest press"],
    horizontal_pull: ["Chest-supported row", "Cable row"],
    vertical_push: ["Overhead press", "Machine shoulder press"],
    vertical_pull: ["Lat pulldown", "Assisted pull-up"],
    biceps: ["Cable curl", "Dumbbell curl"],
    triceps: ["Cable pressdown", "Overhead cable extension"],
    calves: ["Standing calf raise", "Seated calf raise"],
    core: ["Cable crunch", "Dead bug"]
  },
  dumbbells: {
    squat: ["Goblet squat", "Dumbbell front squat"],
    hinge: ["Dumbbell Romanian deadlift", "Dumbbell hip thrust"],
    single_leg: ["Dumbbell split squat", "Dumbbell reverse lunge"],
    horizontal_push: ["Dumbbell bench press", "Dumbbell floor press"],
    horizontal_pull: ["One-arm dumbbell row", "Chest-supported dumbbell row"],
    vertical_push: ["Dumbbell overhead press", "Arnold press"],
    vertical_pull: ["Dumbbell pullover", "Supported high row"],
    biceps: ["Dumbbell curl", "Hammer curl"],
    triceps: ["Dumbbell skull crusher", "Overhead dumbbell extension"],
    calves: ["Single-leg calf raise", "Dumbbell calf raise"],
    core: ["Weighted dead bug", "Dumbbell suitcase hold"]
  },
  bodyweight_home: {
    squat: ["Bodyweight squat", "Tempo squat"],
    hinge: ["Hip bridge", "Single-leg hip bridge"],
    single_leg: ["Reverse lunge", "Rear-foot-elevated split squat"],
    horizontal_push: ["Push-up", "Incline push-up"],
    horizontal_pull: ["Towel isometric row", "Prone reverse snow angel"],
    vertical_push: ["Pike push-up", "Kneeling pike push-up"],
    vertical_pull: ["Prone lat pull-down", "Towel lat isometric"],
    biceps: ["Towel curl isometric", "Self-resisted curl"],
    triceps: ["Close-grip push-up", "Bench triceps dip"],
    calves: ["Single-leg calf raise", "Tempo calf raise"],
    core: ["Dead bug", "Side plank"]
  }
});

const SPLITS = Object.freeze({
  1: [{ title: "Full body", focus: "Full body", movements: ["squat", "horizontal_push", "horizontal_pull", "hinge", "core"] }],
  2: [
    { title: "Full body A", focus: "Squat + push", movements: ["squat", "horizontal_push", "horizontal_pull", "hinge", "core"] },
    { title: "Full body B", focus: "Hinge + pull", movements: ["hinge", "vertical_push", "vertical_pull", "single_leg", "core"] }
  ],
  3: [
    { title: "Full body A", focus: "Squat + push", movements: ["squat", "horizontal_push", "horizontal_pull", "hinge", "core"] },
    { title: "Full body B", focus: "Hinge + pull", movements: ["hinge", "vertical_push", "vertical_pull", "single_leg", "core"] },
    { title: "Full body C", focus: "Single-leg + upper", movements: ["single_leg", "horizontal_push", "horizontal_pull", "squat", "core"] }
  ],
  4: [
    { title: "Upper A", focus: "Horizontal push + pull", movements: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "biceps", "triceps"] },
    { title: "Lower A", focus: "Squat", movements: ["squat", "hinge", "single_leg", "calves", "core"] },
    { title: "Upper B", focus: "Vertical push + pull", movements: ["vertical_push", "vertical_pull", "horizontal_push", "horizontal_pull", "triceps", "biceps"] },
    { title: "Lower B", focus: "Hinge", movements: ["hinge", "single_leg", "squat", "calves", "core"] }
  ],
  5: [
    { title: "Upper", focus: "Balanced upper", movements: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "biceps", "triceps"] },
    { title: "Lower", focus: "Balanced lower", movements: ["squat", "hinge", "single_leg", "calves", "core"] },
    { title: "Push", focus: "Chest + shoulders + triceps", movements: ["horizontal_push", "vertical_push", "single_leg", "triceps", "core"] },
    { title: "Pull", focus: "Back + biceps", movements: ["horizontal_pull", "vertical_pull", "hinge", "biceps", "core"] },
    { title: "Legs", focus: "Quads + posterior chain", movements: ["squat", "hinge", "single_leg", "calves", "core"] }
  ],
  6: [
    { title: "Push A", focus: "Chest emphasis", movements: ["horizontal_push", "vertical_push", "single_leg", "triceps", "core"] },
    { title: "Pull A", focus: "Row emphasis", movements: ["horizontal_pull", "vertical_pull", "hinge", "biceps", "core"] },
    { title: "Legs A", focus: "Squat emphasis", movements: ["squat", "single_leg", "hinge", "calves", "core"] },
    { title: "Push B", focus: "Shoulder emphasis", movements: ["vertical_push", "horizontal_push", "single_leg", "triceps", "core"] },
    { title: "Pull B", focus: "Vertical-pull emphasis", movements: ["vertical_pull", "horizontal_pull", "hinge", "biceps", "core"] },
    { title: "Legs B", focus: "Hinge emphasis", movements: ["hinge", "single_leg", "squat", "calves", "core"] }
  ]
});

function validDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeTrainingPlanRequest(value) {
  if (!value || typeof value !== "object" || !validDateString(value.weekStart)) {
    throw new TrainingPlanRequestError("weekStart must be a valid date in YYYY-MM-DD format");
  }
  if (!EQUIPMENT_OPTIONS.includes(value.equipment)) {
    throw new TrainingPlanRequestError("Choose bodyweight/home, dumbbells, or full gym equipment");
  }
  const blockLengthWeeks = Number(value.blockLengthWeeks);
  if (!Number.isInteger(blockLengthWeeks) || blockLengthWeeks < 4 || blockLengthWeeks > 6) {
    throw new TrainingPlanRequestError("blockLengthWeeks must be 4, 5, or 6");
  }
  return { weekStart: value.weekStart, equipment: value.equipment, blockLengthWeeks };
}

function ratio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number > 1 && number <= 100 ? number / 100 : Math.min(1, number);
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function dateMs(value) {
  return validDateString(value) ? new Date(`${value}T00:00:00.000Z`).getTime() : null;
}

function recentRecords(records, weekStart) {
  const end = dateMs(weekStart);
  const start = end - HISTORY_DAYS * DAY_MS;
  return Array.isArray(records)
    ? records.filter((record) => {
      const date = dateMs(record?.date);
      return date !== null && date < end && date >= start;
    })
    : [];
}

function movementForLift(name) {
  const lift = String(name ?? "").toLowerCase();
  if (/split squat|lunge/.test(lift)) return "single_leg";
  if (/squat|leg press/.test(lift)) return "squat";
  if (/deadlift|rdl|hip thrust|good morning/.test(lift)) return "hinge";
  if (/bench|chest press|push-up/.test(lift)) return "horizontal_push";
  if (/pulldown|pull-up|chin-up/.test(lift)) return "vertical_pull";
  if (/row/.test(lift)) return "horizontal_pull";
  if (/overhead press|shoulder press/.test(lift)) return "vertical_push";
  if (/curl/.test(lift)) return "biceps";
  if (/tricep|pressdown|skull crusher/.test(lift)) return "triceps";
  if (/calf/.test(lift)) return "calves";
  if (/plank|crunch|dead bug/.test(lift)) return "core";
  return null;
}

function trackedMovements(strengthLogs, weekStart) {
  const counts = new Map();
  for (const log of recentRecords(strengthLogs, weekStart)) {
    const movement = movementForLift(log?.lift_name);
    if (!movement) continue;
    const existing = counts.get(movement);
    if (!existing || (existing.count === 1 && String(log.date) > existing.latestDate)) {
      counts.set(movement, {
        name: String(log.lift_name).trim(),
        count: (existing?.count ?? 0) + 1,
        latestDate: String(log.date)
      });
    } else {
      existing.count += 1;
      if (String(log.date) > existing.latestDate) {
        existing.name = String(log.lift_name).trim();
        existing.latestDate = String(log.date);
      }
    }
  }
  return counts;
}

function adaptationFor({ sessions, weekStart, targetDays, experience, checkIn }) {
  const recent = recentRecords(sessions, weekStart).filter((session) => (
    session.type === "strength" || session.type === "mixed"
  ));
  const uniqueDates = new Set(recent.map((session) => session.date)).size;
  const expectedSessions = Math.max(1, targetDays * 6);
  const consistency = Math.min(1, uniqueDates / expectedSessions);
  const averageRpe = average(recent.map((session) => session.perceived_exertion));
  const checkInAdherence = ratio(checkIn?.workout_adherence);
  const lowRecovery = [checkIn?.energy_average, checkIn?.sleep_average]
    .map(Number)
    .filter(Number.isFinite)
    .some((value) => value <= 2.5);
  const recoveryBiased = (averageRpe !== null && averageRpe >= 8.5)
    || (checkInAdherence !== null && checkInAdherence < 0.6)
    || lowRecovery
    || checkIn?.recommendation_decision === "reduce_training_fatigue";

  if (recent.length === 0) {
    return {
      mode: "on_ramp",
      consistency: null,
      averageRpe: null,
      summary: "No recent strength sessions were found, so week one starts conservatively and builds repeatable technique."
    };
  }
  if (recoveryBiased) {
    return {
      mode: "recovery_biased",
      consistency: Number(consistency.toFixed(2)),
      averageRpe: averageRpe === null ? null : Number(averageRpe.toFixed(1)),
      summary: "Recent adherence or recovery signals favor lower starting volume and a controlled rebuild."
    };
  }
  if (consistency < 0.55) {
    return {
      mode: "consistency_first",
      consistency: Number(consistency.toFixed(2)),
      averageRpe: averageRpe === null ? null : Number(averageRpe.toFixed(1)),
      summary: "Recent training frequency favors a straightforward schedule that is easier to complete consistently."
    };
  }
  return {
    mode: experience === "advanced" ? "performance_build" : "progressive_build",
    consistency: Number(consistency.toFixed(2)),
    averageRpe: averageRpe === null ? null : Number(averageRpe.toFixed(1)),
    summary: "Recent training supports a progressive block with planned rep, load, and volume steps."
  };
}

function repsFor(movement, equipment) {
  if (["biceps", "triceps", "calves", "core"].includes(movement)) return "10–15";
  if (equipment === "bodyweight_home") return "8–15";
  return ["squat", "hinge", "horizontal_push", "horizontal_pull"].includes(movement) ? "6–10" : "8–12";
}

function splitName(days) {
  if (days <= 3) return "full_body_rotation";
  if (days === 4) return "upper_lower";
  return "push_pull_legs_hybrid";
}

function weeksFor(length, recoveryBiased) {
  return Array.from({ length }, (_, index) => {
    const week = index + 1;
    if (week === length) {
      return {
        week,
        phase: "deload",
        targetRpe: 6,
        setMultiplier: 0.67,
        instruction: "Reduce sets by about one-third, keep technique crisp, and stop well short of failure."
      };
    }
    if (week === 1) {
      return {
        week,
        phase: recoveryBiased ? "reset" : "baseline",
        targetRpe: recoveryBiased ? 6.5 : 7,
        setMultiplier: recoveryBiased ? 0.8 : 1,
        instruction: recoveryBiased
          ? "Use conservative loads and finish every set with at least three comfortable reps in reserve."
          : "Choose repeatable loads that leave about three reps in reserve."
      };
    }
    if (week === 2) {
      return { week, phase: "accumulate_reps", targetRpe: 7.5, setMultiplier: 1, instruction: "Add one rep per set where last week's form and reserve were solid." };
    }
    if (week === 3) {
      return { week, phase: "progress_load", targetRpe: 8, setMultiplier: 1, instruction: "At the top of the rep range, add the smallest practical load and return to the low end." };
    }
    return { week, phase: "build_volume", targetRpe: 8, setMultiplier: 1.15, instruction: "Add one set to the first movement only if recovery and technique remain good." };
  });
}

export function buildAdaptiveTrainingBlock({ request, profile, preferences, strategy, sessions, strengthLogs, checkIn }) {
  const normalized = normalizeTrainingPlanRequest(request);
  if (!profile || typeof profile !== "object") {
    throw new TrainingPlanRequestError("A completed training profile is required");
  }
  const experience = ["beginner", "intermediate", "advanced"].includes(profile.experience_level)
    ? profile.experience_level
    : "beginner";
  const requestedDays = Number(strategy?.lifting_days_target ?? profile.training_days_per_week);
  if (!Number.isFinite(requestedDays) || requestedDays < 1) {
    throw new TrainingPlanRequestError("Set at least one weekly lifting day before creating a block");
  }
  const targetDays = Math.max(1, Math.min(6, Math.round(requestedDays)));
  const adaptation = adaptationFor({
    sessions,
    weekStart: normalized.weekStart,
    targetDays,
    experience,
    checkIn
  });
  const baseSets = { beginner: 2, intermediate: 3, advanced: 4 }[experience];
  const startingSets = adaptation.mode === "recovery_biased"
    ? Math.max(2, baseSets - 1)
    : adaptation.mode === "on_ramp"
      ? 2
      : baseSets;
  const startingRpe = adaptation.mode === "recovery_biased" ? 6.5 : 7;
  const tracked = normalized.equipment === "full_gym"
    ? trackedMovements(strengthLogs, normalized.weekStart)
    : new Map();
  const recentSessions = recentRecords(sessions, normalized.weekStart);
  const averageDuration = average(recentSessions.map((session) => session.duration_minutes));
  const sessionMinutes = Math.max(30, Math.min(75, Math.round(averageDuration ?? (targetDays >= 5 ? 45 : 55))));

  const schedule = SPLITS[targetDays].map((template, index) => ({
    day: index + 1,
    title: template.title,
    focus: template.focus,
    estimatedMinutes: sessionMinutes,
    exercises: template.movements.map((movement, movementIndex) => {
      const options = EXERCISES[normalized.equipment][movement];
      const trackedLift = tracked.get(movement)?.name;
      return {
        name: trackedLift || options[movementIndex % options.length],
        movement,
        sets: startingSets,
        reps: repsFor(movement, normalized.equipment),
        targetRpe: startingRpe,
        alternatives: options.filter((option) => option !== trackedLift).slice(0, 2)
      };
    })
  }));

  return {
    weekStart: normalized.weekStart,
    blockLengthWeeks: normalized.blockLengthWeeks,
    equipment: normalized.equipment,
    split: splitName(targetDays),
    schedule,
    weeks: weeksFor(normalized.blockLengthWeeks, adaptation.mode === "recovery_biased"),
    adaptation,
    preferredTraining: typeof preferences?.preferred_training === "string"
      ? preferences.preferred_training.slice(0, 120)
      : "",
    trackedLifts: [...new Set([...tracked.values()].map((item) => item.name))].slice(0, 6),
    progressionRule: "Stay inside the listed rep range. Add reps first; only add the smallest practical load after every set reaches the top of the range with clean form and the target RPE.",
    safetyNotice: "Stop for sharp pain, dizziness, or unusual symptoms. Exercise selection and progression are educational and are not medical care."
  };
}
