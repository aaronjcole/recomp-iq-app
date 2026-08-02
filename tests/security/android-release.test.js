import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const release = JSON.parse(
  readFileSync(resolve(repoRoot, "android/play-release.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "public/manifest.json"), "utf8"),
);

test("Android release identity stays aligned with the Base44 mobile package", () => {
  assert.equal(release.packagingProvider, "base44");
  assert.equal(release.base44AppId, "6a68bb922bf88da5ec767da3");
  assert.equal(release.packageName, `com.base${release.base44AppId}.app`);
  assert.equal(release.webOrigin, "https://recomp-iq.base44.app");
  assert.equal(release.minimumTargetSdk, 36);
  assert.equal(release.expectedWrapperType, "base44-webview");
  assert.match(release.base44UploadCertificateSha256, /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/);
  assert.match(release.base44ManagedManifestPath, new RegExp(release.base44AppId));
});

test("Android packaging requirements match the published PWA contract", () => {
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, release.requiredDisplayMode);
  assert.equal(manifest.orientation, release.requiredOrientation);
  assert.equal(manifest.theme_color, release.requiredThemeColor);
  assert.equal(manifest.background_color, release.requiredBackgroundColor);

  for (const expected of [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ]) {
    assert.ok(
      manifest.icons.some((icon) => (
        icon.sizes === expected[0] && icon.purpose?.split(/\s+/).includes(expected[1])
      )),
      `missing ${expected.join(" ")} icon`,
    );
  }
});

test("Android release config rejects undeclared sensitive native capabilities", () => {
  assert.deepEqual(release.requiredAndroidPermissions, ["android.permission.INTERNET"]);
  assert.ok(release.reviewAndroidPermissions.includes("android.permission.CAMERA"));
  for (const permission of [
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.BODY_SENSORS",
    "android.permission.CALL_PHONE",
    "android.permission.RECORD_AUDIO",
    "android.permission.READ_CONTACTS",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.READ_MEDIA_AUDIO",
    "android.permission.MANAGE_EXTERNAL_STORAGE",
  ]) {
    assert.ok(release.forbiddenAndroidPermissions.includes(permission));
  }
  assert.deepEqual(release.forbiddenRequiredAndroidFeatures, [
    "android.hardware.bluetooth",
    "android.hardware.location",
  ]);
});

test("Play submission routes remain public and machine-listed", () => {
  assert.deepEqual(release.requiredPublicPaths, [
    "/privacy",
    "/terms",
    "/support",
    "/delete-account",
  ]);

  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  for (const path of release.requiredPublicPaths) {
    assert.match(appSource, new RegExp(`path=["']${path}["']`));
  }
});

test("Play listing core images use Google's required dimensions", () => {
  const appIconPath = resolve(repoRoot, "docs/play-store/app-icon-512.png");
  const featureGraphicPath = resolve(repoRoot, "docs/play-store/feature-graphic-1024x500.png");

  const appIcon = readFileSync(appIconPath);
  const featureGraphic = readFileSync(featureGraphicPath);
  assert.deepEqual([appIcon.readUInt32BE(16), appIcon.readUInt32BE(20)], [512, 512]);
  assert.deepEqual(
    [featureGraphic.readUInt32BE(16), featureGraphic.readUInt32BE(20)],
    [1024, 500],
  );
  assert.equal(featureGraphic[25], 2, "feature graphic must be opaque RGB PNG");
  assert.ok(statSync(appIconPath).size <= 1_048_576, "Play icon must be at most 1 MB");
  assert.ok(statSync(featureGraphicPath).size <= 15_728_640, "feature graphic must be at most 15 MB");
});
