import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

/**
 * Context contract oracle for the Wave 1 mega-context refactor.
 *
 * RecompContext exposes ~30 keys through a single `value` object, consumed by
 * 20+ components via `const { ... } = useRecomp()`. When that provider is split
 * (stable actions vs. per-domain data), the easiest and most damaging mistake
 * is to drop a key from what the provider(s) expose — a bug that lint,
 * typecheck, and the unit tests all pass right through, surfacing only as a
 * blank or stale screen at runtime.
 *
 * This test fails loudly and specifically if any key a component destructures
 * from useRecomp() is not provided by RecompContext. After the split, update
 * `collectProvidedKeys` to union every context the refactor introduces — a
 * failure here means "you forgot to expose <key> somewhere".
 */

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const srcDir = resolve(repoRoot, "src");
const contextPath = resolve(srcDir, "lib/RecompContext.jsx");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Extract the identifier names from a destructuring pattern body. */
function keysFromDestructure(body) {
  return body
    .split(",")
    .map((part) => part.replace(/\/\/.*$/gm, "").trim())
    .filter(Boolean)
    // `logs: renamed` -> consumed context key is `logs` (before the colon).
    // `logs = fallback` -> strip the default. Ignore rest `...rest`.
    .map((part) => part.split(":")[0].split("=")[0].trim())
    .filter((name) => name && !name.startsWith("..."));
}

/** Every key any component reads from useRecomp(), with the files that read it. */
function collectConsumedKeys() {
  const consumed = new Map();
  // Stop the capture at `;` or a brace so it can't bridge across an adjacent
  // hook (e.g. `const { user } = useAuth();` sitting above the useRecomp call).
  const pattern = /const\s*\{([^{};]*?)\}\s*=\s*useRecomp\(\)/g;
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, "utf8");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      for (const key of keysFromDestructure(match[1])) {
        if (!consumed.has(key)) consumed.set(key, []);
        consumed.get(key).push(file.replace(`${repoRoot}/`, ""));
      }
    }
  }
  return consumed;
}

/**
 * Keys the provider(s) expose. Today that is the single `const value = {…}`
 * object in RecompContext. When the context is split, extend this to read the
 * union of every object passed to a `<*.Provider value={…}>`.
 */
function collectProvidedKeys() {
  const source = readFileSync(contextPath, "utf8");
  const start = source.indexOf("const value = {");
  assert.notEqual(start, -1, "RecompContext must build a `const value = {…}` object");

  // Brace-match from the opening `{` to its close so nested objects are skipped.
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.notEqual(end, -1, "RecompContext `value` object must be balanced");

  const provided = new Set();
  // Only consider keys at the top level of the value object (depth 1).
  let level = 0;
  const body = source.slice(open, end + 1);
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Track nesting so we don't pick up nested object keys.
    const openers = (trimmed.match(/\{/g) || []).length;
    const closers = (trimmed.match(/\}/g) || []).length;
    if (level === 1) {
      // `key,` (shorthand), `key: value`, or a trailing shorthand `key` with
      // no comma (the last property in the object).
      const m = trimmed.match(/^([A-Za-z0-9_]+)\s*(?:[:,]|$)/);
      if (m) provided.add(m[1]);
    }
    level += openers - closers;
  }
  return provided;
}

test("every useRecomp() consumer key is provided by RecompContext", () => {
  const consumed = collectConsumedKeys();
  const provided = collectProvidedKeys();

  assert.ok(consumed.size >= 20, `expected the app to consume many context keys, found ${consumed.size}`);
  assert.ok(provided.size >= 25, `expected RecompContext to provide many keys, found ${provided.size}`);

  const missing = [];
  for (const [key, files] of consumed) {
    if (!provided.has(key)) missing.push(`${key}  (read in ${files.join(", ")})`);
  }

  assert.deepEqual(
    missing,
    [],
    `useRecomp() keys with no provider — a context split dropped them:\n  ${missing.join("\n  ")}`
  );
});

test("the RecompContext value is wired to the provider", () => {
  const source = readFileSync(contextPath, "utf8");
  assert.match(
    source,
    /<Ctx\.Provider value=\{value\}>/,
    "the assembled value object must be passed to Ctx.Provider"
  );
});
