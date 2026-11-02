import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { json, statusOf } from "../../shared/httpUtils.js";
import { runAccountDeletionCascade } from "../../shared/accountDeletionDomain.js";

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if (statusOf(error) === 401 || statusOf(error) === 403) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("deleteAccount auth check failed", error);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }

  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirmation !== "DELETE") {
    return json({ error: "Deletion confirmation is required" }, { status: 400 });
  }

  // Delete custom data first. The core account remains available if a partial
  // failure needs to be retried; every operation is idempotent. Every cascade
  // filter is bound to the authenticated user (see accountDeletionDomain.js).
  let cascade;
  try {
    cascade = await runAccountDeletionCascade(base44.asServiceRole.entities, user);
  } catch (error) {
    console.error("deleteAccount cascade failed", { userId: user.id, error });
    return json({ error: "Account deletion could not be completed" }, { status: 500 });
  }

  if (!cascade.ok) {
    console.error("deleteAccount cascade incomplete", {
      userId: user.id,
      deleted: cascade.deleted,
      failures: cascade.failures.map(({ step, error }) => ({ step, message: error?.message }))
    });
    return json(
      { error: "Account deletion could not be completed. Please try again." },
      { status: 500 }
    );
  }

  try {
    await base44.asServiceRole.entities.User.delete(user.id);
  } catch (error) {
    console.error("deleteAccount user removal failed", { userId: user.id, error });
    return json({ error: "Account deletion could not be completed" }, { status: 500 });
  }

  return json({ ok: true, deleted: cascade.deleted });
}
