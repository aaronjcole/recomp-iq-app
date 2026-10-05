// Per-user onboarding draft persistence. Pure (storage is passed in) so the
// key scoping and field allowlist are unit-testable in Node.
//
// The draft holds health answers (age, weights, safety flags such as
// eating-disorder history or pregnancy), so it is:
// - keyed by the signed-in user's id, never shared across accounts on a device;
// - limited to an explicit allowlist of form fields, so server-record metadata
//   (id, created_by email, created_by_id) spread into form state never lands
//   in localStorage;
// - removed on finish, on every logout path, and on account deletion.

/** Pre-scoping key. Any value under it belongs to an unknown account. */
export const LEGACY_ONBOARDING_DRAFT_KEY = "recompiq_onboarding_v1";
export const ONBOARDING_DRAFT_PREFIX = "recompiq_onboarding_v2:";

const MAX_STRING_LENGTH = 120;
const MAX_LIST_ITEMS = 32;
const MAX_STEP = 10;

/** Profile form fields; values are kept as the strings the inputs edit. */
export const PROFILE_DRAFT_FIELDS = Object.freeze([
  "goal",
  "age",
  "sex",
  "height_in",
  "current_weight_lbs",
  "goal_weight_lbs",
  "waist_in",
  "job_activity",
  "average_steps",
  "training_days_per_week",
  "cardio_days_per_week",
  "experience_level",
  "primary_concern"
]);

export const PREFERENCE_DRAFT_STRING_FIELDS = Object.freeze([
  "tone",
  "diet_style",
  "preferred_training"
]);

export const PREFERENCE_DRAFT_LIST_FIELDS = Object.freeze([
  "disliked_strategies",
  "known_barriers",
  "safety_flags"
]);

const UNITS = new Set(["imperial", "metric"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function draftString(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  return value.length <= MAX_STRING_LENGTH ? value : undefined;
}

function draftList(value) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item) => typeof item === "string" && item.length > 0 && item.length <= MAX_STRING_LENGTH)
    .slice(0, MAX_LIST_ITEMS);
}

/** Keep only allowlisted profile form fields (numbers become input strings). */
export function pickProfileDraftFields(value) {
  if (!isPlainObject(value)) return {};
  const picked = {};
  for (const field of PROFILE_DRAFT_FIELDS) {
    const kept = draftString(value[field]);
    if (kept !== undefined) picked[field] = kept;
  }
  return picked;
}

/** Keep only allowlisted preference form fields. */
export function pickPreferenceDraftFields(value) {
  if (!isPlainObject(value)) return {};
  const picked = {};
  for (const field of PREFERENCE_DRAFT_STRING_FIELDS) {
    const kept = draftString(value[field]);
    if (kept !== undefined) picked[field] = kept;
  }
  for (const field of PREFERENCE_DRAFT_LIST_FIELDS) {
    const kept = draftList(value[field]);
    if (kept !== undefined) picked[field] = kept;
  }
  return picked;
}

/** Reduce any stored or in-memory draft to the allowlisted shape, or null. */
export function sanitizeOnboardingDraft(value) {
  if (!isPlainObject(value)) return null;
  const draft = {
    p: pickProfileDraftFields(value.p),
    pref: pickPreferenceDraftFields(value.pref)
  };
  if (UNITS.has(value.units)) draft.units = value.units;
  if (Number.isInteger(value.step) && value.step >= 0 && value.step <= MAX_STEP) {
    draft.step = value.step;
  }
  return draft;
}

/** The storage key for one account's draft, or null when no id is known. */
export function onboardingDraftKey(userId) {
  if (typeof userId !== "string" || userId.trim() === "") return null;
  return `${ONBOARDING_DRAFT_PREFIX}${userId}`;
}

function removeKey(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Load the signed-in user's draft. Always discards the legacy unscoped key,
 * whose owner cannot be known, and drops a malformed scoped value.
 */
export function loadOnboardingDraft(storage, userId) {
  removeKey(storage, LEGACY_ONBOARDING_DRAFT_KEY);
  const key = onboardingDraftKey(userId);
  if (!key || !storage) return null;
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const draft = sanitizeOnboardingDraft(parsed);
  if (!draft) removeKey(storage, key);
  return draft;
}

/** Persist the allowlisted draft under the user's key. No-op without an id. */
export function saveOnboardingDraft(storage, userId, draft) {
  const key = onboardingDraftKey(userId);
  const sanitized = sanitizeOnboardingDraft(draft);
  if (!key || !storage || !sanitized) return false;
  try {
    storage.setItem(key, JSON.stringify(sanitized));
    return true;
  } catch {
    return false; // quota / privacy mode
  }
}

/** Remove one user's draft and the legacy key. */
export function clearOnboardingDraft(storage, userId) {
  removeKey(storage, LEGACY_ONBOARDING_DRAFT_KEY);
  const key = onboardingDraftKey(userId);
  if (key) removeKey(storage, key);
}

/**
 * Remove every onboarding draft on this device (all accounts plus the legacy
 * key). Used on logout, where the next person to sign in may be someone else.
 */
export function clearAllOnboardingDrafts(storage) {
  removeKey(storage, LEGACY_ONBOARDING_DRAFT_KEY);
  if (!storage) return;
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === "string" && key.startsWith(ONBOARDING_DRAFT_PREFIX)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) removeKey(storage, key);
}
