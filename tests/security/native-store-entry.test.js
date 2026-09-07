import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isNativeStoreShell } from "../../src/lib/nativeStoreShell.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("native store detection stays false for ordinary web and installed PWAs", () => {
  assert.equal(isNativeStoreShell(null), false);
  assert.equal(isNativeStoreShell({ navigator: { userAgent: "Mozilla/5.0 Safari/605.1" } }), false);
});

test("native store detection recognizes the Base44 bridge and branded wrapper", () => {
  assert.equal(
    isNativeStoreShell({ navigator: { userAgent: "Mozilla/5.0" }, wixMobileNativeBridge: {} }),
    true
  );
  assert.equal(
    isNativeStoreShell({ navigator: { userAgent: "WixBrandedLiteApp/2.131675.1" } }),
    true
  );
});

test("Apple authentication is enabled and offered beside Google authentication", () => {
  const authConfig = JSON.parse(readFileSync(resolve(repoRoot, "base44/auth/config.jsonc"), "utf8"));
  assert.equal(authConfig.enableAppleLogin, true);

  for (const path of ["src/pages/Login.jsx", "src/pages/Register.jsx"]) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    assert.match(source, /loginWithProvider\("apple"/);
    assert.match(source, /Continue with Apple/);
    assert.match(source, /loginWithProvider\("google"/);
  }
});
