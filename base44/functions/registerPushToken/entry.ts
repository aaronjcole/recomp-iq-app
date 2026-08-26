import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Registers or refreshes a push notification device token for the signed-in user.
// Called by the mobile app after obtaining an APNs/FCM token.

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("registerPushToken auth check failed", error?.message);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = typeof body?.platform === "string" ? body.platform.trim() : "ios";
  if (!token) return json({ error: "token is required" }, { status: 400 });
  if (token.length > 512) return json({ error: "token is too long" }, { status: 400 });
  if (platform !== "ios" && platform !== "android") {
    return json({ error: "platform must be ios or android" }, { status: 400 });
  }

  try {
    const existing = await base44.asServiceRole.entities.PushDevice.filter(
      { owner_id: user.id, token },
      "-created_date",
      1
    );
    const now = new Date().toISOString();

    if (existing?.length) {
      await base44.asServiceRole.entities.PushDevice.update(existing[0].id, {
        active: true,
        platform,
        last_registered: now
      });
    } else {
      await base44.asServiceRole.entities.PushDevice.create({
        owner_id: user.id,
        token,
        platform,
        active: true,
        last_registered: now
      });
    }

    return json({ ok: true });
  } catch (error) {
    console.error("registerPushToken failed", error?.message);
    return json({ error: "Could not register push token" }, { status: 500 });
  }
}