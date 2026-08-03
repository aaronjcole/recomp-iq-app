import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

/**
 * Context contract oracle for the Wave 1 context split.
 *
 * RecompContext is split into per-concern providers (data, actions, habits),
 * each read through its own hook. The easiest and most damaging mistake in this
 * refactor is to read a key through the wrong hook — e.g. destructuring `habits`
 * from useRecomp() after it moved to useRecompHabits(). That returns undefined
 * at runtime and blanks or crashes a screen, but lint, typecheck, and the unit
 * tests all pass right through it.
 *
 * This test is hook-aware: every key a component reads must be provided by the
 * object(s) backing the hook it read from. When you add or reshape a provider,
 * update HOOK_PROVIDERS and the provider-wiring test below — a failure here is
 * the point: it names the key and the file so the fix is obvious.
 */

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const srcDir = resolve(repoRoot, "src");
const contextPath = resolve(srcDir, "lib/RecompContext.jsx");

// Which `*Value` object(s) back each hook. useRecomp() composes data + actions.
const HOOK_PROVIDERS = {
  useRecomp: ["dataValue", "actionsValue"],
  useRecompData: ["dataValue"],
  useRecompActions: ["actionsValue"],
  useRecompHabits: ["habitsValue"],
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

function keysFromDestructure(body) {
  return body
    .split(",")
    .map((part) => part.replace(/\/\/.*$/gm, "").trim())
    .filter(Boolean)
    .map((part) => part.split(":")[0].split("=")[0].trim())
    .filter((name) => name && !name.startsWith("..."));
}

/** Every context key read in src, tagged with the hook it was read from. */
function collectConsumers() {
  const consumers = [];
  // Group 1: destructured names. Group 2: the hook (useRecomp / useRecompX).
  // Capture stops at `;`/braces so it can't bridge across an adjacent hook.
  const pattern = /const\s*\{([^{};]*?)\}\s*=\s*(useRecomp(?:Data|Actions|Habits)?)\(\)/g;
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, "utf8");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const hook = match[2];
      for (const key of keysFromDestructure(match[1])) {
        consumers.push({ hook, key, file: file.replace(`${repoRoot}/`, "") });
      }
    }
  }
  return consumers;
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
      // fail loudly so a future refactor resolves them.
      if (trimmed.startsWith("...")) spreads.push(trimmed.replace(/,$/, ""));
      const m = trimmed.match(/^([A-Za-z0-9_]+)\s*(?:[:,]|$)/);
      if (m) keys.add(m[1]);
    }
    level += openers - closers;
  }
  assert.deepEqual(
    spreads,
    [],
    `a context value object uses spread properties this collector cannot resolve — extend collectProvidedByObject:\n  ${spreads.join("\n  ")}`
  );
  return keys;
}

/** Map of `<name>Value` -> Set of the keys it provides. */
function collectProvidedByObject() {
  const source = readFileSync(contextPath, "utf8");
  const byObject = new Map();
  const decl = /const\s+(\w+Value)\s*=\s*(?:useMemo\([^{]*|)\{/g;
  let match;
  while ((match = decl.exec(source)) !== null) {
    const open = source.indexOf("{", match.index + match[0].length - 1);
    byObject.set(match[1], topLevelKeys(source, open));
  }
  assert.ok(byObject.size >= 1, "RecompContext must build at least one `const <name>Value = {…}` object");
  return byObject;
}

test("every context key is read through a hook that provides it", () => {
  const consumers = collectConsumers();
  const byObject = collectProvidedByObject();

  // Sanity floors: a zero means the parser stopped matching (regex drift), not
  // that the app stopped using the context.
  assert.ok(consumers.length > 0, "found no useRecomp*() consumers — the consumer regex no longer matches the source");
  assert.ok(byObject.size > 0, "found no RecompContext *Value objects — the provider regex no longer matches the source");

  const violations = [];
  for (const { hook, key, file } of consumers) {
    const objects = HOOK_PROVIDERS[hook];
    if (!objects) {
      violations.push(`${key} read via unknown hook ${hook}() in ${file}`);
      continue;
    }
    const provided = objects.some((name) => byObject.get(name)?.has(key));
    if (!provided) {
      violations.push(`${key} read via ${hook}() in ${file}, but no ${objects.join(" / ")} provides it`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `context keys read through a hook that does not provide them:\n  ${violations.join("\n  ")}`
  );
});

test("each context value is wired to its provider", () => {
  const source = readFileSync(contextPath, "utf8");
  const wiring = [
    ["Ctx", "dataValue"],
    ["ActionsCtx", "actionsValue"],
    ["HabitsCtx", "habitsValue"],
  ];
  for (const [ctx, value] of wiring) {
    assert.match(
      source,
      new RegExp(`<${ctx}\\.Provider\\s+value=\\{\\s*${value}\\s*\\}`),
      `${value} must be passed to ${ctx}.Provider`
    );
  }
});
