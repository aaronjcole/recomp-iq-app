import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NATIVE_AUTH_CALLBACK,
  NATIVE_AUTH_RETURN_PATH,
  isProviderLoginUrl,
  nativeLoginUrl,
  safeReturnPath,
  webViewUrlForCallback
} from "../../expo-ios/src/nativeAuth.ts";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const APP = "https://recomp-iq.base44.app";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload-for-tests.signature";
const login = (path, fromUrl = `${APP}/today`) =>
  `${APP}${path}?app_id=app-1&from_url=${encodeURIComponent(fromUrl)}`;

test("only Base44 provider-login redirects are handed to the auth session", () => {
  assert.equal(isProviderLoginUrl(login("/api/apps/auth/login"), APP), true, "Google");
  assert.equal(isProviderLoginUrl(login("/api/apps/auth/apple/login"), APP), true, "Apple");
  assert.equal(isProviderLoginUrl(login("/api/apps/app-1/auth/sso/login"), APP), true, "SSO");
  assert.equal(
    isProviderLoginUrl(`https://base44.app/api/apps/auth/microsoft/login?app_id=app-1&from_url=x`, APP),
    true,
    "Base44's own auth host"
  );
  for (const other of [
    `${APP}/login`,
    `${APP}/api/apps/auth/logout?from_url=x`,
    `${APP}/api/apps/auth/login`,
    `https://evil.example/api/apps/auth/login?app_id=app-1`,
    `http://recomp-iq.base44.app/api/apps/auth/login?app_id=app-1`,
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
    "not a url"
  ]) {
    assert.equal(isProviderLoginUrl(other, APP), false, other);
  }
});

test("the auth session returns through the static page and keeps the return path", () => {
  const sessionUrl = new URL(nativeLoginUrl(login("/api/apps/auth/login", `${APP}/more/premium?tab=a`), APP));
  const fromUrl = new URL(sessionUrl.searchParams.get("from_url"));
  assert.equal(fromUrl.origin, APP);
  assert.equal(fromUrl.pathname, NATIVE_AUTH_RETURN_PATH);
  assert.equal(fromUrl.searchParams.get("next"), "/more/premium?tab=a");
  assert.equal(sessionUrl.searchParams.get("app_id"), "app-1", "other parameters are kept");
});

test("return paths stay on the app origin", () => {
  assert.equal(safeReturnPath("/today", APP), "/today");
  assert.equal(safeReturnPath(`${APP}/nutrition?panel=targets`, APP), "/nutrition?panel=targets");
  assert.equal(safeReturnPath("https://evil.example/phish", APP), "/");
  assert.equal(safeReturnPath("//evil.example/phish", APP), "/");
  assert.equal(safeReturnPath("/\\evil.example", APP), "/");
  assert.equal(safeReturnPath("javascript:alert(1)", APP), "/");
  assert.equal(safeReturnPath(null, APP), "/");
  assert.equal(safeReturnPath("/today?access_token=old", APP), "/today", "a stale token is never carried along");
});

test("only a well-formed callback with a token reaches the WebView", () => {
  const ok = webViewUrlForCallback(
    `${NATIVE_AUTH_CALLBACK}?access_token=${encodeURIComponent(TOKEN)}&next=${encodeURIComponent("/today")}`,
    APP
  );
  const target = new URL(ok);
  assert.equal(target.origin, APP);
  assert.equal(target.pathname, "/today");
  assert.equal(target.searchParams.get("access_token"), TOKEN);

  const evilNext = new URL(webViewUrlForCallback(
    `${NATIVE_AUTH_CALLBACK}?access_token=${TOKEN}&next=${encodeURIComponent("https://evil.example/")}`,
    APP
  ));
  assert.equal(evilNext.origin, APP, "an off-origin next falls back to the app");
  assert.equal(evilNext.pathname, "/");

  for (const bad of [
    `${NATIVE_AUTH_CALLBACK}?error=cancelled`,
    `${NATIVE_AUTH_CALLBACK}?access_token=short`,
    `${NATIVE_AUTH_CALLBACK}?access_token=${encodeURIComponent("has space " + TOKEN)}`,
    `recompone://other?access_token=${TOKEN}`,
    `https://recomp-iq.base44.app/auth?access_token=${TOKEN}`
  ]) {
    assert.equal(webViewUrlForCallback(bad, APP), null, bad);
  }
});

test("the shell routes provider sign-in through ASWebAuthenticationSession", () => {
  const shell = readFileSync(resolve(repoRoot, "expo-ios/src/RecompOneWebView.tsx"), "utf8");
  assert.match(shell, /WebBrowser\.openAuthSessionAsync\(sessionUrl, NATIVE_AUTH_CALLBACK\)/);
  assert.match(shell, /isProviderLoginUrl\(request\.url, APP_ORIGIN\)\) \{\s*void startNativeSignIn\(request\.url\);\s*return false;/);
  const app = JSON.parse(readFileSync(resolve(repoRoot, "expo-ios/app.json"), "utf8"));
  assert.equal(`${app.expo.scheme}://auth`, NATIVE_AUTH_CALLBACK, "the callback uses the app's registered scheme");
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, "expo-ios/package.json"), "utf8"));
  assert.ok(pkg.dependencies["expo-web-browser"], "expo-web-browser is a dependency");
});
