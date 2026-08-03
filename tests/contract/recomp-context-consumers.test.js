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
  // Matches useRecomp() and the split useRecompActions()/useRecompData() hooks.
  // Stops the capture at `;` or a brace so it can't bridge across an adjacent
  // hook (e.g. `const { user } = useAuth();` sitting above the useRecomp call).
  const pattern = /const\s*\{([^{};]*?)\}\s*=\s*useRecomp(?:Actions|Data)?\(\)/g;
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

/** Top-level keys of the object literal whose opening `{` is at `open`. */
function topLevelKeys(source, open) {
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
  assert.notEqual(end, -1, "a context value object must be balanced");

  const keys = new Set();
  const spreads = [];
  let level = 0;
  for (const line of source.slice(open, end + 1).split("\n")) {
    const trimmed = line.trim();
    const openers = (trimmed.match(/\{/g) || []).length;
    const closers = (trimmed.match(/\}/g) || []).length;
    if (level === 1) {
      // A top-level spread (`...actions`) hides its keys from this text parser;
      // fail loudly so a future refactor resolves them instead of producing a
      // wall of false "missing key" errors.
      if (trimmed.startsWith("...")) spreads.push(trimmed.replace(/,$/, ""));
      // `key,` (shorthand), `key: value`, or a trailing shorthand key.
      const m = trimmed.match(/^([A-Za-z0-9_]+)\s*(?:[:,]|$)/);
      if (m) keys.add(m[1]);
    }
    level += openers - closers;
  }
  assert.deepEqual(
    spreads,
    [],
    `a context value object uses spread properties this collector cannot resolve — extend collectProvidedKeys:\n  ${spreads.join("\n  ")}`
  );
  return keys;
}

/**
 * Keys the provider(s) expose: the union of every `const <name>Value = {…}`
 * object in RecompContext (the actions/data split provides `actionsValue` and
 * `dataValue`). Add more `*Value` objects and they are picked up automatically.
 */
function collectProvidedKeys() {
  const source = readFileSync(contextPath, "utf8");
  const provided = new Set();
  const decl = /const\s+\w+Value\s*=\s*(?:useMemo\([^{]*|)\{/g;
  let match;
  let found = 0;
  while ((match = decl.exec(source)) !== null) {
    found += 1;
    const open = source.indexOf("{", match.index + match[0].length - 1);
    for (const key of topLevelKeys(source, open)) provided.add(key);
  }
  assert.ok(found >= 1, "RecompContext must build at least one `const <name>Value = {…}` object");
  return provided;
}

test("every useRecomp() consumer key is provided by RecompContext", () => {
  const consumed = collectConsumedKeys();
  const provided = collectProvidedKeys();

  // Sanity floors, not fixed counts: a zero means the parser stopped matching
  // (regex drift), not that the app stopped using the context. The split can
  // legitimately move keys between providers and change the totals.
  assert.ok(
    consumed.size > 0,
    "found no useRecomp()/useRecompActions() consumers — the consumer regex no longer matches the source"
  );
  assert.ok(
    provided.size > 0,
    "found no keys in RecompContext's *Value objects — collectProvidedKeys no longer parses them"
  );

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

test("both context values are wired to their providers", () => {
  const source = readFileSync(contextPath, "utf8");
  assert.match(
    source,
    /<Ctx\.Provider\s+value=\{\s*dataValue\s*\}/,
    "dataValue must be passed to Ctx.Provider"
  );
  assert.match(
    source,
    /<ActionsCtx\.Provider\s+value=\{\s*actionsValue\s*\}/,
    "actionsValue must be passed to ActionsCtx.Provider"
  );
});
