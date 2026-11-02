import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { ensureDefaults } from "../../shared/defaultHabitsProvisioning.js";
import { json, statusOf } from "../../shared/httpUtils.js";

const inFlightEnsures = new Map();

function enqueueByUser(userId, work) {
  const previous = inFlightEnsures.get(userId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  inFlightEnsures.set(userId, next);
  next.then(
    () => {
      if (inFlightEnsures.get(userId) === next) inFlightEnsures.delete(userId);
    },
    () => {
      if (inFlightEnsures.get(userId) === next) inFlightEnsures.delete(userId);
    }
  );
  return next;
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("ensureDefaultHabits auth check failed", error);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await enqueueByUser(user.id, () => ensureDefaults(base44, user));
    return json(result);
  } catch (error) {
    console.error("ensureDefaultHabits failed", { userId: user.id, error });
    return json({ error: "Default habits could not be prepared" }, { status: 500 });
  }
}
