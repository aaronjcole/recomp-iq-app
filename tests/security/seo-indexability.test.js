import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { getRouteMetadata } from "../../src/lib/routeMetadata.js";
import {
  COMPARISON_SLUGS,
  LOCATION_SLUGS,
  PUBLIC_CANONICAL_PATHS,
  TIP_SLUGS
} from "../../src/lib/seo/publicRouteInventory.js";
import { comparisons } from "../../src/lib/seo/comparisonsData.js";
import { locations } from "../../src/lib/seo/locationsData.js";
import { tips } from "../../src/lib/seo/tipsData.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const siteUrl = "https://fitnesstrackerapps.com";

test("every canonical public route is indexable with exact metadata", () => {
  for (const path of PUBLIC_CANONICAL_PATHS) {
    const metadata = getRouteMetadata(path);
    assert.equal(metadata.robots, "index,follow", `${path} must be indexed`);
    assert.equal(metadata.canonicalUrl, `${siteUrl}${path}`, `${path} canonical must be exact`);
    assert.notEqual(metadata.title, "Page Not Found | RecompOne", `${path} needs route metadata`);
  }

  const home = getRouteMetadata("/");
  assert.equal(home.title, "RecompOne: Adaptive Body Recomposition");

  const comingSoon = getRouteMetadata("/coming-soon");
  assert.equal(comingSoon.canonicalUrl, `${siteUrl}/`);
  assert.equal(comingSoon.robots, "index,follow");
});

test("beta, authenticated, and unknown routes stay out of search", () => {

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
    "/missing",
    "/tips/not-a-real-tip",
    "/compare/not-a-real-comparison",
    "/locations/not-a-real-city"
  ]) {
    assert.equal(getRouteMetadata(path).robots, "noindex,follow", `${path} must not be indexed`);
  }
});

test("the lightweight public route inventory matches every content dataset", () => {
  assert.deepEqual([...TIP_SLUGS].sort(), tips.map(({ slug }) => slug).sort());
  assert.deepEqual([...COMPARISON_SLUGS].sort(), comparisons.map(({ slug }) => slug).sort());
  assert.deepEqual([...LOCATION_SLUGS].sort(), locations.map(({ slug }) => slug).sort());
});

test("static crawler files define the public index when Base44 generation is disabled", () => {
  const sitemapPath = resolve(repoRoot, "public/sitemap.xml");
  const robotsPath = resolve(repoRoot, "public/robots.txt");
  assert.equal(existsSync(sitemapPath), true);
  assert.equal(existsSync(robotsPath), true);

  const sitemap = readFileSync(sitemapPath, "utf8");
  const robots = readFileSync(robotsPath, "utf8");
  const publicUrls = PUBLIC_CANONICAL_PATHS.map((path) => `${siteUrl}${path}`);
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
  for (const path of [
    "/",
    "/coming-soon",
    "/privacy",
    "/terms",
    "/support",
    "/delete-account",
    "/tools/tdee-calculator",
    "/tips/:slug",
    "/compare/:slug",
    "/locations/:slug"
  ]) {
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
  assert.match(html, /"@type": "SoftwareApplication"/);
  assert.match(html, /"operatingSystem": "Web, Android"/);
  assert.match(html, /recompone-logo-primary\.png/);

  const homepage = readFileSync(resolve(repoRoot, "src/pages/ComingSoon.jsx"), "utf8");
  assert.match(homepage, /"@type": "FAQPage"/);
  assert.match(homepage, /mainEntity: FAQS\.map/);
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
