import { COACH_TONES, EXPERIENCE_LEVELS, GOALS, JOB_ACTIVITIES, SEXES } from "./fitness/constants.js";
import { recalculatedStrategyUpdate } from "./fitness/recalculate.js";
import { inBiometricRange, optionalInBiometricRange } from "./biometricRanges.js";
import { isOwnedBy } from "../../base44/shared/ownerScope.js";

const PROFILE_FIELDS = ["age", "sex", "height_in", "current_weight_lbs", "goal_weight_lbs", "goal", "training_days_per_week", "cardio_days_per_week", "job_activity", "average_steps", "experience_level", "primary_concern"];
const PREFERENCE_FIELDS = ["tone", "diet_style", "preferred_training", "disliked_strategies", "known_barriers", "safety_flags"];
export const PLAN_TARGET_FIELDS = ["calorie_target", "protein_target_g", "carb_target_g", "fat_target_g", "step_target", "lifting_days_target", "cardio_days_target", "goal_type", "manual_override", "behavior_focus", "weekly_adjustment_rule"];

const PRIMARY_CONCERNS = {
  fat_loss: "fat_loss", aggressive_fat_loss: "fat_loss", strength_retention_cut: "fat_loss",
  fat_loss_biased_recomp: "body_recomp", body_recomposition: "body_recomp", maintenance: "maintenance",
  lean_bulk: "muscle_gain", muscle_gain: "muscle_gain", aggressive_gain: "muscle_gain"
};

export class PlanSettingsError extends Error {
  constructor(message, { conflict = false, reconciliationRequired = false } = {}) {
    super(message);
    this.name = "PlanSettingsError";
    this.conflict = conflict;
    this.reconciliationRequired = reconciliationRequired;
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pick(value, fields) {
  return Object.fromEntries(fields.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]));
}

export function snapshotPlanTargets(strategy) {
  return pick(strategy, PLAN_TARGET_FIELDS);
}

// A draft revision contains no account metadata or extra health answers.
// Conditional server writes remain the authoritative concurrency check.
export function planSettingsRevision(profile, preferences, strategy) {
  const value = JSON.stringify([pick(profile, PROFILE_FIELDS), pick(preferences, PREFERENCE_FIELDS), snapshotPlanTargets(strategy)]);
  let first = 2166136261, second = 5381;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619) >>> 0;
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `v1:${first.toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function allowlistedPatch(patch, fields) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((key) => !fields.includes(key))) {
    throw new PlanSettingsError("These settings could not be validated. Reload and try again.");
  }
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function validateProfile(profile) {
  for (const key of ["age", "height_in", "current_weight_lbs", "average_steps", "training_days_per_week", "cardio_days_per_week"]) {
    if (!inBiometricRange(key, profile[key])) throw new PlanSettingsError("Complete the highlighted profile fields before saving your plan.");
  }
  if (!optionalInBiometricRange("goal_weight_lbs", profile.goal_weight_lbs) || !GOALS.includes(profile.goal) || !SEXES.includes(profile.sex) || !JOB_ACTIVITIES.includes(profile.job_activity) || !EXPERIENCE_LEVELS.includes(profile.experience_level)) {
    throw new PlanSettingsError("Review your profile answers using Redo onboarding before saving your plan.");
  }
}

function validatePreferences(patch) {
  if (patch.tone !== undefined && !COACH_TONES.includes(patch.tone)) throw new PlanSettingsError("Choose a valid coach tone.");
  for (const key of ["diet_style", "preferred_training"]) {
    if (patch[key] !== undefined && (typeof patch[key] !== "string" || patch[key].length > 120)) throw new PlanSettingsError("Review your preferences before saving.");
  }
  for (const key of ["disliked_strategies", "known_barriers", "safety_flags"]) {
    if (patch[key] !== undefined && (!Array.isArray(patch[key]) || patch[key].length > 32 || patch[key].some((value) => typeof value !== "string" || value.length > 120))) throw new PlanSettingsError("Review your preferences before saving.");
  }
}

// Compare field values as well as updated_date: two changes can share a timestamp.
// Missing fields use $exists, and optional goal weight is cleared with $unset.
function guardedQuery(ownerId, record, fields) {
  const query = { id: record.id, created_by_id: ownerId };
  if (record.updated_date) query.updated_date = record.updated_date;
  for (const key of fields) query[key] = record[key] === undefined ? { $exists: false } : record[key];
  return query;
}

function operations(patch) {
  const set = {}, unset = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) unset[key] = "";
    else set[key] = value;
  }
  return { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
}

function applyPatch(record, patch) {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete next[key];
    else next[key] = value;
  }
  return next;
}

function conflict() {
  return new PlanSettingsError("Your settings changed in another window. Review the latest values and try again.", { conflict: true });
}

/**
 * Coordinated existing-account save. Conditional writes reject concurrent edits;
 * reverse compensation only restores rows still carrying this save's values.
 * This is not a database transaction: an unavailable recovery is reported rather
 * than presenting a partial save as successful. No account, entitlement or log
 * entity is accessed here.
 */
export async function persistPlanSettings(entities, ownerId, expected, profileChanges, preferenceChanges, { keepCustomTargets = true, resetPlan = false, assertActive = () => {} } = {}) {
  const profilePatch = allowlistedPatch(profileChanges, PROFILE_FIELDS);
  const preferencePatch = preferenceChanges === undefined ? {} : allowlistedPatch(preferenceChanges, PREFERENCE_FIELDS);
  const records = await Promise.all([entities.UserProfile.get(expected.profile.id), entities.UserPreferences.get(expected.preferences.id), entities.CurrentStrategy.get(expected.strategy.id)]);
  assertActive();
  if (records.some((record) => !isOwnedBy(record, ownerId))) throw new PlanSettingsError("Could not verify the owner of these settings.");
  const [profile, preferences, strategy] = records;
  for (const [old, current, patch] of [[expected.profile, profile, profilePatch], [expected.preferences, preferences, preferencePatch]]) {
    if (Object.keys(patch).some((key) => !equal(old[key], current[key]) && !equal(patch[key], current[key]))) throw conflict();
  }
  if (!keepCustomTargets && PLAN_TARGET_FIELDS.some((key) => !equal(expected.strategy[key], strategy[key]))) throw conflict();
  if (profilePatch.goal) profilePatch.primary_concern = PRIMARY_CONCERNS[profilePatch.goal];
  const nextProfile = applyPatch(profile, profilePatch);
  const nextPreferences = { ...preferences, ...preferencePatch };
  validateProfile(nextProfile);
  validatePreferences(preferencePatch);
  const manual = keepCustomTargets && Boolean(strategy.manual_override);
  const strategyPatch = {
    ...recalculatedStrategyUpdate(nextProfile, nextPreferences, { goal: nextProfile.goal, manualOverride: manual }),
    manual_override: manual
  };
  if (!resetPlan) {
    for (const key of ["behavior_focus", "weekly_adjustment_rule"]) if (strategy[key] !== undefined) strategyPatch[key] = strategy[key];
  }
  const stages = [
    { name: "UserProfile", before: profile, patch: profilePatch, fields: PROFILE_FIELDS },
    { name: "UserPreferences", before: preferences, patch: preferencePatch, fields: PREFERENCE_FIELDS },
    { name: "CurrentStrategy", before: strategy, patch: strategyPatch, fields: PLAN_TARGET_FIELDS }
  ];
  const attempted = [];
  const saved = { UserProfile: profile, UserPreferences: preferences, CurrentStrategy: strategy };
  try {
    for (const stage of stages) {
      if (!Object.keys(stage.patch).some((key) => !equal(stage.before[key], stage.patch[key] === null ? undefined : stage.patch[key]))) continue;
      assertActive();
      stage.after = applyPatch(stage.before, stage.patch);
      attempted.push(stage);
      const result = await entities[stage.name].updateMany(guardedQuery(ownerId, stage.before, stage.fields), operations(stage.patch));
      if (!result?.success || result.updated !== 1) {
        attempted.pop(); // This conditional write did not modify the row.
        throw conflict();
      }
      assertActive();
      const current = await entities[stage.name].get(stage.before.id);
      assertActive();
      if (!isOwnedBy(current, ownerId) || stage.fields.some((key) => !equal(current[key], stage.after[key]))) throw conflict();
      saved[stage.name] = current;
    }
  } catch (error) {
    let recoveryFailed = false;
    for (const stage of attempted.reverse()) {
      try {
        assertActive();
        const current = await entities[stage.name].get(stage.before.id);
        assertActive();
        if (!isOwnedBy(current, ownerId)) throw new Error("Settings owner changed");
        if (stage.fields.every((key) => equal(current[key], stage.before[key]))) continue;
        if (stage.fields.some((key) => !equal(current[key], stage.after[key]))) {
          recoveryFailed = true;
          continue;
        }
        const restore = Object.fromEntries(Object.keys(stage.patch).map((key) => [key, stage.before[key]]));
        // Don't use the original timestamp after our own write; matching the
        // complete expected field snapshot prevents overwriting newer choices.
        const query = guardedQuery(ownerId, current, stage.fields);
        const result = await entities[stage.name].updateMany(query, operations(restore));
        if (!result?.success || result.updated !== 1) recoveryFailed = true;
      } catch {
        recoveryFailed = true;
      }
    }
    throw new PlanSettingsError(recoveryFailed
      ? "The save was interrupted and some settings may have changed. Refresh your data, review your answers, and try again."
      : error instanceof PlanSettingsError ? error.message : "Your plan could not be saved. Your previous settings were restored; try again.",
    { conflict: error.conflict === true, reconciliationRequired: recoveryFailed });
  }
  return { profile: saved.UserProfile, preferences: saved.UserPreferences, strategy: saved.CurrentStrategy, previousStrategy: strategy };
}
