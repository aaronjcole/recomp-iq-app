import { clearAllOnboardingDrafts } from "./onboardingDraft.js";

/**
 * The logout sequence behind signOut, with the auth client and storage passed
 * in. The SDK's logout only removes auth tokens, so device-local data that
 * must not outlive the session (the onboarding draft with health answers) is
 * cleared first — before logout can navigate away.
 *
 * @param {{ logout: (redirectUrl?: string) => unknown }} auth
 * @param {Storage | null} storage
 * @param {string} [redirectUrl] Where Base44 returns after logout; omit to only drop the token.
 */
export function signOutWith(auth, storage, redirectUrl) {
  clearAllOnboardingDrafts(storage);
  if (redirectUrl === undefined) {
    auth.logout();
  } else {
    auth.logout(redirectUrl);
  }
}
