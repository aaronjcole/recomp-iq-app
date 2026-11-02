import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("the production build isolates stable React framework dependencies", () => {
  const config = readFileSync(resolve(repoRoot, "vite.config.js"), "utf8");
  // Vite 8 (Rolldown) removed the object form of manualChunks.
  assert.match(config, /manualChunks\s*\(\s*id\s*\)\s*\{/);
  assert.match(config, /["']react-vendor["']/);
  for (const pkg of ["react", "react-dom", "react-router-dom"]) {
    assert.ok(config.includes(`'${pkg}'`), `vite.config.js must keep ${pkg} in the framework chunk`);
  }
});