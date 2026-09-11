// Pure function: computes a goal-aware daily nutrition signal that blends
// macro adherence with per-food quality scoring and the user's weight trend.
// Reuses scoreNutritionQuality and the weekly-check-in recommendation logic —
// no duplicated thresholds or scoring rules.

import { scoreNutritionQuality } from "./nutritionScoring.js";
import { runWeeklyCheckIn } from "./recalculate.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Per-day macro adherence: calories/carbs/fat use a target-distance ratio
// (over and under both penalized), protein uses a minimum ratio (over is fine).
function macroAdherenceRatios(consumed, targets) {
  const ratios = {};
  for (const key of ["calories", "carbs", "fat"]) {
    const target = targets[key];
    const value = consumed[key] ?? 0;
    ratios[key] = target > 0 ? clamp01(1 - Math.abs(value - target) / target) : 0;
  }
  ratios.protein = targets.protein > 0 ? clamp01((consumed.protein ?? 0) / targets.protein) : 0;
  return ratios;
}

function gradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function macroLabel(key) {
  return { calories: "calories", protein: "protein", carbs: "carbs", fat: "fat" }[key];
}

// Decisions that represent an actual target change (not "keep going" advice).
const TARGET_CHANGE_DECISIONS = new Set([
  "reduce_calories",
  "increase_calories",
  "increase_steps"
]);

function goalTrendFromAdjustment(adjustment) {
  if (!adjustment) return null;
  const decision = adjustment.decision;
  if (!TARGET_CHANGE_DECISIONS.has(decision)) return null;
  const next = adjustment.nextStrategy || {};
  const notes = {
    reduce_calories:
      next.calorie_target != null
        ? `Your trend suggests a small calorie drop next check-in (~${Math.round(next.calorie_target)} kcal).`
        : "Your trend suggests a small calorie drop next check-in.",
    increase_calories:
      next.calorie_target != null
        ? `Your trend suggests a small calorie increase next check-in (~${Math.round(next.calorie_target)} kcal).`
        : "Your trend suggests a small calorie increase next check-in.",
    increase_steps:
      next.step_target != null
        ? `Your trend suggests adding steps next check-in (~${Math.round(next.step_target)}/day).`
        : "Your trend suggests adding steps next check-in."
  };
  return notes[decision] ?? null;
}

/**
 * @param {object} args
 * @param {object|null} args.log — the selected day's DailyLog (or null)
 * @param {Array} args.foodEntries — FoodLogEntry records for the selected day
 * @param {Array} args.foods — saved FoodItem records (for nudge suggestions)
 * @param {object} args.strategy — CurrentStrategy with macro targets
 * @param {object|null} args.profile — UserProfile (for check-in logic)
 * @param {object|null} args.preferences — UserPreferences (for check-in logic)
 * @param {Array} args.logs — all DailyLog records (for trend analysis)
 * @param {string} [args.referenceDate] — selected date (YYYY-MM-DD)
 * @returns {{grade:string,gradeLabel:string,score:number,summary:string,nudge:string,nudgeAction:object|null,goalTrendNote:string|null,goalTrendAction:object|null}}
 */
export function computeNutritionSignal({
  log,
  foodEntries,
  foods,
  strategy,
  profile,
  preferences,
  logs,
  referenceDate
}) {
  if (!strategy) {
    return {
      grade: "—",
      gradeLabel: "No strategy",
      score: 0,
      summary: "Set up your plan to see a daily nutrition signal.",
      nudge: "",
      nudgeAction: null,
      goalTrendNote: null,
      goalTrendAction: null
    };
  }

  const targets = {
    calories: strategy.calorie_target ?? 0,
    protein: strategy.protein_target_g ?? 0,
    carbs: strategy.carb_target_g ?? 0,
    fat: strategy.fat_target_g ?? 0
  };

  const consumed = {
    calories: log?.calories ?? 0,
    protein: log?.protein_g ?? 0,
    carbs: log?.carbs_g ?? 0,
    fat: log?.fat_g ?? 0
  };

  // ── Macro adherence (0–1) ──
  const ratios = macroAdherenceRatios(consumed, targets);
  const macroScore =
    (ratios.calories + ratios.protein + ratios.carbs + ratios.fat) / 4;

  // ── Per-food quality (0–100, normalized to 0–1) ──
  const entries = Array.isArray(foodEntries) ? foodEntries : [];
  const qualityScores = entries
    .map((entry) => scoreNutritionQuality(entry))
    .map((q) => q.score);
  const meanQuality =
    qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : null;
  const qualityRatio = meanQuality !== null ? meanQuality / 100 : null;

  // ── Composite grade ──
  // 60% macro adherence, 40% food quality (when available)
  const score = Math.round(
    (qualityRatio !== null
      ? 0.6 * macroScore + 0.4 * qualityRatio
      : macroScore
    ) * 100
  );
  const grade = gradeFromScore(score);

  // ── Summary ──
  const onTrack = Object.entries(ratios)
    .filter(([, r]) => r >= 0.85)
    .map(([k]) => macroLabel(k));
  const offTrack = Object.entries(ratios)
    .filter(([, r]) => r < 0.85)
    .map(([k]) => macroLabel(k));
  let summary;
  if (entries.length === 0 && consumed.calories === 0) {
    summary = "No food logged yet — log your first meal to see today's signal.";
  } else if (offTrack.length === 0) {
    summary = `Nice — all macros are on track (${score}/100). Keep the rhythm.`;
  } else if (offTrack.length <= 2) {
    summary = `On track for ${onTrack.join(", ") || "calories"}. Watch ${offTrack.join(", ")}.`;
  } else {
    summary = `Several macros are off today (${offTrack.join(", ")}). A small adjustment closes the gap.`;
  }

  // ── Nudge: largest macro shortfall → suggest a high-protein recent food ──
  const shortfalls = [
    { key: "protein", gap: targets.protein - consumed.protein, label: "protein" },
    { key: "calories", gap: targets.calories - consumed.calories, label: "calories" },
    { key: "carbs", gap: targets.carbs - consumed.carbs, label: "carbs" },
    { key: "fat", gap: targets.fat - consumed.fat, label: "fat" }
  ]
    .filter((s) => s.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  let nudge = "";
  let nudgeAction = null;
  if (shortfalls.length > 0) {
    const biggest = shortfalls[0];
    const gapRounded = biggest.key === "calories" ? Math.round(biggest.gap) : round1(biggest.gap);
    const unit = biggest.key === "calories" ? " kcal" : "g";
    // Suggest a high-protein recent food if protein is the gap or the top gap is small
    const suggestProtein = biggest.key === "protein";
    const savedFoods = Array.isArray(foods) ? foods : [];
    const candidate =
      suggestProtein && savedFoods.length > 0
        ? [...savedFoods]
            .sort((a, b) => (b.protein_g ?? 0) - (a.protein_g ?? 0))
            .find((f) => (f.protein_g ?? 0) >= 15)
        : null;
    if (candidate) {
      nudge = `${gapRounded}${unit} short on ${biggest.label} — add ${candidate.name} from your library.`;
      nudgeAction = { type: "add_food", foodId: candidate.id, food: candidate };
    } else {
      nudge = `${gapRounded}${unit} short on ${biggest.label} — tap to log a food.`;
      nudgeAction = { type: "open_form" };
    }
  }

  // ── Goal-trend note: reuse weekly check-in recommendation logic ──
  let goalTrendNote = null;
  let goalTrendAction = null;
  if (profile && Array.isArray(logs) && logs.length > 0) {
    try {
      const { adjustment } = runWeeklyCheckIn({
        logs,
        profile,
        preferences: preferences ?? { tone: "direct" },
        strategy,
        referenceDate
      });
      goalTrendNote = goalTrendFromAdjustment(adjustment);
      if (goalTrendNote) {
        goalTrendAction = { type: "review_checkin", decision: adjustment.decision };
      }
    } catch {
      // Insufficient data or safety flags — no trend note.
    }
  }

  return { grade, gradeLabel: grade, score, summary, nudge, nudgeAction, goalTrendNote, goalTrendAction };
}