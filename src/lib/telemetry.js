import { featureFlags } from "./featureFlags.js";

// Lightweight, privacy-first observability. Network delivery is OFF unless
// BOTH a telemetry flag is set AND an endpoint is configured, so nothing is
// collected until the deployment has accepted it (Play Data Safety). Even with
// delivery off, crashes still leave a structured console breadcrumb so they are
// visible in whatever log surface the host/WebView provides.

const isBrowser = typeof window !== "undefined";
const ENDPOINT = import.meta.env?.VITE_TELEMETRY_ENDPOINT || "";
const APP_VERSION = import.meta.env?.VITE_APP_VERSION || "dev";
const IS_DEV = Boolean(import.meta.env?.DEV);

// Never forward anything that could identify a user or leak health data. Only
// the error itself, the route path (no query string), and safe event props.
const BLOCKED_PROP = /email|name|token|password|secret|weight|waist|address|phone|note/i;

export function sanitizeProps(props) {
  const out = {};
  for (const [key, value] of Object.entries(props || {})) {
    if (BLOCKED_PROP.test(key)) continue;
    if (value === null) out[key] = null;
    else if (typeof value === "string") out[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function currentPath(fallback) {
  if (isBrowser) return window.location?.pathname ?? null;
  return fallback ?? null;
}

export function buildErrorPayload(error, context = {}, now = Date.now()) {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    type: "error",
    name: err.name || "Error",
    message: (err.message || "").slice(0, 500),
    stack: (err.stack || "").slice(0, 2000),
    componentStack: (context.componentStack || "").slice(0, 2000),
    boundary: context.boundary || null,
    path: currentPath(context.path),
    appVersion: APP_VERSION,
    at: now,
  };
}

export function buildEventPayload(name, props = {}, now = Date.now()) {
  return {
    type: "event",
    name: String(name).slice(0, 64),
    props: sanitizeProps(props),
    path: currentPath(null),
    appVersion: APP_VERSION,
    at: now,
  };
}

export function telemetryEnabled() {
  return Boolean(featureFlags.telemetry && ENDPOINT);
}

function deliver(payload) {
  if (!telemetryEnabled() || !isBrowser) return;
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else if (typeof fetch === "function") {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry must never break the app.
  }
}

export function reportError(error, context = {}) {
  const payload = buildErrorPayload(error, context);
  // Structured breadcrumb regardless of delivery, so crashes are never silent.
  // eslint-disable-next-line no-console
  console.error("[recompone] crash", payload);
  deliver(payload);
}

export function trackEvent(name, props = {}) {
  const payload = buildEventPayload(name, props);
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.debug("[recompone] event", payload.name, payload.props);
  }
  deliver(payload);
}

let initialized = false;

// Capture crashes that never reach a React boundary (async, event handlers).
export function initTelemetry() {
  if (!isBrowser || initialized) return;
  initialized = true;
  window.addEventListener("error", (event) => {
    reportError(event.error || new Error(event.message || "window error"), { boundary: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportError(reason, { boundary: "unhandledrejection" });
  });
}
