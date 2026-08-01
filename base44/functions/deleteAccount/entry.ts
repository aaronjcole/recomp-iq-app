import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const OWNED_ENTITIES = [
  "HabitEntry",
  "Habit",
  "DecisionLedger",
  "WeeklyCheckIn",
  "StrengthLog",
  "ExerciseSession",
  "DailyLog",
  "MealTemplate",
  "Recipe",
  "FoodItem",
  "CurrentStrategy",
  "UserPreferences",
  "UserProfile"
];

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if (statusOf(error) === 401 || statusOf(error) === 403) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("deleteAccount auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }

  if (!user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirmation !== "DELETE") {
    return Response.json({ error: "Deletion confirmation is required" }, { status: 400 });
  }

  try {
    // Delete custom data first. The core account remains available if a partial
    // failure needs to be retried; every operation is idempotent.
    for (const entityName of OWNED_ENTITIES) {
      await base44.asServiceRole.entities[entityName].deleteMany({ created_by_id: user.id });
    }

    await base44.asServiceRole.entities.AiContentReport.deleteMany({ owner_id: user.id });

    if (user.email) {
      await base44.asServiceRole.entities.WaitlistEntry.deleteMany({
        email: String(user.email).trim().toLowerCase()
      });
    }

    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("deleteAccount cascade failed", { userId: user.id, error });
    return Response.json({ error: "Account deletion could not be completed" }, { status: 500 });
  }
}
