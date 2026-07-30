import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const raw = typeof body.email === 'string' ? body.email.trim() : '';
    const email = raw.toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Dedupe — don't create duplicates for the same email.
    const existing = await base44.asServiceRole.entities.WaitlistEntry.filter({ email });
    if (existing && existing.length > 0) {
      return Response.json({ ok: true, alreadyRegistered: true });
    }

    await base44.asServiceRole.entities.WaitlistEntry.create({
      email,
      source: typeof body.source === 'string' ? body.source : 'coming_soon_page'
    });

    return Response.json({ ok: true, alreadyRegistered: false });
  } catch (error) {
    return Response.json({ error: error.message || 'Something went wrong.' }, { status: 500 });
  }
}