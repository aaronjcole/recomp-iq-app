import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("the app follows the operating system reduced-motion preference", () => {
  const layout = read("src/components/AppLayout.jsx");
  assert.match(layout, /import \{[^}]*MotionConfig[^}]*\} from "framer-motion"/);
  assert.match(layout, /<MotionConfig reducedMotion="user">/);

  const css = read("src/index.css");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /animation-iteration-count:\s*1\s*!important/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});
