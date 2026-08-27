import { base44 } from "@/api/base44Client";

const STORAGE_KEY = "recomp_pending_referral_code";
const CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

/**
 * Reads a ?ref= code from the current URL and stashes it in localStorage so it
 * survives the Google OAuth round-trip and is available after login completes.
 */
export function captureReferralCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && CODE_PATTERN.test(ref)) {
      localStorage.setItem(STORAGE_KEY, ref);
    }
  } catch {
    // Storage may be unavailable (private mode); referral tracking is best-effort.
  }
}

/**
 * After a user is authenticated, records any pending referral code against their
 * account. Idempotent and best-effort — never blocks app use. The code is only
 * cleared on success; a transient failure leaves it for a safe retry.
 */
export async function attributePendingReferral() {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    if (!code) return;
    await base44.functions.invoke("recordReferralSignup", { code });
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep the code so a later mount can retry; recordReferralSignup is idempotent.
  }
}