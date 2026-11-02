import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const shell = readFileSync(resolve(repoRoot, "expo-ios/src/RecompOneWebView.tsx"), "utf8");

test("the iOS WebView lets the barcode scanner's camera preview play inline", () => {
  // WKWebView ignores <video playsInline> and holds autoplay without these.
  assert.match(shell, /\n\s*allowsInlineMediaPlayback\n/);
  assert.match(shell, /mediaPlaybackRequiresUserAction=\{false\}/);
  const scanner = readFileSync(resolve(repoRoot, "src/components/nutrition/BarcodeScanner.jsx"), "utf8");
  assert.match(scanner, /playsInline/);
});

test("a failed load shows an in-app retry screen instead of the default error page", () => {
  assert.match(shell, /renderError=\{\(\) => \(/);
  assert.match(shell, /onPress=\{\(\) => webViewRef\.current\?\.reload\(\)\}/);
  assert.match(shell, /Try again/);
  assert.doesNotMatch(shell, /RecompOne is unavailable/, "the old alert-only error path is gone");
});
