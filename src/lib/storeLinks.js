const STORE_HOSTS = Object.freeze({
  googlePlay: "play.google.com",
  appStore: "apps.apple.com"
});

export function normalizeStoreUrl(value, expectedHost) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!Object.values(STORE_HOSTS).includes(expectedHost)) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname !== expectedHost) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** @type {Record<string, string | undefined>} */
const buildEnv = import.meta.env ?? {};

export const GOOGLE_PLAY_URL = normalizeStoreUrl(
  buildEnv.VITE_GOOGLE_PLAY_URL,
  STORE_HOSTS.googlePlay
);

export const APP_STORE_URL = normalizeStoreUrl(
  buildEnv.VITE_APP_STORE_URL,
  STORE_HOSTS.appStore
);
