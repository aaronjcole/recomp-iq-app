import { base44 } from "@/api/base44Client";
import { clearAllOnboardingDrafts } from "@/lib/onboardingDraft";

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The single logout path. The SDK's logout only removes auth tokens, so
 * device-local data that must not outlive the session (the onboarding draft
 * with health answers) is cleared here first.
 *
 * @param {string} [redirectUrl] Where Base44 returns after logout; omit to only drop the token.
 */
export function signOut(redirectUrl) {
  clearAllOnboardingDrafts(browserStorage());
  if (redirectUrl === undefined) {
    base44.auth.logout();
  } else {
    base44.auth.logout(redirectUrl);
  }
}
