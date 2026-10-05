// Provider sign-in (Google, Microsoft, Facebook, Apple, SSO) from the iOS
// shell. Google and Facebook refuse OAuth inside an embedded WKWebView
// ("disallowed_useragent"), so the shell hands the provider login to
// ASWebAuthenticationSession instead of letting the WebView navigate to it.
//
// Flow:
//   1. The web app calls base44.auth.loginWithProvider, which navigates the
//      WebView to <base44>/api/apps/auth[/<provider>]/login?from_url=<app URL>.
//   2. The shell cancels that navigation and opens the same URL in an auth
//      session, with from_url pointed at NATIVE_AUTH_RETURN_PATH on the app
//      origin and the original return path carried in `next`.
//   3. Base44 redirects there with ?access_token=...; that static page
//      forwards to NATIVE_AUTH_CALLBACK, which the auth session captures
//      directly (the OS never routes it, so no other app can intercept it).
//   4. The shell sends the WebView to <app origin><next>?access_token=...,
//      the tab that started the login, so app-params.js's same-tab CSRF
//      check still applies.
//
// Pure functions only: covered by tests/security/ios-native-auth.test.js.

export const NATIVE_AUTH_CALLBACK = "recompone://auth";
export const NATIVE_AUTH_RETURN_PATH = "/auth/native-return.html";

const BASE44_AUTH_HOSTS = new Set(["base44.app", "app.base44.com"]);
const PROVIDER_LOGIN_PATH = /^\/api\/apps\/(?:auth(?:\/[a-z]+)?|[A-Za-z0-9_-]+\/auth\/sso)\/login\/?$/;
const MAX_TOKEN_LENGTH = 16_384;

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Whether a WebView navigation is a Base44 provider-login redirect. */
export function isProviderLoginUrl(value: string, appOrigin: string): boolean {
  const url = parse(value);
  const app = parse(appOrigin);
  if (!url || !app || url.protocol !== "https:") return false;
  const knownHost = url.host === app.host || BASE44_AUTH_HOSTS.has(url.host);
  return knownHost && PROVIDER_LOGIN_PATH.test(url.pathname) && url.searchParams.has("app_id");
}

// A same-origin path to return to after sign-in. Anything else (another
// origin, a protocol-relative "//host" path, backslashes) falls back to "/".
export function safeReturnPath(value: string | null | undefined, appOrigin: string): string {
  if (!value) return "/";
  const app = parse(appOrigin);
  if (!app) return "/";
  let candidate: URL | null = null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    candidate = parse(`${app.origin}${value}`);
  } else {
    candidate = parse(value);
  }
  if (!candidate || candidate.origin !== app.origin) return "/";
  candidate.searchParams.delete("access_token");
  return `${candidate.pathname}${candidate.search}${candidate.hash}` || "/";
}

/** The provider login URL to open in the auth session. */
export function nativeLoginUrl(loginUrl: string, appOrigin: string): string | null {
  const url = parse(loginUrl);
  const app = parse(appOrigin);
  if (!url || !app) return null;
  const next = safeReturnPath(url.searchParams.get("from_url"), appOrigin);
  const returnUrl = new URL(NATIVE_AUTH_RETURN_PATH, app.origin);
  returnUrl.searchParams.set("next", next);
  url.searchParams.set("from_url", returnUrl.toString());
  return url.toString();
}

function validToken(token: string | null): token is string {
  return typeof token === "string"
    && token.length >= 20
    && token.length <= MAX_TOKEN_LENGTH
    && !/\s/.test(token);
}

/**
 * The URL to load in the WebView after the auth session returns, or null if
 * the callback is not a successful sign-in.
 */
export function webViewUrlForCallback(callbackUrl: string, appOrigin: string): string | null {
  const url = parse(callbackUrl);
  const app = parse(appOrigin);
  if (!url || !app) return null;
  if (`${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, "") !== NATIVE_AUTH_CALLBACK) return null;
  const token = url.searchParams.get("access_token");
  if (!validToken(token)) return null;
  const target = new URL(safeReturnPath(url.searchParams.get("next"), appOrigin), app.origin);
  target.searchParams.set("access_token", token);
  return target.toString();
}
