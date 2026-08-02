// Single entry point for the RecompOne fitness engine. Import from here in the
// UI and (later) backend functions so the surface stays stable.

export * from "./calculators";
export * from "./adherence";
export * from "./trends";
export * from "./projections";
export * from "./adjustments";
export * from "./adaptiveGoalEngine";
export * from "./gamification";
export * from "./nutritionScoring";
export * from "./mealPlanning";
export * from "./trainingAnalysis";
export * from "./strengthTrend";
export * from "./recalculate";
export * from "./bestMove";
export { GOAL_LABELS, JOB_ACTIVITY_LABELS, GOALS, JOB_ACTIVITIES, SEXES, EXPERIENCE_LEVELS, COACH_TONES, ADJUSTMENT_DECISIONS } from "./constants";
