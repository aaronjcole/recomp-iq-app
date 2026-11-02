// Progress insights: what the last two weeks of data show, kept in three
// separate layers so an inference is never presented as a fact.
//
//   observed     measured values and how many data points they rest on
//   signals      each measure's direction, judged against the user's goal
//   explanation  the likely reading of the signals together (inferred),
//                with a confidence level and what would change it
//
// Plus `missing`: each measure that could not be judged and why. Pure
// functions; covered by tests/fitness/progress-insights.test.js.

import { strengthTrend } from "./strengthTrend.js";
import { liftKey } from "./liftProgression.js";

const GAIN_GOALS = new Set(["muscle_gain", "lean_bulk", "aggressive_gain"]);
const RECOMP_GOALS = new Set(["body_recomposition", "fat_loss_biased_recomp", "recomp"]);
const ADHERENCE_FLOOR = 0.8;

/** "loss", "gain", "recomp" or "maintenance": what a good weight trend looks like. */
export function goalDirection(goal) {
  if (GAIN_GOALS.has(goal)) return "gain";
  if (RECOMP_GOALS.has(goal)) return "recomp";
  if (goal === "maintenance") return "maintenance";
  return "loss";
}

function signed(value, unit) {
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

// favorable / unfavorable / neutral for the goal, or null when unknown.
function weightSignal(trendLabel, direction) {
  if (trendLabel === "insufficient_data" || !trendLabel) return null;
  if (direction === "loss") return trendLabel === "losing" ? "favorable" : trendLabel === "gaining" ? "unfavorable" : "neutral";
  if (direction === "gain") return trendLabel === "gaining" ? "favorable" : trendLabel === "losing" ? "unfavorable" : "neutral";
  // Recomp and maintenance: a stable scale is the target.
  return trendLabel === "flat" ? "favorable" : "neutral";
}

function waistSignal(waistLabel, direction) {
  if (waistLabel === "unavailable" || !waistLabel) return null;
  if (direction === "gain") return waistLabel === "up" ? "unfavorable" : "favorable";
  return waistLabel === "down" ? "favorable" : waistLabel === "up" ? "unfavorable" : "neutral";
}

function strengthSignal(strength) {
  if (!strength) return null;
  return strength.direction === "up" ? "favorable" : strength.direction === "down" ? "unfavorable" : "neutral";
}

function recoverySignal(label) {
  if (label === "good") return "favorable";
  if (label === "poor") return "unfavorable";
  if (label === "moderate") return "neutral";
  return null;
}

function adherenceValues(trend) {
  return [
    ["Calories", trend.calorie_adherence],
    ["Protein", trend.protein_adherence],
    ["Steps", trend.step_adherence],
    ["Workouts", trend.workout_adherence]
  ].filter(([, value]) => typeof value === "number");
}

/**
 * @param {{ trend: object | null, strengthLogs?: Array<object>, goal?: string }} input
 *   trend: analyzeTrends' result for the last 14 days.
 */
export function buildProgressInsights({ trend, strengthLogs = [], goal }) {
  const direction = goalDirection(goal);
  const observed = [];
  const missing = [];
  const signals = {};

  if (!trend) {
    return {
      direction,
      observed,
      signals,
      agreement: "insufficient",
      explanation: null,
      confidence: "low",
      missing: [{ measure: "Everything", reason: "No logs in the last two weeks yet." }]
    };
  }

  // Weight
  if (trend.weight_change_lbs !== null && trend.weight_change_lbs !== undefined) {
    observed.push({
      measure: "Weight",
      text: `7-day average ${trend.avg_weight_current_7_day} lb, ${signed(trend.weight_change_lbs, "lb")} vs the week before.`
    });
  } else {
    missing.push({ measure: "Weight", reason: "Fewer than 3 weigh-ins in one of the last two weeks, so there is no weekly average to compare." });
  }
  signals.weight = weightSignal(trend.trend_label, direction);

  // Waist
  if (trend.waist_change_in !== null && trend.waist_change_in !== undefined) {
    observed.push({ measure: "Waist", text: `${signed(trend.waist_change_in, "in")} vs the week before.` });
  } else {
    missing.push({ measure: "Waist", reason: "No waist measurement in both of the last two weeks." });
  }
  signals.waist = waistSignal(trend.waist_label, direction);

  // Strength (lift names normalized so differently typed lifts count once)
  const strength = strengthTrend((strengthLogs ?? []).map((log) => ({ ...log, lift_name: liftKey(log.lift_name) })));
  if (strength) {
    observed.push({
      measure: "Strength",
      text: `Estimated 1RM ${strength.change_percent > 0 ? "+" : ""}${strength.change_percent}% on average across ${strength.lifts_used} ${strength.lifts_used === 1 ? "lift" : "lifts"} over the last 4 weeks.`
    });
  } else {
    missing.push({ measure: "Strength", reason: "No lift logged at least twice, 10+ days apart, in the last 4 weeks." });
  }
  signals.strength = strengthSignal(strength);

  // Recovery
  const recoveryParts = [];
  if (typeof trend.sleep_average === "number") recoveryParts.push(`sleep ${trend.sleep_average} h`);
  if (typeof trend.energy_average === "number") recoveryParts.push(`energy ${trend.energy_average}/5`);
  if (recoveryParts.length) {
    observed.push({ measure: "Recovery", text: `This week's average: ${recoveryParts.join(", ")} (${trend.recovery_label}).` });
  } else {
    missing.push({ measure: "Recovery", reason: "Sleep, energy and soreness weren't logged this week." });
  }
  signals.recovery = recoverySignal(trend.recovery_label);

  // Adherence
  const adherence = adherenceValues(trend);
  if (adherence.length) {
    observed.push({ measure: "Consistency", text: `This week on target: ${adherence.map(([label, value]) => `${label.toLowerCase()} ${pct(value)}`).join(", ")}.` });
  } else {
    missing.push({ measure: "Consistency", reason: "No calories, protein, steps or workouts logged this week." });
  }
  const lowAdherence = adherence.filter(([, value]) => value < ADHERENCE_FLOOR).map(([label]) => label.toLowerCase());
  signals.adherence = adherence.length ? (lowAdherence.length ? "unfavorable" : "favorable") : null;

  const known = Object.values(signals).filter(Boolean);
  const body = [signals.weight, signals.waist, signals.strength].filter(Boolean);
  let agreement = "insufficient";
  if (body.length >= 2) {
    const hasFavorable = body.includes("favorable");
    const hasUnfavorable = body.includes("unfavorable");
    agreement = hasFavorable && hasUnfavorable ? "conflict" : "agree";
  }

  const explanation = explain({ trend, signals, strength, direction, lowAdherence });

  let confidence = "low";
  if (trend.days_logged >= 14 && known.length >= 4 && body.length >= 2) confidence = "high";
  else if (trend.days_logged >= 14 && body.length >= 2) confidence = "medium";
  // A reading that leans on consistency the user didn't have can't be confident.
  if (lowAdherence.length && confidence === "high") confidence = "medium";

  return { direction, observed, signals, agreement, explanation, confidence, missing };
}

/** The likely reading of the signals together. Always an inference. */
function explain({ trend, signals, strength, direction, lowAdherence }) {
  const weight = trend.trend_label;
  const waist = trend.waist_label;
  const strengthDir = strength?.direction ?? null;

  if (trend.days_logged < 14) {
    return {
      text: "It's too early to read the trend. Two weeks of logs are needed before changes mean much.",
      watch: "Keep logging weight most mornings and the basics each day."
    };
  }
  if (lowAdherence.length) {
    return {
      text: `Consistency was below 80% for ${lowAdherence.join(", ")}, so the trend may reflect missed targets more than the plan itself.`,
      watch: "A week closer to target will show whether the plan works as set."
    };
  }
  if (waist === "down" && (weight === "flat" || weight === "gaining") && strengthDir !== "down") {
    return {
      text: "Waist is going down while the scale holds or rises. That pattern fits recomposition (losing fat while keeping or gaining muscle), or short-term water retention.",
      watch: "If waist keeps falling for another week or two, recomposition is the likelier reading."
    };
  }
  if (weight === "losing" && strengthDir === "down") {
    return {
      text: "Weight is coming down but estimated strength is falling. That can mean some muscle loss or accumulated fatigue, not only fat loss.",
      watch: signals.recovery === "unfavorable"
        ? "Recovery is also poor this week; better sleep and protein are the first things to check."
        : "Watch protein intake and recovery; if strength keeps dropping, the deficit may be too large."
    };
  }
  if (weight === "gaining" && trend.recovery_label === "poor") {
    return {
      text: "The scale rose during a week of poor recovery. Water retention from poor sleep, soreness or stress commonly causes this, so it may not be fat gain.",
      watch: "Compare next week's average once recovery improves before drawing a conclusion."
    };
  }
  if (direction === "loss" && weight === "losing" && waist !== "up" && strengthDir !== "down") {
    return {
      text: "Weight is trending down without a strength drop, which is consistent with fat loss.",
      watch: waist === "unavailable" ? "Adding a weekly waist measurement would confirm it isn't only water." : "Keep the plan steady."
    };
  }
  if (direction === "gain" && weight === "gaining" && waist !== "up" && strengthDir !== "down") {
    return {
      text: "Weight is rising with waist steady and strength holding or improving, which fits lean gain.",
      watch: "If waist starts rising week after week, the surplus may be larger than needed."
    };
  }
  if (direction === "gain" && weight === "gaining" && waist === "up") {
    return {
      text: "Weight and waist are both rising, which suggests part of the gain is fat.",
      watch: "A slightly smaller surplus keeps more of the gain as muscle."
    };
  }
  if (weight === "flat" && (waist === "flat" || waist === "unavailable")) {
    return {
      text: direction === "loss"
        ? "Weight is flat with good consistency, which suggests intake is close to maintenance."
        : "Weight is stable, which fits the current goal.",
      watch: direction === "loss" ? "If it stays flat for another week, a small adjustment is reasonable." : "Keep the plan steady."
    };
  }
  if (direction === "loss" && weight === "gaining") {
    return {
      text: "Weight is rising with good consistency, which suggests intake is above what the current goal needs.",
      watch: "One more week confirms whether it's a trend or noise."
    };
  }
  return {
    text: "The signals don't point clearly in one direction yet.",
    watch: "Another week of consistent logs will make the read clearer."
  };
}
