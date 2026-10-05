import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  bundleDeclaresRoute,
  cspBlocksThirdPartyFraming,
  frameAncestorsDirectives,
  isRestrictiveFrameAncestors,
  moduleScriptPaths,
  publicRouteProblems,
  referencedChunkPaths,
} from "../../scripts/lib/android-release-checks.mjs";

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

test("live release verification rejects a frameable production origin", () => {
  const verifier = readFileSync(
    resolve(repoRoot, "scripts/verify-android-release.mjs"),
    "utf8",
  );
  assert.match(verifier, /content-security-policy/i);
  assert.match(verifier, /frame-ancestors/i);
  assert.match(verifier, /x-frame-options/i);
  assert.match(verifier, /DENY|SAMEORIGIN/);
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
  const primaryLogoPath = resolve(repoRoot, "public/brand/recompone-logo-primary.png");
  const faviconPath = resolve(repoRoot, "public/icons/recompone-32.png");
  const appIconPath = resolve(repoRoot, "docs/play-store/app-icon-512.png");
  const featureGraphicPath = resolve(repoRoot, "docs/play-store/feature-graphic-1024x500.png");

  const primaryLogo = readFileSync(primaryLogoPath);
  const favicon = readFileSync(faviconPath);
  const appIcon = readFileSync(appIconPath);
  const featureGraphic = readFileSync(featureGraphicPath);
  assert.deepEqual([primaryLogo.readUInt32BE(16), primaryLogo.readUInt32BE(20)], [1024, 1024]);
  assert.deepEqual([favicon.readUInt32BE(16), favicon.readUInt32BE(20)], [32, 32]);
  assert.deepEqual([appIcon.readUInt32BE(16), appIcon.readUInt32BE(20)], [512, 512]);
  assert.deepEqual(
    [featureGraphic.readUInt32BE(16), featureGraphic.readUInt32BE(20)],
    [1024, 500],
  );
  assert.equal(featureGraphic[25], 2, "feature graphic must be opaque RGB PNG");
  assert.ok(statSync(appIconPath).size <= 1_048_576, "Play icon must be at most 1 MB");
  assert.ok(statSync(featureGraphicPath).size <= 15_728_640, "feature graphic must be at most 15 MB");

  const indexSource = readFileSync(resolve(repoRoot, "index.html"), "utf8");
  assert.match(indexSource, /recompone-32\.png/);
  assert.doesNotMatch(indexSource, /recompone-icon\.svg/);

  for (const path of ["src/components/AppSplash.jsx", "src/pages/Hero.jsx", "src/pages/ComingSoon.jsx"]) {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    assert.match(source, /BrandMark/);
    assert.doesNotMatch(source, /<Target/);
  }
});

test("frame-ancestors passes only for 'none' or 'self' plus exact https origins", () => {
  for (const restrictive of [
    "'none'",
    "'self'",
    "'SELF'",
    "'self' https://app.base44.com",
    "'self' https://partner.example.com:8443",
  ]) {
    assert.equal(isRestrictiveFrameAncestors(restrictive), true, restrictive);
  }
  for (const permissive of [
    "",
    "*",
    "https:",
    "https: 'self'",
    "'self' https:",
    "https://*",
    "'self' https://*",
    "*.com",
    "'self' *.com",
    "'self' https://*.example.com",
    "'self' http://example.com",
    "'self' https://example.com/embed",
    "https://example.com",
    "'none' https://example.com",
  ]) {
    assert.equal(isRestrictiveFrameAncestors(permissive), false, permissive);
  }

  assert.deepEqual(
    frameAncestorsDirectives("default-src 'self'; frame-ancestors 'none'; img-src *"),
    ["'none'"],
  );
  assert.equal(cspBlocksThirdPartyFraming("default-src 'self'"), false);
  assert.equal(cspBlocksThirdPartyFraming("frame-ancestors https: 'self'"), false);
  assert.equal(cspBlocksThirdPartyFraming("frame-ancestors *, frame-ancestors 'self'"), true);
  assert.equal(cspBlocksThirdPartyFraming(null), false);
});

test("public route check distinguishes a real route from the SPA catch-all", () => {
  const html = `<!doctype html><script type="application/ld+json">{}</script>
    <script type="module" crossorigin src="/assets/index-B5UiyPWm.js"></script>`;
  assert.deepEqual(moduleScriptPaths(html), ["/assets/index-B5UiyPWm.js"]);

  const routeEntry = 'h.jsx(I,{path:"/delete-account",element:h.jsx(fm,{})}),';
  const entry = [
    'const fm=F(()=>B(()=>import("./DeleteAccount-LMlwP1kH.js"),__vite__mapDeps([1])));',
    'const m=["assets/Privacy-C8HqJJ-Y.js"];',
    'h.jsx(I,{path:"/privacy",element:h.jsx(pm,{})}),',
    routeEntry,
    'h.jsx(I,{path:"*",element:h.jsx(NotFound,{})})',
  ].join("");
  assert.equal(bundleDeclaresRoute(entry, "/delete-account"), true);
  assert.equal(bundleDeclaresRoute(entry, "/delete"), false);
  assert.deepEqual(referencedChunkPaths(entry).sort(), [
    "./DeleteAccount-LMlwP1kH.js",
    "assets/Privacy-C8HqJJ-Y.js",
  ]);

  const title = "Delete your RecompOne account";
  const pageChunk = `return e.jsxs(o,{title:"${title}",children:[]})`;
  const path = "/delete-account";
  assert.deepEqual(
    publicRouteProblems({ entrySources: [entry], chunkSources: [pageChunk], path, title }),
    [],
  );

  // A removed route still gets the catch-all's 200 HTML, but the router and
  // chunks no longer carry it.
  assert.equal(
    publicRouteProblems({
      entrySources: [entry.replace(routeEntry, "")],
      chunkSources: [],
      path,
      title,
    }).length,
    2,
  );
  assert.notDeepEqual(
    publicRouteProblems({
      entrySources: [entry],
      chunkSources: ['children:"Page not found"'],
      path,
      title,
    }),
    [],
  );
  assert.notDeepEqual(
    publicRouteProblems({ entrySources: [entry], chunkSources: [pageChunk], path }),
    [],
  );
});

test("every Play submission route has an expected page title for the live check", () => {
  assert.deepEqual(
    Object.keys(release.requiredPublicPageTitles).sort(),
    [...release.requiredPublicPaths].sort(),
  );
  for (const title of Object.values(release.requiredPublicPageTitles)) {
    assert.ok(title.length >= 8, `${title} is too generic to identify a page`);
  }
});
