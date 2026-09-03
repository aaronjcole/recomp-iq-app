// Lightweight route contract used by the global metadata layer. Keep the full
// article bodies in their lazy route chunks; tests cross-check these slug lists
// against the content datasets so a new page cannot silently miss indexing.

export const TIP_SLUGS = Object.freeze([
  "start-calorie-deficit-without-losing-muscle",
  "high-protein-breakfast-ideas-fat-loss",
  "how-many-steps-a-day-for-fat-loss",
  "beginner-strength-training-where-to-start",
  "track-progress-beyond-the-scale",
  "meal-prep-for-body-recomposition",
  "protein-per-day-for-muscle-gain",
  "tdee-vs-bmr-difference",
  "recomp-vs-bulk-vs-cut",
  "break-a-weight-loss-plateau",
  "water-intake-and-fat-loss",
  "sleep-muscle-growth-fat-loss",
  "best-cardio-for-fat-loss",
  "how-to-count-macros-beginners",
  "calorie-deficit-not-losing-weight",
  "refeed-day-vs-cheat-day"
]);

export const COMPARISON_SLUGS = Object.freeze([
  "recompone-vs-macrofactor",
  "recompone-vs-carbon",
  "recompone-vs-myfitnesspal",
  "recompone-vs-cronometer",
  "recompone-vs-fitbit",
  "recompone-vs-whoop",
  "recompone-vs-hevy",
  "recompone-vs-boostcamp",
  "recompone-vs-strong",
  "recompone-vs-fitbod",
  "recompone-vs-jefit",
  "recompone-vs-rp-strength-app",
  "recompone-vs-1st-phorm",
  "recompone-vs-future",
  "recompone-vs-caliber",
  "recompone-vs-tonal"
]);

export const LOCATION_SLUGS = Object.freeze([
  "austin-tx",
  "dallas-tx",
  "houston-tx",
  "denver-co",
  "phoenix-az",
  "los-angeles-ca",
  "chicago-il",
  "atlanta-ga",
  "seattle-wa",
  "portland-or",
  "san-francisco-ca",
  "san-diego-ca",
  "boston-ma",
  "new-york-ny",
  "philadelphia-pa",
  "washington-dc",
  "miami-fl",
  "nashville-tn",
  "minneapolis-mn",
  "charlotte-nc"
]);

const STATIC_CONTENT_METADATA = Object.freeze({
  "/tools/tdee-calculator": Object.freeze({
    title: "TDEE Calculator — Estimate Your Daily Calorie Burn | RecompOne",
    announcement: "TDEE calculator",
    description:
      "Free TDEE calculator using the Mifflin-St Jeor equation. Enter your age, sex, height, weight, and activity level to estimate your total daily energy expenditure and goal-based calorie target."
  }),
  "/tools/macro-calculator": Object.freeze({
    title: "Macro Calculator — Protein, Carbs & Fat Targets | RecompOne",
    announcement: "Macro calculator",
    description:
      "Free macro calculator. Enter your calorie target and body weight to get personalized protein, carbohydrate, and fat targets for fat loss, maintenance, or muscle gain."
  }),
  "/learn": Object.freeze({
    title: "Learn Body Recomposition, Nutrition & Training | RecompOne",
    announcement: "Learning hub",
    description:
      "Free guides and tools on body recomposition, TDEE, macros, and adaptive training. Learn how to read your progress data and make evidence-backed adjustments."
  }),
  "/learn/body-recomposition-guide": Object.freeze({
    title: "Body Recomposition: The Complete Guide | RecompOne",
    announcement: "Body recomposition guide",
    description:
      "A complete, evidence-based guide to body recomposition: what it is, who it works for, how to set calories and macros, how to train, and how to measure progress."
  }),
  "/tips": Object.freeze({
    title: "Health & Fitness Tips for Fat Loss and Recomposition | RecompOne",
    announcement: "Fitness tips",
    description:
      "Practical, evidence-based fitness tips on calorie deficits, high-protein meals, daily steps, beginner strength training, progress tracking, and meal prep."
  }),
  "/compare": Object.freeze({
    title: "RecompOne vs Other Fitness Apps: Neutral Comparisons | RecompOne",
    announcement: "App comparisons",
    description:
      "Side-by-side, neutral comparisons of RecompOne and popular fitness apps for macro tracking, training, and coaching — features, pricing, and who each is best for."
  }),
  "/locations": Object.freeze({
    title: "Body Recomposition Resources by City | RecompOne",
    announcement: "Location resources",
    description:
      "Find adaptive body recomposition, nutrition, and training guidance for your city. RecompOne helps residents across the U.S. turn fitness data into one clear next move."
  })
});

const TIP_PATHS = TIP_SLUGS.map((slug) => `/tips/${slug}`);
const COMPARISON_PATHS = COMPARISON_SLUGS.map((slug) => `/compare/${slug}`);
const LOCATION_PATHS = LOCATION_SLUGS.map((slug) => `/locations/${slug}`);

const TIP_PATH_SET = new Set(TIP_PATHS);
const COMPARISON_PATH_SET = new Set(COMPARISON_PATHS);
const LOCATION_PATH_SET = new Set(LOCATION_PATHS);

const DYNAMIC_METADATA = Object.freeze({
  tip: Object.freeze({
    title: "Fitness Tip | RecompOne",
    announcement: "Fitness tip",
    description: "Practical, evidence-based guidance for body recomposition, nutrition, and training."
  }),
  comparison: Object.freeze({
    title: "Fitness App Comparison | RecompOne",
    announcement: "App comparison",
    description: "A neutral feature comparison of RecompOne and another fitness app."
  }),
  location: Object.freeze({
    title: "Body Recomposition Resources by City | RecompOne",
    announcement: "Location guide",
    description: "Adaptive body recomposition, nutrition, and training guidance for your city."
  })
});

export const PUBLIC_CONTENT_PATHS = Object.freeze([
  "/tools/tdee-calculator",
  "/tools/macro-calculator",
  "/learn",
  "/learn/body-recomposition-guide",
  "/tips",
  ...TIP_PATHS,
  "/compare",
  ...COMPARISON_PATHS,
  "/locations",
  ...LOCATION_PATHS
]);

export const PUBLIC_CANONICAL_PATHS = Object.freeze([
  "/",
  ...PUBLIC_CONTENT_PATHS,
  "/privacy",
  "/terms",
  "/support",
  "/delete-account"
]);

export function getPublicContentMetadata(pathname) {
  if (STATIC_CONTENT_METADATA[pathname]) return STATIC_CONTENT_METADATA[pathname];
  if (TIP_PATH_SET.has(pathname)) return DYNAMIC_METADATA.tip;
  if (COMPARISON_PATH_SET.has(pathname)) return DYNAMIC_METADATA.comparison;
  if (LOCATION_PATH_SET.has(pathname)) return DYNAMIC_METADATA.location;
  return null;
}
