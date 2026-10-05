// Declarative account-deletion cascade. The deleteAccount backend function
// iterates this list with the service-role client, so every filter here MUST
// be bound to the authenticated user's own id or email and never be empty.
//
// Owner keys follow how each entity's rows are actually written:
// - created_by_id: rows created through a user-scoped client (frontend SDK or
//   `base44.entities` inside a backend function); Base44 stamps the creator.
// - owner_id: server-owned rows created with asServiceRole, where the backend
//   function sets owner_id to the authenticated user's id explicitly.
// - Referral: written by recordReferralSignup with both referrer_id and
//   referee_id, so the user's rows must be removed under either role.
// - WaitlistEntry: captured before signup, keyed only by normalized email.
//
// Every entity in base44/entities/ must appear either here or in
// NON_USER_DATA_ENTITIES; tests/security/account-deletion.test.js enforces it.

const byCreator = (user) => ({ created_by_id: user.id });
const byOwner = (user) => ({ owner_id: user.id });

export function normalizeDeletionEmail(email) {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export const ACCOUNT_DELETION_CASCADE = Object.freeze([
  // Child records before their parents (HabitEntry references Habit).
  { entity: "HabitEntry", filter: byCreator },
  { entity: "Habit", filter: byCreator },
  { entity: "DecisionLedger", filter: byCreator },
  { entity: "WeeklyCheckIn", filter: byCreator },
  { entity: "StrengthLog", filter: byCreator },
  { entity: "ExerciseSession", filter: byCreator },
  { entity: "TrainingBlock", filter: byCreator },
  { entity: "DailyLog", filter: byCreator },
  { entity: "FoodLogEntry", filter: byCreator },
  { entity: "MealTemplate", filter: byCreator },
  { entity: "Recipe", filter: byCreator },
  { entity: "FoodItem", filter: byCreator },
  { entity: "CoachConversation", filter: byCreator },
  { entity: "LifestyleProfile", filter: byCreator },
  { entity: "CurrentStrategy", filter: byCreator },
  { entity: "UserPreferences", filter: byCreator },
  { entity: "UserProfile", filter: byCreator },

  { entity: "AiContentReport", filter: byOwner },
  { entity: "AnalysisUpload", filter: byOwner },
  { entity: "CoachRequestUsage", filter: byOwner },
  { entity: "PremiumEntitlement", filter: byOwner },
  { entity: "PushDevice", filter: byOwner },
  { entity: "ReferralCode", filter: byOwner },
  { entity: "Referral", filter: (user) => ({ referrer_id: user.id }) },
  { entity: "Referral", filter: (user) => ({ referee_id: user.id }) },

  {
    entity: "WaitlistEntry",
    // Skipped (null) when the account has no email; an empty filter would
    // match every waitlist row.
    filter: (user) => {
      const email = normalizeDeletionEmail(user.email);
      return email ? { email } : null;
    }
  }
]);

// Entities that intentionally hold no per-user data and are therefore not
// part of the cascade. Each entry needs a reason. Currently every entity is
// user data, so this is empty; adding a new entity without deciding where it
// belongs fails the account-deletion test.
export const NON_USER_DATA_ENTITIES = Object.freeze({});

function hasBoundValue(filter) {
  return Object.values(filter).some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
}

// Resolves the cascade for one authenticated user into concrete delete steps.
// Throws if a filter would be empty or unbound, so a bug can never turn into a
// table-wide service-role delete.
export function accountDeletionPlan(user) {
  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    throw new Error("An authenticated user id is required");
  }
  const steps = [];
  for (const { entity, filter } of ACCOUNT_DELETION_CASCADE) {
    const query = filter(user);
    if (query === null) continue;
    if (!query || typeof query !== "object" || !hasBoundValue(query)) {
      throw new Error(`Unbound deletion filter for ${entity}`);
    }
    steps.push({ entity, query });
  }
  return steps;
}

function stepKey(step) {
  return `${step.entity}:${Object.keys(step.query).join(",")}`;
}

// Runs every cascade step against `entities` (the service-role entities
// accessor). All steps are attempted even after a failure so a retry has less
// left to do; every step is idempotent. The caller must only delete the core
// account record when `ok` is true.
export async function runAccountDeletionCascade(entities, user) {
  const steps = accountDeletionPlan(user);
  const deleted = {};
  const failures = [];
  for (const step of steps) {
    const key = stepKey(step);
    try {
      const result = await entities[step.entity].deleteMany(step.query);
      if (result && result.success === false) {
        throw new Error("deleteMany reported success: false");
      }
      const count = Number(result?.deleted);
      deleted[key] = Number.isFinite(count) ? count : 0;
    } catch (error) {
      failures.push({ step: key, error });
    }
  }
  return { ok: failures.length === 0, deleted, failures };
}
