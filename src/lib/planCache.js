// Locally cached premium plan output: the adaptive meal plan, its grocery ticks,
// and the Weekly Autopilot review. These are convenience caches so a generated
// plan survives a reload; the hosted account remains the source of truth.
//
// Keys are scoped per user id. An unscoped key let one account's generated plan
// hydrate for the next account signed in on the same device, which leaked one
// user's targets and adaptation summary into another user's screen.

const PLAN_CACHE_PREFIXES = [
  "recompiq_mealplan_v1",
  "recompiq_groceries_v1",
  "recompiq_autopilot_v1"
];

export const MEAL_PLAN_CACHE = "recompiq_mealplan_v1";
export const GROCERY_CACHE = "recompiq_groceries_v1";
export const AUTOPILOT_CACHE = "recompiq_autopilot_v1";

const scopedKey = (prefix, userId) => `${prefix}_${userId}`;

/** Every scoped key belonging to one user, for account-deletion cleanup. */
export function planCacheKeysForUser(userId) {
  return PLAN_CACHE_PREFIXES.map((prefix) => scopedKey(prefix, userId));
}

export function readPlanCache(prefix, userId, isValid) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(scopedKey(prefix, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    // Malformed or truncated storage must never break hydration.
    return null;
  }
}

export function writePlanCache(prefix, userId, value) {
  if (!userId) return;
  try {
    localStorage.setItem(scopedKey(prefix, userId), JSON.stringify(value));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function removePlanCache(prefix, userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(scopedKey(prefix, userId));
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * The first build of this cache wrote unscoped keys shared by every account on
 * the device. They cannot be attributed to a user, so drop them on sight rather
 * than migrating them into the wrong account.
 */
export function dropLegacyPlanCache() {
  try {
    for (const prefix of PLAN_CACHE_PREFIXES) localStorage.removeItem(prefix);
  } catch {
    /* ignore quota / privacy mode */
  }
}
