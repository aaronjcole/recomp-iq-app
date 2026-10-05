/**
 * Server-side entitlement loading.
 *
 * `premiumDomain.js` stays pure because the frontend imports it
 * (`PremiumAccessContext.jsx`, `Progress.jsx`), so the paged read that needs a
 * Base44 client lives here instead and is never bundled into the app.
 *
 * Every premium-gated backend function, and getPremiumAccess (which tells the
 * UI what to show), loads records through `loadPremiumAccessRecords` so the UI
 * and the gates cannot disagree. Functions must not define their own
 * entitlement reader; tests/security/entitlement-loader.test.js enforces this.
 *
 * This module runs under both Deno (functions) and Node (tests), so it never
 * reads environment variables or secrets itself: callers pass values in.
 */

import { PREMIUM_PRODUCTS } from "./premiumDomain.js";

export const ENTITLEMENT_PAGE_SIZE = 500;
export const MAX_ENTITLEMENT_RECORDS = 1_000;

// Only the fields resolvePremiumAccess() actually reads. Narrowing the
// projection keeps entitlement reads from returning unrelated columns.
const ENTITLEMENT_FIELDS = Object.freeze([
  "product_id",
  "source",
  "status",
  "expires_at"
]);

// Server-side testing bypass. Accounts listed in the PREMIUM_TESTER_EMAILS
// secret (comma-separated) get this synthetic full-bundle record without a
// PremiumEntitlement row. Clear the secret before production launch.
export const TESTER_FULL_RECORD = Object.freeze({
  product_id: PREMIUM_PRODUCTS.BUNDLE,
  source: "tester",
  status: "active",
  expires_at: null
});

/**
 * Parse a comma-separated list of account emails into a normalized set.
 * @param {unknown} raw
 * @returns {Set<string>}
 */
export function parseTesterEmails(raw) {
  if (typeof raw !== "string") return new Set();
  return new Set(
    raw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  );
}

/**
 * @param {{ email?: unknown } | null | undefined} user
 * @param {unknown} testerEmailsRaw raw PREMIUM_TESTER_EMAILS value
 * @returns {boolean}
 */
export function isPremiumTester(user, testerEmailsRaw) {
  const testers = parseTesterEmails(testerEmailsRaw);
  if (testers.size === 0 || !user?.email) return false;
  return testers.has(String(user.email).trim().toLowerCase());
}

/**
 * Read every PremiumEntitlement owned by `ownerId`, under the service role so
 * the check does not depend on the caller's own read permissions.
 *
 * Throws rather than returning a partial list: a truncated read would look
 * like "no entitlement" and silently deny a paying user, so the caller must
 * fail closed on an error instead of treating short results as authoritative.
 *
 * @param {any} base44 client created from the request
 * @param {string} ownerId authenticated user id, never a client-supplied value
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listAllEntitlements(base44, ownerId) {
  const records = [];
  let skip = 0;
  while (records.length < MAX_ENTITLEMENT_RECORDS) {
    const remaining = MAX_ENTITLEMENT_RECORDS - records.length;
    const pageSize = Math.min(ENTITLEMENT_PAGE_SIZE, remaining);
    const page = await base44.asServiceRole.entities.PremiumEntitlement.filter(
      { owner_id: ownerId },
      "-created_date",
      pageSize,
      skip,
      ENTITLEMENT_FIELDS
    );
    if (!Array.isArray(page)) throw new Error("Invalid entitlement response");
    records.push(...page);
    if (page.length < pageSize) return records;
    skip += page.length;
  }
  throw new Error("Entitlement response exceeded the safe record limit");
}

/**
 * The single source of premium records for the authenticated `user`; pass the
 * result to resolvePremiumAccess().
 *
 * A listed tester gets the synthetic bundle record without a database read
 * (the same short-circuit getPremiumAccess always had, so the UI and every
 * gate agree). Everyone else gets their stored entitlement records, and read
 * errors propagate so callers fail closed.
 *
 * @param {any} base44 client created from the request
 * @param {{ id?: unknown, email?: unknown }} user result of base44.auth.me()
 * @param {{ testerEmails?: unknown }} [options] testerEmails is the raw
 *   PREMIUM_TESTER_EMAILS secret value, read by the calling function
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function loadPremiumAccessRecords(base44, user, options = {}) {
  if (!user?.id) throw new Error("An authenticated user is required");
  if (isPremiumTester(user, options?.testerEmails)) return [TESTER_FULL_RECORD];
  return await listAllEntitlements(base44, user.id);
}
