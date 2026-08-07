import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("metadata text uses the rem-based label token", () => {
  const config = readFileSync(resolve(repoRoot, "tailwind.config.js"), "utf8");
  assert.match(config, /fontSize:\s*\{[\s\S]*?label:\s*["']0\.75rem["']/);

  const adHocPixels = sourceFiles(resolve(repoRoot, "src")).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return source.includes("text-[10px]") ? [path.slice(repoRoot.length + 1)] : [];
  });
  assert.deepEqual(adHocPixels, []);
});
