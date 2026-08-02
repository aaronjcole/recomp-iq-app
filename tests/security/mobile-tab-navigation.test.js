import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTabRootPath,
  isTabRootPath,
  ROOT_TAB_PATHS
} from "../../src/lib/tabNavigation.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("tab sub-routes resolve to their persistent navigation root", () => {
  assert.deepEqual(ROOT_TAB_PATHS, [
    "/today",
    "/nutrition",
    "/training",
    "/progress",
    "/more"
  ]);
  assert.equal(getTabRootPath("/more/coach"), "/more");
  assert.equal(getTabRootPath("/more/profile/"), "/more");
  assert.equal(getTabRootPath("/progress"), "/progress");
  assert.equal(getTabRootPath("/privacy"), null);
  assert.equal(isTabRootPath("/more"), true);
  assert.equal(isTabRootPath("/more/decisions"), false);
});

test("legacy child links redirect into the More tab hierarchy", () => {
  const appSource = readFileSync(resolve(repoRoot, "src/App.jsx"), "utf8");
  for (const [legacyPath, nestedPath] of [
    ["/coach", "/more/coach"],
    ["/profile", "/more/profile"],
    ["/decisions", "/more/decisions"],
    ["/plan", "/more/plan"]
  ]) {
    assert.match(appSource, new RegExp(`path=["']${nestedPath}["']`));
    assert.match(
      appSource,
      new RegExp(`path=["']${legacyPath}["'][^>]+to=["']${nestedPath}["'][^>]+replace`)
    );
  }
});

test("pull-to-refresh yields to charts and horizontal swipe gestures", () => {
  const pullSource = readFileSync(
    resolve(repoRoot, "src/components/common/PullToRefresh.jsx"),
    "utf8"
  );
  assert.match(pullSource, /data-pull-to-refresh-ignore/);
  assert.match(pullSource, /\.recharts-wrapper/);
  assert.match(pullSource, /Math\.abs\(deltaX\) > Math\.abs\(d\)/);
  assert.match(pullSource, /onTouchCancel=\{resetPull\}/);

  const progressSource = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  assert.match(progressSource, /data-pull-to-refresh-ignore/);
});
