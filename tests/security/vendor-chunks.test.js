import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("the production build isolates stable React framework dependencies", () => {
  const config = readFileSync(resolve(repoRoot, "vite.config.js"), "utf8");
  assert.match(config, /manualChunks:\s*\{/);
  assert.match(
    config,
    /["']react-vendor["']:\s*\[[^\]]*["']react["'][^\]]*["']react-dom["'][^\]]*["']react-router-dom["'][^\]]*\]/
  );
});
