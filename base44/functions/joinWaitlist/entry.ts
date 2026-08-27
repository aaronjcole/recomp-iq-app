import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { waitUntil } from 'base44:runtime';

const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_BUCKETS = 10_000;
const rateBuckets = new Map();
const inFlightEmails = new Map();
const ATTRIBUTION_FIELDS = new Set([
  "hero_variant",
  "campaign_source",
  "campaign_medium",
  "campaign_name",
  "campaign_content"
]);

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

function sanitizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const sanitized = {
    explainer_viewed: value.explainer_viewed === true
  };
  for (const field of ATTRIBUTION_FIELDS) {
    if (typeof value[field] !== "string") continue;
    const fieldValue = value[field]
      .trim()
      .slice(0, 80)
      .replace(/[^a-zA-Z0-9 _.-]/g, "")
      .replace(/\s+/g, " ");
    if (fieldValue) sanitized[field] = fieldValue;
  }
  return sanitized;
}

async function registerEmail(base44, email, attribution) {
  const existing = await base44.asServiceRole.entities.WaitlistEntry.filter({ email }, "-created_date", 1);
  if (!existing?.length) {
    await base44.asServiceRole.entities.WaitlistEntry.create({
      email,
      source: "coming_soon_page",
      ...attribution
    });
    return true;
  }
  return false;
}

const WELCOME_SUBJECT = "Welcome to RecompOne — you're on the list";
// ASCII-only body so the raw RFC 2822 message needs no transfer encoding.
const WELCOME_BODY = [
  "Thanks for joining the RecompOne early-access list!",
  "",
  "You're now signed up for web early access plus launch and feature",
  "announcements. We'll reach out the moment your access opens up.",
  "",
  "A few things to know:",
  "- RecompOne turns your nutrition, training, recovery, and body-trend",
  "  data into one evidence-backed next move.",
  "- The web version is open for early access now.",
  "- Native Android and iOS apps are coming soon.",
  "",
  "Talk soon,",
  "The RecompOne Team",
  "https://recomp-iq.base44.app"
].join("\r\n");

function base64urlEncode(text) {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendWelcomeEmail(base44, toEmail) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: authHeader
    });
    if (!profileRes.ok) {
      console.warn("welcomeEmail: could not load Gmail profile", await profileRes.text());
      return;
    }
    const fromAddress = (await profileRes.json()).emailAddress;

    const rawMessage = [
      `From: RecompOne <${fromAddress}>`,
      `To: <${toEmail}>`,
      `Subject: ${WELCOME_SUBJECT}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=us-ascii",
      "Content-Transfer-Encoding: 7bit",
      "",
      WELCOME_BODY
    ].join("\r\n");

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64urlEncode(rawMessage) })
    });
    if (!sendRes.ok) {
      console.warn("welcomeEmail: Gmail send failed", await sendRes.text());
    }
  } catch (error) {
    console.warn("welcomeEmail: error", error?.message || error);
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
    const attribution = sanitizeAttribution(body?.attribution);
    let pending = inFlightEmails.get(email);
    if (!pending) {
      pending = registerEmail(base44, email, attribution).finally(() => inFlightEmails.delete(email));
      inFlightEmails.set(email, pending);
    }
    const created = await pending;
    if (created) {
      waitUntil(sendWelcomeEmail(base44, email));
    }

    // Keep the response identical for new and existing addresses.
    return Response.json({ ok: true });
  } catch (error) {
    console.error("joinWaitlist failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}