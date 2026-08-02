const isBrowser = typeof window !== "undefined";

// This persisted key is intentionally stable across the RecompOne rebrand.
const AUTH_REDIRECT_KEY = "recompiq_auth_redirect_pending";
const AUTH_REDIRECT_MAX_AGE_MS = 10 * 60 * 1000;
const URL_BOOTSTRAP_PARAMS = [
  "access_token",
  "clear_access_token",
  "app_id",
  "app_base_url",
  "functions_version",
  "from_url"
];

function safelyReplaceSearchParams(params) {
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function readStoredToken() {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem("base44_access_token") || window.localStorage.getItem("token");
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem("base44_access_token");
    window.localStorage.removeItem("token");
    window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

function consumeVerifiedAuthCallbackToken(params) {
  const incomingToken = params.get("access_token");
  if (!incomingToken) return readStoredToken();

  let pending = null;
  try {
    pending = JSON.parse(window.sessionStorage.getItem(AUTH_REDIRECT_KEY) || "null");
  } catch {
    pending = null;
  }

  const age = Date.now() - Number(pending?.createdAt || 0);
  const expectedCallback =
    pending?.origin === window.location.origin && age >= 0 && age <= AUTH_REDIRECT_MAX_AGE_MS;
  const validTokenShape =
    typeof incomingToken === "string" && incomingToken.length >= 20 && incomingToken.length <= 16_384 && !/\s/.test(incomingToken);

  try {
    window.sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }

  if (!expectedCallback || !validTokenShape) return readStoredToken();

  try {
    window.localStorage.setItem("base44_access_token", incomingToken);
    window.localStorage.setItem("token", incomingToken);
  } catch {
    // The explicit token is still passed to the SDK for this page load.
  }
  return incomingToken;
}

function getAppParams() {
  if (!isBrowser) {
    return {
      appId: import.meta.env.VITE_BASE44_APP_ID,
      token: null,
      functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
      appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL
    };
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("clear_access_token") === "true") clearStoredAuth();
  const token = consumeVerifiedAuthCallbackToken(params);

  // Runtime configuration comes only from the trusted build/dev environment.
  // Query-string configuration is not authenticated and must never persist.
  for (const key of URL_BOOTSTRAP_PARAMS) params.delete(key);
  safelyReplaceSearchParams(params);

  try {
    for (const key of ["base44_app_id", "base44_app_base_url", "base44_functions_version", "base44_from_url"]) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }

  return {
    appId: import.meta.env.VITE_BASE44_APP_ID,
    token,
    functionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION,
    appBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || window.location.origin
  };
}

export function markAuthRedirectPending() {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(
      AUTH_REDIRECT_KEY,
      JSON.stringify({ origin: window.location.origin, createdAt: Date.now() })
    );
  } catch {
    // OAuth can still proceed, but a callback token will not be accepted without this marker.
  }
}

export const appParams = getAppParams();
