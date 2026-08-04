import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { getRouteMetadata } from "../../src/lib/routeMetadata.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const siteUrl = "https://fitnesstrackerapps.com";

test("the canonical homepage is indexable while beta and app routes stay out of search", () => {
  const home = getRouteMetadata("/");
  assert.equal(home.title, "RecompOne: Adaptive Body Recomposition");
  assert.equal(home.canonicalUrl, `${siteUrl}/`);
  assert.equal(home.robots, "index,follow");

  const legacyComingSoon = getRouteMetadata("/coming-soon");
  assert.equal(legacyComingSoon.canonicalUrl, `${siteUrl}/`);
  assert.equal(legacyComingSoon.robots, "noindex,follow");

  for (const path of [
    "/hero",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/onboarding",
    "/today",
    "/nutrition",
    "/training",
    "/progress",
    "/more",
    "/missing"
  ]) {
    assert.equal(getRouteMetadata(path).robots, "noindex,follow", `${path} must not be indexed`);
  }
});

test("the sitemap contains only canonical public pages", () => {
  const sitemap = readFileSync(resolve(repoRoot, "public/sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.deepEqual(locations, [
    `${siteUrl}/`,
    `${siteUrl}/privacy`,
    `${siteUrl}/terms`,
    `${siteUrl}/support`,
    `${siteUrl}/delete-account`
  ]);
  assert.doesNotMatch(sitemap, /\/(?:hero|coming-soon|login|register|coach|plan|profile|decisions)<\/loc>/);
});

test("the static document exposes canonical, social, and organization metadata", () => {
  const html = readFileSync(resolve(repoRoot, "index.html"), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/fitnesstrackerapps\.com\/" \/>/);
  assert.match(html, /<meta name="robots" content="index,follow" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/fitnesstrackerapps\.com\/" \/>/);
  assert.match(html, /"@type": "WebSite"/);
  assert.match(html, /"@type": "Organization"/);
  assert.match(html, /recompone-logo-primary\.png/);
});

test("routing keeps the marketing homepage and beta gateway intentionally separate", () => {
  const app = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  const publicHome = readFileSync(resolve(repoRoot, "src/components/PublicHome.jsx"), "utf8");

  assert.match(app, /path="\/" element=\{<PublicHome \/>\}/);
  assert.match(app, /path="\/hero" element=\{<Hero \/>\}/);
  assert.match(app, /path="\/coming-soon" element=\{<Navigate to="\/" replace \/>\}/);
  assert.match(publicHome, /return <ComingSoon \/>/);
  assert.doesNotMatch(publicHome, /location\.hostname|isPromoDomain/);
});
