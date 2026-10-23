// Purchase-token binding rules for verifyGooglePlayPurchase. Plain JS with the
// entity accessor injected, so the decision logic runs and is tested in Node.
//
// A Google Play one-time purchase stays purchaseState === 0 indefinitely, so
// its token is the only durable identity of that purchase and must authorize
// exactly one account. Base44 offers no transaction and no unique constraint,
// so "has another account already bound this token?" cannot be a read-then-write:
// N parallel requests would each read an empty binding and each create their
// own entitlement. The binding is therefore rank-after-insert, the same shape
// recordReferralSignup uses: every request writes first, then reads the rows
// bound to the token, the earliest one keeps it, and the rest are retired.
// (Apple does not need this: verifyApplePurchase binds through the
// Apple-signed appAccountToken, which is deterministic per account.)

export const GOOGLE_PLAY_SOURCE = "google_play";

// Rows read back after writing this token binding. A race leaves at most as
// many rows as it had parallel requests, so one page covers it; the ranking
// still fails closed by retiring our own row when ours falls outside the page.
export const GOOGLE_PLAY_BINDING_PAGE_SIZE = 50;

function parseTime(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rank every entitlement row bound to one purchase token and report whether
 * `ownId` is the binding that stays active.
 *
 * The winner is deterministic — earliest server-assigned `created_date`, ties
 * broken by the lowest id — so every racing request reaches the same verdict
 * whatever subset of rows it happened to read: at most one account keeps the
 * token, and no racing request ever has to retry into an empty result. Rows
 * whose created_date cannot be read count as earlier than ours (fails closed).
 *
 * @param {Array<object>} rows - rows bound to one token hash, any order.
 * @param {string} ownId - server id of the row this request wrote.
 * @returns {{ isWinner: boolean, duplicateIds: string[] }} `duplicateIds` are
 *   the later bindings an owner retires; empty when `isWinner` is false.
 */
export function rankGooglePlayBinding(rows, ownId) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.id === "string" && row.id !== "")
    .map((row) => ({ id: row.id, createdAt: parseTime(row.created_date) }));
  const own = list.find((row) => row.id === ownId);
  // Our own write is not visible, or carries no timestamp: nothing can be
  // proven about who came first, so the caller retires its own binding.
  if (!own || own.createdAt === null) return { isWinner: false, duplicateIds: [] };

  const others = list.filter((row) => row.id !== ownId);
  if (others.some((row) => row.createdAt === null || row.createdAt < own.createdAt)) {
    return { isWinner: false, duplicateIds: [] };
  }
  if (others.some((row) => row.createdAt === own.createdAt && row.id < own.id)) {
    return { isWinner: false, duplicateIds: [] };
  }

  return {
    isWinner: true,
    duplicateIds: others
      .filter((row) => row.createdAt > own.createdAt
        || (row.createdAt === own.createdAt && row.id > own.id))
      .map((row) => row.id)
  };
}

/**
 * Bind one purchase token to `userId`'s entitlement at most once across all
 * accounts, even when many accounts verify the same token in parallel.
 *
 * `entitlements` is the service-role PremiumEntitlement accessor, injected so
 * this module never imports the SDK.
 *
 * @param {{ filter: Function, create: Function, update: Function, delete: Function }} entitlements
 * @param {{ userId: string, productId: string, tokenHash: string, expiresAt?: string|null }} binding
 * @returns {Promise<{ linked: boolean, conflict: boolean }>} `conflict` is true
 *   when another account holds the token's earliest binding.
 */
export async function bindGooglePlayPurchaseToken(entitlements, { userId, productId, tokenHash, expiresAt }) {
  const expiresPatch = expiresAt ? { expires_at: expiresAt } : {};
  const tokenQuery = { external_transaction_id: tokenHash, source: GOOGLE_PLAY_SOURCE };

  // Cheap sequential checks, kept so the ordinary path writes once. They are
  // not the guarantee: the ranking below is what holds under concurrency.
  const bound = await entitlements.filter(tokenQuery, "-created_date", 1);
  if (Array.isArray(bound) && bound.length > 0 && bound[0].owner_id !== userId) {
    return { linked: false, conflict: true };
  }
  const existing = await entitlements.filter(
    { owner_id: userId, product_id: productId, source: GOOGLE_PLAY_SOURCE },
    "-created_date",
    1
  );

  let ownId = "";
  let createdNow = false;
  if (Array.isArray(bound) && bound.length > 0) {
    // Token already bound to this account: idempotent refresh.
    ownId = bound[0].id;
    await entitlements.update(ownId, { status: "active", ...expiresPatch });
  } else if (Array.isArray(existing) && existing.length > 0) {
    // Entitlement created before token binding existed: bind the token now.
    ownId = existing[0].id;
    await entitlements.update(ownId, {
      status: "active",
      ...expiresPatch,
      external_transaction_id: tokenHash
    });
  } else {
    const created = await entitlements.create({
      owner_id: userId,
      product_id: productId,
      source: GOOGLE_PLAY_SOURCE,
      status: "active",
      external_transaction_id: tokenHash,
      ...expiresPatch
    });
    ownId = typeof created?.id === "string" ? created.id : "";
    createdNow = true;
    if (!ownId) throw new Error("Purchase binding could not be confirmed");
  }

  // Rank after insert: read every row bound to this token and keep the
  // earliest, so a parallel request that bound the same token loses its own row.
  const rows = await entitlements.filter(tokenQuery, "created_date", GOOGLE_PLAY_BINDING_PAGE_SIZE);
  const { isWinner, duplicateIds } = rankGooglePlayBinding(rows, ownId);

  if (isWinner) {
    const duplicates = new Set(duplicateIds);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!duplicates.has(row?.id) || row.status !== "active") continue;
      // Best effort: the other request may have retired or removed its own row
      // already, and losing that race must not fail the binding won here.
      try {
        await entitlements.update(row.id, { status: "revoked" });
      } catch {
        // The row is already gone; the binding stands either way.
      }
    }
    return { linked: true, conflict: false };
  }

  // Another account holds the earlier binding: retire the row this request
  // wrote — its own new row, or its previous binding — and report the conflict.
  if (createdNow) await entitlements.delete(ownId);
  else await entitlements.update(ownId, { status: "revoked" });
  return { linked: false, conflict: true };
}