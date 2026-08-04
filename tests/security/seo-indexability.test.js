import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("Base44 owns crawler files and the deployment checklist defines the public index", () => {
  assert.equal(existsSync(resolve(repoRoot, "public/sitemap.xml")), false);
  assert.equal(existsSync(resolve(repoRoot, "public/robots.txt")), false);

  const checklist = readFileSync(resolve(repoRoot, "docs/base44-seo-configuration.md"), "utf8");
  for (const path of ["/", "/privacy", "/terms", "/support", "/delete-account"]) {
    assert.ok(checklist.includes(`| \`${path}\` | Index |`));
  }
  for (const path of [
    "/hero",
    "/coming-soon",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password"
  ]) {
    assert.ok(checklist.includes(`| \`${path}\` | No index |`));
  }
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
