import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join, relative } from "node:path";

/**
 * Every `source` value the frontend writes to FoodLogEntry must be in the
 * entity's enum. An unknown value makes the diary write fail after the
 * FoodItem was already created, which surfaced as a silent no-op plus a
 * duplicate My Foods row on every retry.
 *
 * Call sites covered:
 *  - logFoodEntry(...) / logFoodEntries(...) calls with a `source: "x"` literal
 *  - logToToday(food, "x", ...) calls (Nutrition page helper)
 *  - addAndLog(food, <expr>, ...) calls, whose source expression may be a
 *    literal or a ternary of literals
 */

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const srcDir = resolve(repoRoot, "src");
const entityPath = resolve(repoRoot, "base44/entities/FoodLogEntry.jsonc");

function readJsonc(path) {
  const text = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

function listSourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(name) ? [full] : [];
  });
}

// Returns the text between the parentheses of the call starting at `openIndex`.
function callArguments(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return "";
}

// Splits top-level call arguments on commas (ignores nested brackets).
function splitArguments(args) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(args.slice(start));
  return parts.map((part) => part.trim());
}

const stringLiterals = (expr) => [...expr.matchAll(/["']([A-Za-z0-9_-]+)["']/g)].map((m) => m[1]);

function collectSourceUses() {
  const uses = [];
  for (const file of listSourceFiles(srcDir)) {
    const text = readFileSync(file, "utf8");
    const rel = relative(repoRoot, file);
    for (const match of text.matchAll(/\b(logFoodEntry|logFoodEntries|logToToday|addAndLog)\s*\(/g)) {
      // Skip declarations such as `const logToToday = async (...)`.
      const before = text.slice(Math.max(0, match.index - 20), match.index);
      if (/(const|function)\s+$/.test(before)) continue;
      const args = callArguments(text, match.index + match[0].length - 1);
      const name = match[1];
      if (name === "logFoodEntry" || name === "logFoodEntries") {
        for (const literal of args.matchAll(/\bsource\s*:\s*["']([A-Za-z0-9_-]+)["']/g)) {
          uses.push({ value: literal[1], where: `${rel} ${name}()` });
        }
      } else {
        const sourceArg = splitArguments(args)[1] ?? "";
        for (const value of stringLiterals(sourceArg)) {
          uses.push({ value, where: `${rel} ${name}()` });
        }
      }
    }
  }
  return uses;
}

test("FoodLogEntry.source enum covers every source the app writes", () => {
  const entity = readJsonc(entityPath);
  const allowed = new Set(entity.properties.source.enum);
  const uses = collectSourceUses();

  // Guard against the scanner silently matching nothing after a refactor.
  const found = new Set(uses.map((use) => use.value));
  for (const expected of ["search", "library", "manual", "barcode", "photo", "template", "repeat"]) {
    assert.ok(found.has(expected), `scanner did not find a FoodLogEntry source "${expected}" in src/`);
  }

  const unknown = uses.filter((use) => !allowed.has(use.value));
  assert.deepEqual(
    unknown,
    [],
    `FoodLogEntry source values missing from base44/entities/FoodLogEntry.jsonc enum: ${unknown
      .map((use) => `"${use.value}" (${use.where})`)
      .join(", ")}`
  );
});
