import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("the iOS WebView owns both safe areas so the web tab bar fills the home-indicator edge", () => {
  const nativeApp = read("expo-ios/App.tsx");
  const webView = read("expo-ios/src/RecompOneWebView.tsx");
  const layout = read("src/components/AppLayout.jsx");

  assert.match(nativeApp, /import \{ (?:View, StyleSheet|StyleSheet, View) \} from "react-native"/);
  assert.doesNotMatch(nativeApp, /SafeAreaView/);
  assert.match(webView, /contentInsetAdjustmentBehavior="never"/);
  assert.match(layout, /pb-\[env\(safe-area-inset-bottom\)\]/);
});

test("training fields constrain their grid tracks", () => {
  const sessionBuilder = read("src/components/training/SessionBuilder.jsx");

  assert.match(sessionBuilder, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(sessionBuilder, /min-w-0 space-y-1\.5/);
});

test("appearance uses one shared provider and direct WebView-safe mobile controls", () => {
  const app = read("src/App.jsx");
  const layout = read("src/components/AppLayout.jsx");
  const theme = read("src/lib/useTheme.js");
  const more = read("src/pages/More.jsx");

  assert.match(theme, /export function ThemeProvider/);
  assert.match(app, /<ThemeProvider>/);
  assert.doesNotMatch(layout, /useTheme\(\)/);
  assert.match(more, /role="group" aria-label="Appearance"/);
  assert.match(more, /aria-pressed=\{themePreference === option\.value\}/);
  assert.doesNotMatch(more, /nativeOnMobile/);
});
