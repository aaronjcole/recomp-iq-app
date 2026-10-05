// Pure parsing/decision helpers for scripts/verify-android-release.mjs.
// Kept side-effect free so tests/security/android-release.test.js can import them.

const EXACT_HTTPS_ORIGIN = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d{1,5})?\/?$/i;

/**
 * Every frame-ancestors source list in a Content-Security-Policy header value.
 * Multiple policies (repeated headers joined with ",") are all enforced.
 * @param {string | null | undefined} headerValue
 * @returns {string[]}
 */
export function frameAncestorsDirectives(headerValue) {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .flatMap((policy) => policy.split(";"))
    .map((directive) => directive.trim())
    .filter((directive) => /^frame-ancestors(?:\s|$)/i.test(directive))
    .map((directive) => directive.slice("frame-ancestors".length).trim());
}

/**
 * True only for 'none', or 'self' optionally plus exact https origins
 * (no wildcards, schemes-only sources, paths or plain-http origins).
 * @param {string | null | undefined} sourceList
 */
export function isRestrictiveFrameAncestors(sourceList) {
  const sources = (sourceList || "").trim().split(/\s+/).filter(Boolean);
  if (sources.length === 0) return false;
  const lowered = sources.map((source) => source.toLowerCase());
  if (lowered.includes("'none'")) return lowered.length === 1;
  if (!lowered.includes("'self'")) return false;
  return sources.every((source) => (
    source.toLowerCase() === "'self'"
      || (!source.includes("*") && EXACT_HTTPS_ORIGIN.test(source))
  ));
}

/** True when any enforced CSP policy restricts framing to trusted ancestors. */
export function cspBlocksThirdPartyFraming(headerValue) {
  return frameAncestorsDirectives(headerValue).some(isRestrictiveFrameAncestors);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Module script URLs (the Vite entry) referenced by an HTML document. */
export function moduleScriptPaths(html) {
  return [...(html || "").matchAll(/<script\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\btype=["']?module["']?/i.test(tag))
    .map((tag) => tag.match(/\bsrc=["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
}

/** Whether compiled router code declares `path: "<path>"` for a route. */
export function bundleDeclaresRoute(source, path) {
  return new RegExp(`\\bpath\\s*[:=]\\s*["'\`]${escapeRegExp(path)}["'\`]`).test(source || "");
}

/** Hashed Vite chunk paths an entry bundle can load (dynamic imports and preload deps). */
export function referencedChunkPaths(source) {
  const paths = new Set();
  for (const match of (source || "").matchAll(/["'`]((?:\.{1,2}\/|\/)?(?:assets\/)?[\w.-]+-[\w-]{8}\.js)["'`]/g)) {
    paths.add(match[1]);
  }
  return [...paths];
}

/** Whether a compiled chunk contains the route's page title as a string literal. */
export function chunkContainsTitle(source, title) {
  if (!title) return false;
  const literal = escapeRegExp(title);
  return new RegExp(`["'\`]${literal}["'\`]`).test(source || "");
}

/**
 * Decide whether a deployed SPA really serves a route rather than its
 * catch-all: the entry must declare the route and some loadable chunk must
 * contain the page's own title.
 * @param {{ entrySources: string[], chunkSources: string[], path: string, title: string }} input
 * @returns {string[]} failure reasons (empty when the route is present)
 */
export function publicRouteProblems({ entrySources, chunkSources, path, title }) {
  const problems = [];
  if (!title) problems.push(`no expected page title is configured for ${path}`);
  if (!entrySources.some((source) => bundleDeclaresRoute(source, path))) {
    problems.push(`the deployed router does not declare ${path}`);
  }
  if (title && ![...entrySources, ...chunkSources].some((source) => chunkContainsTitle(source, title))) {
    problems.push(`no deployed bundle contains the ${path} page title "${title}"`);
  }
  return problems;
}
