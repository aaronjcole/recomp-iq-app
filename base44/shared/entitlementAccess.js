/**
 * Server-side entitlement loading.
 *
 * `premiumDomain.js` stays pure because the frontend imports it
 * (`PremiumAccessContext.jsx`, `Progress.jsx`), so the paged read that needs a
 * Base44 client lives here instead and is never bundled into the app.
 *
 * The same loop is currently inlined in analyzeBodyComposition,
 * generateAdaptiveMealPlan, generateAdaptiveTrainingBlock,
 * generateWeeklyAutopilot and getPremiumAccess. Those copies are deliberately
 * left alone — each is a working premium gate, and rewriting five of them is
 * not in scope for adding a sixth. New callers should use this module.
 */

const ENTITLEMENT_PAGE_SIZE = 500;
const MAX_ENTITLEMENT_RECORDS = 1_000;

// Only the fields resolvePremiumAccess() actually reads. Narrowing the
// projection keeps entitlement reads from returning unrelated columns.
const ENTITLEMENT_FIELDS = Object.freeze([
  "product_id",
  "source",
  "status",
  "expires_at"
]);

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
