import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  telemetryEnabled,
  sanitizeProps,
  buildErrorPayload,
  buildEventPayload,
  reportError,
  trackEvent,
} from "../../src/lib/telemetry.js";
import { importWithRetry, markChunksLoaded } from "../../src/lib/lazyWithRetry.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (rel) => readFileSync(resolve(repoRoot, rel), "utf8");

test("telemetry network delivery is off by default", () => {
  // No flag and no endpoint in a plain build => nothing is ever sent. This is
  // the Play Data Safety guarantee: collection cannot start without an explicit
  // opt-in at deploy time.
  assert.equal(telemetryEnabled(), false);
});

test("sanitizeProps drops anything that could identify a user or leak health data", () => {
  const cleaned = sanitizeProps({
    email: "a@b.com",
    userName: "Aaron",
    authToken: "secret",
    weight: 190,
    waist: 34,
    note: "private",
    tab: "today",
    count: 3,
    done: true,
    skipped: null,
  });

  assert.deepEqual(Object.keys(cleaned).sort(), ["count", "done", "skipped", "tab"]);
  assert.equal(cleaned.tab, "today");
  assert.equal(cleaned.count, 3);
  assert.equal(cleaned.done, true);
  assert.equal(cleaned.skipped, null);
});

test("sanitizeProps caps string length and ignores object/array values", () => {
  const cleaned = sanitizeProps({
    label: "x".repeat(500),
    payload: { nested: true },
    list: [1, 2, 3],
  });
  assert.equal(cleaned.label.length, 120);
  assert.equal("payload" in cleaned, false);
  assert.equal("list" in cleaned, false);
});

test("buildErrorPayload normalizes non-Errors and truncates unbounded fields", () => {
  const payload = buildErrorPayload(
    "raw string failure",
    { componentStack: "s".repeat(5000), boundary: "route", path: "/today" },
    999
  );

  assert.equal(payload.type, "error");
  assert.equal(payload.name, "Error");
  assert.equal(payload.message, "raw string failure");
  assert.equal(payload.boundary, "route");
  assert.equal(payload.path, "/today");
  assert.equal(payload.at, 999);
  assert.ok(payload.componentStack.length <= 2000);
  assert.ok(payload.stack.length <= 2000);
});

test("buildEventPayload clamps the event name and sanitizes props", () => {
  const payload = buildEventPayload("x".repeat(200), { email: "a@b.com", ok: true }, 7);
  assert.equal(payload.type, "event");
  assert.equal(payload.name.length, 64);
  assert.deepEqual(payload.props, { ok: true });
  assert.equal(payload.at, 7);
});

test("reportError always leaves a console breadcrumb and never throws", () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    assert.doesNotThrow(() => reportError(new Error("kaboom"), { boundary: "root" }));
  } finally {
    console.error = original;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[recompone] crash");
  assert.equal(calls[0][1].message, "kaboom");
});

test("trackEvent is a no-op that never throws when telemetry is disabled", () => {
  assert.doesNotThrow(() => trackEvent("app_open"));
  assert.doesNotThrow(() => trackEvent("signed_in", { email: "a@b.com" }));
});

test("importWithRetry retries the configured number of times before giving up", async () => {
  let attempts = 0;
  const value = await importWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("stale chunk");
      return { default: "loaded" };
    },
    { retries: 2 }
  );
  assert.equal(value.default, "loaded");
  assert.equal(attempts, 3); // initial + 2 retries
});

test("importWithRetry surfaces onExhausted and rethrows once retries run out", async () => {
  let exhaustedWith = null;
  await assert.rejects(
    importWithRetry(
      async () => {
        throw new Error("always fails");
      },
      { retries: 1, onExhausted: (err) => (exhaustedWith = err) }
    ),
    /always fails/
  );
  assert.ok(exhaustedWith instanceof Error);
});

test("markChunksLoaded is safe to call in a non-browser context", () => {
  assert.doesNotThrow(() => markChunksLoaded());
});

// --- Source wiring: the runtime is only useful if it is actually installed. ---

test("ErrorBoundary reports crashes through the telemetry channel", () => {
  const src = read("src/components/ErrorBoundary.jsx");
  assert.match(src, /from "@\/lib\/telemetry"/);
  assert.match(src, /reportError\(/);
  assert.match(src, /componentStack: info\?\.componentStack/);
  // Inline (route) variant recovers without a reload; resetKey clears on nav.
  assert.match(src, /variant === "inline"/);
  assert.match(src, /componentDidUpdate/);
  assert.match(src, /role="alert"/);
});

test("RouteErrorBoundary scopes errors to the current route", () => {
  const src = read("src/components/RouteErrorBoundary.jsx");
  assert.match(src, /useLocation/);
  assert.match(src, /variant="inline"/);
  assert.match(src, /resetKey=\{location\.pathname\}/);
});

test("the app entry point initializes telemetry and chunk recovery", () => {
  const src = read("src/main.jsx");
  assert.match(src, /initTelemetry\(\)/);
  assert.match(src, /trackEvent\('app_open'\)/);
  assert.match(src, /markChunksLoaded\(\)/);
  assert.match(src, /installChunkErrorRecovery\(\)/);
});

test("App uses retrying lazy imports and wraps routes in the route boundary", () => {
  const src = read("src/App.jsx");
  assert.match(src, /import \{ lazyWithRetry \} from '@\/lib\/lazyWithRetry'/);
  assert.doesNotMatch(src, /=\s*lazy\(/); // every page import goes through the retry wrapper
  assert.match(src, /<RouteErrorBoundary>/);
});

test("funnel milestones fire at sign-in and onboarding completion", () => {
  assert.match(read("src/lib/AuthContext.jsx"), /trackEvent\('signed_in'\)/);
  assert.match(read("src/lib/RecompContext.jsx"), /trackEvent\("onboarding_complete"\)/);
});

test("the telemetry flag defaults off and gates on an explicit endpoint", () => {
  const src = read("src/lib/telemetry.js");
  assert.match(src, /featureFlags\.telemetry && ENDPOINT/);
  assert.match(read("src/lib/featureFlags.js"), /telemetry: enabledFromEnvironment/);
});

test("the privacy policy discloses the de-identified diagnostics", () => {
  const src = read("src/pages/Privacy.jsx");
  assert.match(src, /de-identified diagnostics/i);
  assert.match(src, /off unless the deployed build turns them on/i);
});
