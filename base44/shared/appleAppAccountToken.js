const TOKEN_DOMAIN = "com.base6a68bb922bf88da5ec767da3.app:storekit-account:v1:";

/**
 * Derive the stable, pseudonymous UUID passed to StoreKit as appAccountToken.
 * Apple signs this value into the transaction, allowing the server to bind a
 * purchase to an authenticated RecompOne account without exposing user data or
 * relying on a racy database claim.
 *
 * UUID version 8 is reserved for application-defined UUIDs. The payload is the
 * first 128 bits of SHA-256(domain || Base44 user id), with RFC 9562 version and
 * variant bits applied.
 *
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function deriveAppleAppAccountToken(userId) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId || normalizedUserId.length > 256) {
    throw new Error("A valid account identifier is required");
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(TOKEN_DOMAIN + normalizedUserId)
    )
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
