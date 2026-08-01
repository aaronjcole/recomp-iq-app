import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_BUCKETS = 10_000;
const rateBuckets = new Map();
const inFlightEmails = new Map();

function clientKey(req) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const current = rateBuckets.get(key);

  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    if (rateBuckets.size >= MAX_BUCKETS) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (now - bucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
      }
      if (rateBuckets.size >= MAX_BUCKETS) rateBuckets.delete(rateBuckets.keys().next().value);
    }
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

async function registerEmail(base44, email) {
  const existing = await base44.asServiceRole.entities.WaitlistEntry.filter({ email }, "-created_date", 1);
  if (!existing?.length) {
    await base44.asServiceRole.entities.WaitlistEntry.create({
      email,
      source: "coming_soon_page"
    });
  }
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return Response.json({ error: "Request is too large" }, { status: 413 });
  }
  if (isRateLimited(req)) {
    return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const emailOk =
    email.length > 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);
  try {
    let pending = inFlightEmails.get(email);
    if (!pending) {
      pending = registerEmail(base44, email).finally(() => inFlightEmails.delete(email));
      inFlightEmails.set(email, pending);
    }
    await pending;

    // Keep the response identical for new and existing addresses.
    return Response.json({ ok: true });
  } catch (error) {
    console.error("joinWaitlist failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
