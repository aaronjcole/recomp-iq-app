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

  const comingSoon = getRouteMetadata("/coming-soon");
  assert.equal(comingSoon.canonicalUrl, `${siteUrl}/`);
  assert.equal(comingSoon.robots, "index,follow");

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

test("static crawler files define the public index when Base44 generation is disabled", () => {
  const sitemapPath = resolve(repoRoot, "public/sitemap.xml");
  const robotsPath = resolve(repoRoot, "public/robots.txt");
  assert.equal(existsSync(sitemapPath), true);
  assert.equal(existsSync(robotsPath), true);

  const sitemap = readFileSync(sitemapPath, "utf8");
  const robots = readFileSync(robotsPath, "utf8");
  const publicUrls = [
    `${siteUrl}/`,
    `${siteUrl}/privacy`,
    `${siteUrl}/terms`,
    `${siteUrl}/support`,
    `${siteUrl}/delete-account`
  ];
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(sitemapUrls, publicUrls);

  for (const url of publicUrls) {
    assert.ok(sitemap.includes(`<loc>${url}</loc>`));
  }
  for (const path of [
    "/hero",
    "/coming-soon",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password"
  ]) {
    assert.ok(!sitemap.includes(`<loc>${siteUrl}${path}</loc>`));
  }
  assert.ok(robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`));

  const checklist = readFileSync(resolve(repoRoot, "docs/base44-seo-configuration.md"), "utf8");
  for (const path of ["/", "/coming-soon", "/privacy", "/terms", "/support", "/delete-account"]) {
    assert.ok(checklist.includes(`| \`${path}\` | Index |`));
  }
  for (const path of [
    "/hero",
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

  // Root redirects authenticated users to /today and unauthenticated users to /coming-soon.
  assert.match(app, /path="\/" element=\{<RootRedirect \/>\}/);
  // Marketing page is accessible at /coming-soon; /hero is the landing page.
  assert.match(app, /path="\/coming-soon" element=\{<PublicHome \/>\}/);
  assert.match(app, /path="\/hero" element=\{<Hero \/>\}/);
  assert.match(publicHome, /return <ComingSoon \/>/);
  assert.doesNotMatch(publicHome, /location\.hostname|isPromoDomain/);
});
