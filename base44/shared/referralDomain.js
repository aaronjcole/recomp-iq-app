// Referral attribution rules for recordReferralSignup. Plain JS with the
// entity accessor injected, so the decision logic runs and is tested in Node.

export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

// A referral is a signup event: only an account created this recently can be
// attributed. This stops a long-standing account (or one kept around for the
// purpose) from being credited to a referrer after the fact.
export const REFERRAL_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Rows read back after inserting this referee's attribution. A referee should
// have one row; more than a page means something is already wrong, and the
// ranking then fails closed.
export const REFERRAL_RANK_PAGE_SIZE = 20;

function parseTime(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function isReferralCode(code) {
  return typeof code === "string" && REFERRAL_CODE_PATTERN.test(code);
}

/**
 * Whether `user` may be attributed to `referrerId` at `now`.
 *
 * Uses the auth user's server-assigned `created_date`. A missing or
 * unparsable value cannot prove the account is new, so it is rejected (fail
 * closed). A created_date slightly ahead of `now` (clock skew) is accepted.
 *
 * @returns {{ eligible: boolean, reason: null | "self_referral" | "account_age_unknown" | "account_too_old" }}
 */
export function referralEligibility(user, referrerId, now = Date.now()) {
  if (typeof referrerId !== "string" || referrerId === "" || referrerId === user?.id) {
    return { eligible: false, reason: "self_referral" };
  }
  const createdAt = parseTime(user?.created_date);
  if (createdAt === null) return { eligible: false, reason: "account_age_unknown" };
  if (now - createdAt > REFERRAL_ATTRIBUTION_WINDOW_MS) {
    return { eligible: false, reason: "account_too_old" };
  }
  return { eligible: true, reason: null };
}

/**
 * Decide whether Referral row `ownId` is this referee's one attribution, given
 * the referee's rows listed AFTER `ownId` was inserted.
 *
 * Rows are ranked by server-assigned `created_date`. A row with an earlier
 * created_date (or none, which fails closed) means an attribution already
 * existed: "duplicate". A row tied with ours, and none earlier, means two
 * requests inserted in the same millisecond; each may or may not see the
 * other, so neither can safely claim first place: "retry". The caller deletes
 * its own row for both outcomes, so at most one row survives; a retry outcome
 * is reported as a retryable error so the client tries again later, when the
 * sequential check settles it. Only a row with nothing tied or earlier is
 * "recorded".
 *
 * @param {Array<object>} rows - Referral rows for one referee, any order.
 * @param {string} ownId - Server id of the row this request inserted.
 * @param {{ truncated?: boolean }} [options] - `truncated`: the list hit its page size.
 * @returns {{ outcome: "recorded" | "duplicate" | "retry" }}
 */
export function rankReferralAttribution(rows, ownId, { truncated = false } = {}) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.id === "string" && row.id !== "")
    .map((row) => ({ id: row.id, createdAt: parseTime(row.created_date) }));
  const own = list.find((row) => row.id === ownId);
  // A full ascending page without our row means other rows sort before it.
  if (!own) return { outcome: truncated ? "duplicate" : "retry" };
  if (own.createdAt === null) return { outcome: "retry" };

  const others = list.filter((row) => row.id !== ownId);
  if (others.some((row) => row.createdAt === null || row.createdAt < own.createdAt)) {
    return { outcome: "duplicate" };
  }
  if (others.some((row) => row.createdAt === own.createdAt)) return { outcome: "retry" };
  // On a full page, rows cut off after the last one could tie with ours.
  if (truncated && Math.max(...list.map((row) => row.createdAt)) <= own.createdAt) {
    return { outcome: "retry" };
  }
  return { outcome: "recorded" };
}

/**
 * Record `refereeId`'s referral to `referrerId` at most once, even when
 * several requests for the same referee run in parallel.
 *
 * `referrals` is the service-role Referral entity accessor, injected so this
 * module never imports the SDK.
 *
 * Concurrency: the row is inserted first and only then are the referee's rows
 * listed, oldest created_date first. If request A's list misses B's row, B's
 * insert became visible after A's insert, so B's server-assigned created_date
 * is the same or later than A's; B's own list (made after its insert) then
 * sees A. So for any two rows, the later-listing request sees both. With a
 * strictly earlier row visible it reports "duplicate" and deletes its own row;
 * with a tie it deletes its own row too. Hence at most one row survives: the
 * strictly earliest one, if one is strictly earliest, and otherwise none (the
 * tied requests answer "retry", and the client's later retry records the
 * attribution through the sequential path).
 *
 * @returns {Promise<{ recorded: boolean, outcome: "recorded" | "existing" | "duplicate" | "retry" }>}
 */
export async function recordReferralAttribution(referrals, { referrerId, refereeId, code }) {
  // Cheap sequential check; correctness under concurrency comes from the
  // rank-after-insert below.
  const existing = await referrals.filter({ referee_id: refereeId }, "created_date", 1);
  if (Array.isArray(existing) && existing.length > 0) {
    return { recorded: false, outcome: "existing" };
  }

  const created = await referrals.create({
    referrer_id: referrerId,
    referee_id: refereeId,
    code,
    status: "pending"
  });
  const ownId = typeof created?.id === "string" ? created.id : "";
  if (!ownId) return { recorded: false, outcome: "retry" };

  let rank;
  try {
    const rows = await referrals.filter(
      { referee_id: refereeId },
      "created_date",
      REFERRAL_RANK_PAGE_SIZE
    );
    rank = rankReferralAttribution(rows, ownId, {
      truncated: Array.isArray(rows) && rows.length >= REFERRAL_RANK_PAGE_SIZE
    });
  } catch (error) {
    // The row cannot be ranked; remove it rather than risk a duplicate.
    await referrals.delete(ownId);
    throw error;
  }
  if (rank.outcome === "recorded") return { recorded: true, outcome: "recorded" };
  await referrals.delete(ownId);
  return { recorded: false, outcome: rank.outcome };
}
