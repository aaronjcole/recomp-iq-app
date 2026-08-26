// Ported 1:1 from RecompOne src/lib/fitness/adjustments.ts. The weekly decision
// tree that keeps recommendations safe and trend-driven. Pure functions.

const GAIN_GOALS = new Set(["muscle_gain", "lean_bulk", "aggressive_gain"]);
const RECOMP_GOALS = new Set(["body_recomposition", "fat_loss_biased_recomp"]);

function changeCalories(strategy, delta) {
  return Math.max(1500, Math.min(20000, Math.round((strategy.calorie_target + delta) / 10) * 10));
}

function fatLossPlateauLever(profile, strategy) {
  if (profile.job_activity === "sedentary" && strategy.step_target < 8000) {
    return {
      decision: "increase_steps",
      reason: "Weight and waist are flat with good consistency, and steps are still the lowest-friction lever.",
      updates: { step_target: strategy.step_target + 1500 },
      behaviorFocus: "Add a 10-minute lunch walk and a 10-minute after-dinner walk."
    };
  }
  return {
    decision: "reduce_calories",
    reason: "Weight and waist are flat with good consistency, so a small calorie reduction is warranted.",
    updates: { calorie_target: changeCalories(strategy, -150) },
    behaviorFocus: strategy.behavior_focus
  };
}

export function decideWeeklyAdjustment(input) {
  const { trend, profile, preferences, strategy } = input;
  const safetyRedFlag = (preferences?.safety_flags ?? []).length > 0;
  const adherenceValues = [trend.calorie_adherence, trend.protein_adherence, trend.step_adherence].filter(
    (v) => v !== null
  );
  const avgAdherence = adherenceValues.length ? adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length : null;
  let decision = "keep_plan_and_monitor";
  let reason = "The safest move is to keep collecting trend data before making a larger change.";
  let nextStrategy = { ...strategy };
  let behaviorFocus = strategy.behavior_focus;
  const rate =
    typeof trend.weight_change_percent_per_week === "number" && Number.isFinite(trend.weight_change_percent_per_week)
      ? trend.weight_change_percent_per_week
      : null;
  const goal = profile.goal || strategy.goal_type;

  if (safetyRedFlag) {
    decision = "seek_professional_guidance";
    reason = "A safety flag is present, so RecompOne avoids aggressive targets and recommends qualified professional guidance.";
  } else if (trend.days_logged < 14) {
    decision = "keep_collecting_data";
    reason = "Fewer than 14 recent calendar days of data is too early to judge the plan.";
  } else if (!adherenceValues.length) {
    decision = "keep_collecting_data";
    reason = "Adherence data is missing, so RecompOne cannot tell whether the current targets were followed.";
  } else if (avgAdherence !== null && avgAdherence < 0.8) {
    decision = "focus_on_adherence";
    reason = "Consistency is below 80%, so changing targets would add noise before solving the main blocker.";
    behaviorFocus = "Make the current plan easier: one protein anchor and one short walk each day.";
  } else if (input.strengthCrashing || trend.recovery_label === "poor") {
    decision = "reduce_training_fatigue";
    reason = "Recovery or strength signals are poor, so cutting calories harder is not the first move.";
    behaviorFocus = "Protect sleep, hydration, and training performance this week.";
  } else if (GAIN_GOALS.has(goal)) {
    const desiredMin = goal === "aggressive_gain" ? 0.0025 : 0.001;
    const desiredMax = goal === "aggressive_gain" ? 0.01 : 0.005;
    if (rate !== null && rate >= desiredMin && rate <= desiredMax) {
      decision = "keep_plan";
      reason = "Your 7-day average is rising in a measured muscle-gain range.";
    } else if ((rate !== null && rate < -0.001) || (input.consecutiveFlatWeeks ?? 0) >= 2) {
      decision = "increase_calories";
      reason = "Weight is falling or has stayed flat despite good consistency, which does not support the current gain goal.";
      nextStrategy.calorie_target = changeCalories(strategy, 150);
    } else if (rate !== null && rate > desiredMax) {
      decision = "reduce_calories";
      reason = "Weight is rising faster than the selected gain goal calls for, so a small calorie reduction can limit unnecessary fat gain.";
      nextStrategy.calorie_target = changeCalories(strategy, -150);
    }
  } else if (goal === "maintenance") {
    if (rate !== null && rate < -0.0025) {
      decision = "increase_calories";
      reason = "Weight is moving below the maintenance range, so a small calorie increase is warranted.";
      nextStrategy.calorie_target = changeCalories(strategy, 150);
    } else if (rate !== null && rate > 0.0025) {
      decision = "reduce_calories";
      reason = "Weight is moving above the maintenance range, so a small calorie reduction is warranted.";
      nextStrategy.calorie_target = changeCalories(strategy, -150);
    } else if (rate !== null) {
      decision = "keep_plan";
      reason = "Your weight trend is within a practical maintenance range.";
    }
  } else if (RECOMP_GOALS.has(goal)) {
    if (trend.waist_label === "down" && (trend.trend_label === "flat" || trend.trend_label === "gaining")) {
      decision = trend.trend_label === "gaining" ? "keep_plan_possible_recomp_or_water" : "keep_plan_possible_recomp";
      reason = "Waist is down while scale is flat or up. That can be a valid recomp or water-retention signal.";
    } else if (rate !== null && rate < -0.01) {
      decision = "increase_calories";
      reason = "Weight is dropping faster than a recomposition goal calls for, so the plan should protect recovery and performance.";
      nextStrategy.calorie_target = changeCalories(strategy, 150);
    } else if (rate !== null && rate > 0.0025) {
      decision = "reduce_calories";
      reason = "Weight is rising beyond the selected recomposition range without a lower-waist signal, so a small calorie reduction is warranted.";
      nextStrategy.calorie_target = changeCalories(strategy, -150);
    } else if ((input.consecutiveFlatWeeks ?? 0) >= 2 && trend.waist_label !== "down") {
      const plateau = fatLossPlateauLever(profile, strategy);
      decision = plateau.decision;
      reason = plateau.reason;
      nextStrategy = { ...nextStrategy, ...plateau.updates };
      behaviorFocus = plateau.behaviorFocus;
    } else if (rate !== null && rate >= -0.005 && rate <= 0.0025) {
      decision = "keep_plan";
      reason = "Your scale trend is compatible with a measured recomposition phase.";
    }
  } else {
    const desiredMinLossRate = goal === "aggressive_fat_loss" ? -0.015 : -0.01;
    const maxLossRate = goal === "aggressive_fat_loss" ? -0.015 : -0.0125;
    if (rate !== null && rate <= -0.0025 && rate >= desiredMinLossRate) {
      decision = "keep_plan";
      reason = "Your 7-day average is moving in a sustainable fat-loss range.";
    } else if (rate !== null && rate < maxLossRate) {
      decision = "increase_calories";
      reason = "Weight is dropping too quickly for the selected goal. The plan should protect performance and recovery.";
      nextStrategy.calorie_target = changeCalories(strategy, 150);
    } else if (trend.waist_label === "down" && (trend.trend_label === "flat" || trend.trend_label === "gaining")) {
      decision = trend.trend_label === "gaining" ? "keep_plan_possible_recomp_or_water" : "keep_plan_possible_recomp";
      reason = "Waist is down while scale is flat or up. That can be a valid recomp or water-retention signal.";
    } else if (rate !== null && rate > 0.0025) {
      decision = "reduce_calories";
      reason = "Weight is rising beyond the selected fat-loss range without a lower-waist signal, so a small calorie reduction is warranted.";
      nextStrategy.calorie_target = changeCalories(strategy, -150);
    } else if ((input.consecutiveFlatWeeks ?? 0) >= 2 && trend.waist_label !== "down") {
      const plateau = fatLossPlateauLever(profile, strategy);
      decision = plateau.decision;
      reason = plateau.reason;
      nextStrategy = { ...nextStrategy, ...plateau.updates };
      behaviorFocus = plateau.behaviorFocus;
    }
  }

  return { decision, reason, nextStrategy: { ...nextStrategy, behavior_focus: behaviorFocus }, behaviorFocus };
}

export function explainRecompSignal(trend) {
  if (trend.days_logged < 14) return { label: "Need more data", copy: "One week is not enough. Keep logging and watch the 7-day average." };
  if (trend.waist_label === "down" && trend.trend_label !== "losing")
    return { label: "Possible recomp", copy: "Waist is improving while scale is flat or noisy. Strength and recovery decide how confidently we call this." };
  if (trend.trend_label === "losing" && trend.recovery_label !== "poor")
    return { label: "Likely fat loss", copy: "The trend is moving down without a recovery warning. Keep the plan steady." };
  if ((trend.calorie_adherence ?? 1) < 0.8) return { label: "Adherence first", copy: "Targets may be fine. The next win is making the plan easier to repeat." };
  if (trend.recovery_label === "poor")
    return { label: "Recovery issue", copy: "Poor sleep, high soreness, or low energy can hide progress and hurt strength retention." };
  return { label: "Scale noise likely", copy: "Sodium, glycogen, and soreness can mask fat loss." };
}

export function detectPlateau(trend) {
  if (trend.days_logged < 14) return { reason: "Not enough data", checks: ["Get at least 14 days of weigh-ins before changing calories."] };
  if ((trend.calorie_adherence ?? 1) < 0.8) return { reason: "Adherence inconsistency", checks: ["Check weekends, restaurant meals, and missing logs first."] };
  if ((trend.step_adherence ?? 1) < 0.8) return { reason: "Step output too low", checks: ["For a desk job, add steps gradually instead of jumping to 10,000."] };
  if (trend.recovery_label === "poor") return { reason: "Recovery masking progress", checks: ["Sleep, soreness, sodium, and hard new training can lift scale water."] };
  if (trend.trend_label === "flat" && trend.waist_label !== "down")
    return { reason: "Calories likely near maintenance", checks: ["Consider -150 calories or +1,500 steps if this repeats next week."] };
  return { reason: "Water retention likely", checks: ["Use consistent weigh-in timing and compare weekly averages."] };
}