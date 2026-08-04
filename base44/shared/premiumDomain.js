export const PREMIUM_FEATURES = Object.freeze({
  MEAL_PLANNING: "meal_planning",
  TRAINING_PLANNING: "training_planning",
  WEEKLY_AUTOPILOT: "weekly_autopilot",
  VISUAL_PROGRESS: "visual_progress"
});

export const PREMIUM_PRODUCTS = Object.freeze({
  BUNDLE: "recompone_premium",
  MEAL_PLANNING: "adaptive_meal_plans",
  TRAINING_PLANNING: "adaptive_training_blocks",
  WEEKLY_AUTOPILOT: "weekly_autopilot",
  VISUAL_PROGRESS: "visual_progress_checks"
});

const ALL_FEATURES = Object.freeze(Object.values(PREMIUM_FEATURES));
const PRODUCT_FEATURES = Object.freeze({
  [PREMIUM_PRODUCTS.BUNDLE]: ALL_FEATURES,
  [PREMIUM_PRODUCTS.MEAL_PLANNING]: Object.freeze([PREMIUM_FEATURES.MEAL_PLANNING]),
  [PREMIUM_PRODUCTS.TRAINING_PLANNING]: Object.freeze([PREMIUM_FEATURES.TRAINING_PLANNING]),
  [PREMIUM_PRODUCTS.WEEKLY_AUTOPILOT]: Object.freeze([PREMIUM_FEATURES.WEEKLY_AUTOPILOT]),
  [PREMIUM_PRODUCTS.VISUAL_PROGRESS]: Object.freeze([PREMIUM_FEATURES.VISUAL_PROGRESS])
});

const lockedFeatures = Object.freeze(
  Object.fromEntries(ALL_FEATURES.map((feature) => [feature, false]))
);

export const EMPTY_PREMIUM_ACCESS = Object.freeze({
  hasAnyAccess: false,
  hasBundleAccess: false,
  testerAccess: false,
  features: lockedFeatures,
  products: Object.freeze([]),
  sources: Object.freeze([])
});

const VALID_SOURCES = new Set(["tester", "google_play", "admin"]);

function isActiveEntitlement(record, nowMs) {
  if (!record || record.status !== "active") return false;
  if (!PRODUCT_FEATURES[record.product_id] || !VALID_SOURCES.has(record.source)) return false;
  if (!record.expires_at) return true;

  const expiresAt = Date.parse(record.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export function resolvePremiumAccess(records, now = Date.now()) {
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) return EMPTY_PREMIUM_ACCESS;

  const active = Array.isArray(records)
    ? records.filter((record) => isActiveEntitlement(record, nowMs))
    : [];
  if (active.length === 0) return EMPTY_PREMIUM_ACCESS;

  const products = [...new Set(active.map((record) => record.product_id))].sort();
  const sources = [...new Set(active.map((record) => record.source))].sort();
  const unlocked = new Set(products.flatMap((product) => PRODUCT_FEATURES[product]));

  return Object.freeze({
    hasAnyAccess: unlocked.size > 0,
    hasBundleAccess: products.includes(PREMIUM_PRODUCTS.BUNDLE),
    testerAccess: sources.includes("tester"),
    features: Object.freeze(
      Object.fromEntries(ALL_FEATURES.map((feature) => [feature, unlocked.has(feature)]))
    ),
    products: Object.freeze(products),
    sources: Object.freeze(sources)
  });
}
