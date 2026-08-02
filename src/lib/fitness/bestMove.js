const SIGNAL_CONFIDENCE = {
  high: { label: "High confidence", minimum: 80 },
  building: { label: "Building confidence", minimum: 55 },
  early: { label: "Early read", minimum: 0 }
};

function confidenceFor(signal) {
  const score = Number.isFinite(signal?.score) ? signal.score : 0;
  if (score >= SIGNAL_CONFIDENCE.high.minimum) return { ...SIGNAL_CONFIDENCE.high, score };
  if (score >= SIGNAL_CONFIDENCE.building.minimum) return { ...SIGNAL_CONFIDENCE.building, score };
  return { ...SIGNAL_CONFIDENCE.early, score };
}

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "Not enough data";
}

function titleCase(value) {
  if (!value || value === "unknown") return "Not enough data";
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function baseMove(signal) {
  return {
    confidence: confidenceFor(signal),
    guardrail: "This recommendation does not change your targets or logs.",
    alternatives: []
  };
}

/**
 * Returns one deterministic, explainable action for Today. This is a read-only
 * decision layer: it never writes to Base44 or changes the active strategy.
 */
export function deriveBestMove({ preferences, signal, strategy, todayLog, trend }) {
  if (!strategy || !trend) return null;

  const base = baseMove(signal);
  const calorieTarget = Number(strategy.calorie_target) || 0;
  const proteinTarget = Number(strategy.protein_target_g) || 0;
  const stepTarget = Number(strategy.step_target) || 0;
  const calories = Number(todayLog?.calories) || 0;
  const protein = Number(todayLog?.protein_g) || 0;
  const steps = Number(todayLog?.steps) || 0;
  const proteinGap = Math.max(0, Math.round(proteinTarget - protein));
  const calorieRoom = Math.max(0, Math.round(calorieTarget - calories));
  const stepGap = Math.max(0, Math.round(stepTarget - steps));
  const todaySignals = ["calories", "protein_g", "steps", "weight_lbs", "sleep_hours", "energy_rating"]
    .filter((key) => Number.isFinite(todayLog?.[key])).length;

  if ((preferences?.safety_flags ?? []).length > 0) {
    return {
      ...base,
      id: "safety-hold",
      title: "Keep the plan steady today",
      summary: "A safety guardrail is active, so RecompOne will not recommend an aggressive target change.",
      evidence: [
        { label: "Safety", value: "Guardrail active" },
        { label: "Current signal", value: `${base.confidence.score}/100` }
      ],
      alternatives: [
        { label: "Cut calories", reason: "Rejected while a safety guardrail is active." },
        { label: "Add training volume", reason: "Rejected without qualified guidance." }
      ],
      whatChanges: "Qualified guidance or an updated safety preference can change this recommendation.",
      action: { label: "Ask about the guardrail", to: "/coach" }
    };
  }

  if (trend.recovery_label === "poor") {
    return {
      ...base,
      id: "recovery-first",
      title: "Make today recovery-first",
      summary: "Recovery is the limiting signal. Keep calories steady and lower training stress instead of pushing harder.",
      evidence: [
        { label: "Recovery", value: "Poor" },
        { label: "Sleep average", value: Number.isFinite(trend.sleep_average) ? `${trend.sleep_average} hr` : "Not logged" },
        { label: "Energy average", value: Number.isFinite(trend.energy_average) ? `${trend.energy_average}/5` : "Not logged" }
      ],
      alternatives: [
        { label: "Cut calories", reason: "Rejected because it can add stress while recovery is low." },
        { label: "Add volume", reason: "Rejected because more fatigue is not the missing lever." }
      ],
      whatChanges: "A return to moderate or good recovery makes normal training the better choice.",
      action: { label: "Review training", to: "/training" }
    };
  }

  if (trend.days_logged < 14) {
    return {
      ...base,
      id: "collect-data",
      title: todaySignals < 2 ? "Log today—leave targets alone" : "Finish today—leave targets alone",
      summary: `You have ${trend.days_logged} of 14 recent days logged. The useful move is building the evidence trail, not reacting early.`,
      evidence: [
        { label: "Recent days", value: `${trend.days_logged}/14 logged` },
        { label: "Today", value: todaySignals < 2 ? "Needs a basic log" : `${todaySignals} signals logged` },
        { label: "Signal", value: `${base.confidence.score}/100 · ${base.confidence.label}` }
      ],
      alternatives: [
        { label: "Change targets", reason: "Rejected because fewer than 14 recent days is too early." },
        { label: "React to one weigh-in", reason: "Rejected because weekly averages are more reliable." }
      ],
      whatChanges: "Fourteen recent logged days and a stable weekly trend unlock a measured plan decision.",
      action: { label: "Log today's basics", type: "log" }
    };
  }

  if ((trend.calorie_adherence ?? 1) < 0.8) {
    return {
      ...base,
      id: "repeat-plan",
      title: "Repeat the plan—don’t tighten it",
      summary: "Consistency is the current bottleneck. Make the existing plan easier to repeat before changing the numbers.",
      evidence: [
        { label: "Calorie consistency", value: percent(trend.calorie_adherence) },
        { label: "Protein consistency", value: percent(trend.protein_adherence) },
        { label: "Weight trend", value: titleCase(trend.trend_label) }
      ],
      alternatives: [
        { label: "Lower calories", reason: "Rejected because it would change the plan before testing adherence." },
        { label: "Add cardio", reason: "Rejected because complexity is unlikely to improve consistency." }
      ],
      whatChanges: "A week at 80% or better consistency lets the trend—not missing logs—drive the next call.",
      action: { label: "Make Fuel easier", to: "/nutrition" }
    };
  }

  if ((trend.protein_adherence ?? 1) < 0.8 && proteinGap >= 20 && calorieRoom >= 100) {
    return {
      ...base,
      id: "protein-first",
      title: "Make your next meal protein-first",
      summary: `You are ${proteinGap}g short of today’s protein target with ${calorieRoom} calories still available. Close the gap before adding another lever.`,
      evidence: [
        { label: "Protein remaining", value: `${proteinGap}g` },
        { label: "Calories remaining", value: `${calorieRoom}` },
        { label: "Weekly protein", value: percent(trend.protein_adherence) }
      ],
      alternatives: [
        { label: "Lower tomorrow’s calories", reason: "Rejected because today still has room to execute the current plan." },
        { label: "Add extra training", reason: "Rejected because protein is the clearer recovery lever." }
      ],
      whatChanges: "Reaching the protein floor shifts the next decision back to recovery, steps, and the weekly trend.",
      action: { label: "Plan the next meal", to: "/nutrition" }
    };
  }

  if ((trend.step_adherence ?? 1) < 0.75 && stepGap >= 1000) {
    return {
      ...base,
      id: "walk-first",
      title: "Use a short walk as today’s lever",
      summary: `You are ${stepGap.toLocaleString()} steps short today. A short walk is a smaller, more recoverable move than cutting food.`,
      evidence: [
        { label: "Steps remaining", value: stepGap.toLocaleString() },
        { label: "Weekly step consistency", value: percent(trend.step_adherence) },
        { label: "Recovery", value: titleCase(trend.recovery_label) }
      ],
      alternatives: [
        { label: "Cut calories", reason: "Rejected while steps are the lower-friction lever." },
        { label: "Add hard cardio", reason: "Rejected because a walk adds less recovery cost." }
      ],
      whatChanges: "Consistent steps at or above 75% move the decision back to the weekly weight and waist trend.",
      action: { label: "Log steps when done", type: "log" }
    };
  }

  return {
    ...base,
    id: "hold-steady",
    title: "Hold targets steady today",
    summary: "Your signals do not justify another adjustment. Execute the current plan and let the weekly review make the next call.",
    evidence: [
      { label: "Signal", value: `${base.confidence.score}/100 · ${base.confidence.label}` },
      { label: "Weight trend", value: titleCase(trend.trend_label) },
      { label: "Recovery", value: titleCase(trend.recovery_label) }
    ],
    alternatives: [
      { label: "Change calories", reason: "Rejected because the current signal supports staying the course." },
      { label: "Add more work", reason: "Rejected because more is not automatically better." }
    ],
    whatChanges: "A confirmed weekly plateau, poor recovery, or a meaningful adherence change can alter the recommendation.",
    action: { label: "See weekly review", to: "/more" }
  };
}
