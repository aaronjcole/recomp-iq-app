import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { enabledFromEnvironment, featureFlags } from "../../src/lib/featureFlags.js";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../../src/lib/support.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("body-composition analysis is disabled unless explicitly enabled", () => {
  assert.equal(featureFlags.bodyCompositionScan, false);
  assert.equal(enabledFromEnvironment(undefined), false);
  assert.equal(enabledFromEnvironment("false"), false);
  assert.equal(enabledFromEnvironment("TRUE"), false);
  assert.equal(enabledFromEnvironment("true"), true);

  const progressSource = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  assert.match(progressSource, /featureFlags\.bodyCompositionScan\s*&&\s*<BodyCompositionScan/);
});

test("support contact is consistent and exposed in the app and privacy policy", () => {
  assert.equal(SUPPORT_EMAIL, "recompappsupport@gmail.com");
  assert.equal(SUPPORT_MAILTO, `mailto:${SUPPORT_EMAIL}`);

  for (const path of ["src/pages/More.jsx", "src/pages/Privacy.jsx"]) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    assert.match(source, /SUPPORT_EMAIL/);
    assert.match(source, /SUPPORT_MAILTO/);
  }
});
