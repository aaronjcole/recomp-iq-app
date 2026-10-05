export const PREMIUM_FEATURES = Object.freeze({
  MEAL_PLANNING: "meal_planning",
  TRAINING_PLANNING: "training_planning",
  WEEKLY_AUTOPILOT: "weekly_autopilot",
  VISUAL_PROGRESS: "visual_progress",
  AI_LIFESTYLE_COACH: "ai_lifestyle_coach",
  // Food-photo estimates run a credit-consuming vision model per request.
  // Bundle-only by design: there is no standalone product for it, so an
  // add-on entitlement never unlocks it.
  FOOD_PHOTO: "food_photo"
});

export const PREMIUM_PRODUCTS = Object.freeze({
  BUNDLE: "recompone_premium",
  MEAL_PLANNING: "adaptive_meal_plans",
  TRAINING_PLANNING: "adaptive_training_blocks",
  WEEKLY_AUTOPILOT: "weekly_autopilot",
  VISUAL_PROGRESS: "visual_progress_checks",
  AI_LIFESTYLE_COACH: "ai_lifestyle_coach_premium"
});

// Apple App Store StoreKit product IDs. Both map to the same all-in-one
// recompone_premium entitlement — there is only one premium tier.
export const APPLE_STORE_PRODUCTS = Object.freeze({
  MONTHLY: "recompone_premium_monthly",
  ANNUAL: "recompone_premium_annual"
});

const APPLE_PRODUCT_TO_ENTITLEMENT = Object.freeze({
  [APPLE_STORE_PRODUCTS.MONTHLY]: PREMIUM_PRODUCTS.BUNDLE,
  [APPLE_STORE_PRODUCTS.ANNUAL]: PREMIUM_PRODUCTS.BUNDLE
});

export function isAppleStoreProduct(appleProductId) {
  return Boolean(APPLE_PRODUCT_TO_ENTITLEMENT[appleProductId]);
}

export function mapAppleProductId(appleProductId) {
  return APPLE_PRODUCT_TO_ENTITLEMENT[appleProductId] ?? null;
}

const BUNDLE_FEATURES = Object.freeze([
  "meal_planning",
  "training_planning",
  "weekly_autopilot",
  "visual_progress",
  "ai_lifestyle_coach",
  "food_photo"
]);
const ALL_FEATURES = Object.freeze(Object.values(PREMIUM_FEATURES));
const PRODUCT_FEATURES = Object.freeze({
  [PREMIUM_PRODUCTS.BUNDLE]: BUNDLE_FEATURES,
  [PREMIUM_PRODUCTS.MEAL_PLANNING]: Object.freeze([PREMIUM_FEATURES.MEAL_PLANNING]),
  [PREMIUM_PRODUCTS.TRAINING_PLANNING]: Object.freeze([PREMIUM_FEATURES.TRAINING_PLANNING]),
  [PREMIUM_PRODUCTS.WEEKLY_AUTOPILOT]: Object.freeze([PREMIUM_FEATURES.WEEKLY_AUTOPILOT]),
  [PREMIUM_PRODUCTS.VISUAL_PROGRESS]: Object.freeze([PREMIUM_FEATURES.VISUAL_PROGRESS]),
  [PREMIUM_PRODUCTS.AI_LIFESTYLE_COACH]: Object.freeze([PREMIUM_FEATURES.AI_LIFESTYLE_COACH])
});

const lockedFeatures = Object.freeze(
  Object.fromEntries(ALL_FEATURES.map((feature) => [feature, false]))
);
const disabledReleaseFlags = Object.freeze({ bodyCompositionScan: false });

export const EMPTY_PREMIUM_ACCESS = Object.freeze({
  hasAnyAccess: false,
  hasBundleAccess: false,
  testerAccess: false,
  features: lockedFeatures,
  releaseFlags: disabledReleaseFlags,
  products: Object.freeze([]),
  sources: Object.freeze([])
});

const VALID_SOURCES = new Set(["tester", "google_play", "apple_store", "admin"]);

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
    releaseFlags: disabledReleaseFlags,
    products: Object.freeze(products),
    sources: Object.freeze(sources)
  });
}

// Apple purchase environments that are not real money: sandbox (TestFlight,
// sandbox Apple IDs, App Review) and local StoreKit testing.
const NON_PRODUCTION_APPLE_ENVIRONMENTS = new Set(["sandbox", "xcode", "localtesting"]);

export function parseIdAllowlist(raw) {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/**
 * Whether a verified Apple transaction may grant Premium to this account.
 *
 * Production purchases always may. A sandbox purchase is free, so once
 * APPLE_SANDBOX_ALLOWED_USER_IDS is configured only the Base44 accounts it
 * lists (testers, and the demo account given to App Review, which purchases
 * in the sandbox even against the live app) get Premium from one. While the
 * secret is unset sandbox purchases are accepted, as before, so deploying
 * this cannot lock App Review out; `unconfigured` lets the caller log that.
 *
 * Keyed by user id rather than email: verifyApplePurchase deliberately never
 * handles email addresses (tests/security/apple-premium.test.js).
 *
 * @param {{ environment?: string | null, userId?: string | null, allowlistRaw?: string | null }} input
 * @returns {{ allowed: boolean, sandbox: boolean, unconfigured: boolean }}
 */
export function appleEnvironmentDecision({ environment, userId, allowlistRaw }) {
  const env = String(environment ?? "").trim().toLowerCase();
  // Apple always reports an environment; a missing one is treated as sandbox.
  const sandbox = env === "" || NON_PRODUCTION_APPLE_ENVIRONMENTS.has(env);
  if (!sandbox) return { allowed: true, sandbox: false, unconfigured: false };
  const allowlist = parseIdAllowlist(allowlistRaw);
  if (allowlist.size === 0) return { allowed: true, sandbox: true, unconfigured: true };
  const id = String(userId ?? "").trim();
  return { allowed: id !== "" && allowlist.has(id), sandbox: true, unconfigured: false };
}
