// Ported 1:1 from RecompIQ src/lib/fitness/adjustments.ts. The weekly decision
// tree that keeps recommendations safe and trend-driven. Pure functions.

export function decideWeeklyAdjustment(input) {
  const { trend, profile, preferences, strategy } = input;
  const safetyRedFlag = (preferences.safety_flags ?? []).length > 0;
  const adherenceValues = [trend.calorie_adherence, trend.protein_adherence, trend.step_adherence].filter(
    (v) => v !== null
  );
  const avgAdherence = adherenceValues.length ? adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length : null;
  let decision = "keep_plan_and_monitor";
  let reason = "The safest move is to keep collecting trend data before making a larger change.";
  let nextStrategy = { ...strategy };
  let behaviorFocus = strategy.behavior_focus;

  if (safetyRedFlag) {
    decision = "seek_professional_guidance";
    reason = "A safety flag is present, so RecompIQ avoids aggressive targets and recommends qualified professional guidance.";
  } else if (avgAdherence !== null && avgAdherence < 0.8) {
    decision = "focus_on_adherence";
    reason = "Consistency is below 80%, so changing targets would add noise before solving the main blocker.";
    behaviorFocus = "Make the current plan easier: one protein anchor and one short walk each day.";
  } else if (trend.days_logged < 14) {
    decision = "keep_collecting_data";
    reason = "Fewer than 14 days of data is too early to judge the plan.";
  } else if (input.strengthCrashing || trend.recovery_label === "poor") {
    decision = "reduce_training_fatigue";
    reason = "Recovery or strength signals are poor, so cutting calories harder is not the first move.";
    behaviorFocus = "Protect sleep, hydration, and training performance this week.";
  } else if (
    trend.weight_change_percent_per_week !== null &&
    trend.weight_change_percent_per_week <= -0.0025 &&
    trend.weight_change_percent_per_week >= -0.01
  ) {
    decision = "keep_plan";
    reason = "Your 7-day average is moving in a sustainable fat-loss range.";
  } else if (trend.weight_change_percent_per_week !== null && trend.weight_change_percent_per_week < -0.0125 && trend.recovery_label !== "good") {
    decision = "increase_calories";
    reason = "Weight is dropping quickly while recovery is not strong. The plan should protect performance.";
    nextStrategy.calorie_target += 150;
  } else if (trend.waist_label === "down" && (trend.trend_label === "flat" || trend.trend_label === "gaining")) {
    decision = trend.trend_label === "gaining" ? "keep_plan_possible_recomp_or_water" : "keep_plan_possible_recomp";
    reason = "Waist is down while scale is flat or up. That can be a valid recomp or water-retention signal.";
  } else if (input.consecutiveFlatWeeks && input.consecutiveFlatWeeks >= 2 && trend.waist_label !== "down") {
    if (profile.job_activity === "sedentary" && strategy.step_target < 8000) {
      decision = "increase_steps";
      reason = "Weight and waist are flat with good consistency, and steps are still the lowest-friction lever.";
      nextStrategy.step_target += 1500;
      behaviorFocus = "Add a 10-minute lunch walk and a 10-minute after-dinner walk.";
    } else {
      decision = "reduce_calories";
      reason = "Weight and waist are flat with good consistency, so a small calorie reduction is warranted.";
      nextStrategy.calorie_target = Math.max(strategy.calorie_target - 150, 1800);
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