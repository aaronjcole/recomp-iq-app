import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  chromiumCandidates,
  pinnedInstallLooksComplete,
  resolveChromiumExecutable
} from "../../scripts/resolve-chromium.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

const PINNED = "/opt/pw-browsers/chromium-1234/chrome-linux64/chrome";
const PINNED_SHELL_DIR = "/opt/pw-browsers/chromium_headless_shell-1234";
const noEnv = {};
const noDirs = () => [];

// A complete `playwright install chromium`: headed build plus headless shell.
const fullInstall = (path) => path === PINNED || path === PINNED_SHELL_DIR;

test("the pinned browser is used untouched when it is fully installed", () => {
  // This is the CI path: `playwright install` puts both builds in place, so the
  // resolver must not redirect the run to some other Chromium.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" },
    exists: fullInstall,
    readDir: () => ["chromium-1234", "chromium_headless_shell-1234", "chromium-1194"]
  });
  assert.equal(result, undefined, "must defer to Playwright when the pinned build is complete");
});

test("a headed build without its headless shell is not treated as installed", () => {
  // The suite runs headless, which launches the separate shell build. Deferring
  // here fails with "Executable doesn't exist at .../chromium_headless_shell-...".
  assert.equal(pinnedInstallLooksComplete(PINNED, (path) => path === PINNED), false);
  assert.equal(pinnedInstallLooksComplete(PINNED, fullInstall), true);

  // Passing an executablePath launches that binary directly, so the headed build
  // is itself a valid answer here — and being the newest, it is the right one.
  const older = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" },
    exists: (path) => path === PINNED || path === older,
    readDir: () => ["chromium-1234", "chromium-1194"]
  });
  assert.equal(result, PINNED, "must launch a concrete binary rather than defer");

  // With the pinned build absent entirely, the older one is used.
  const withoutPinned = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" },
    exists: (path) => path === older,
    readDir: () => ["chromium-1234", "chromium-1194"]
  });
  assert.equal(withoutPinned, older);
});

test("an unrecognised browser layout trusts the headed binary", () => {
  // Custom install roots should not be forced through the shell heuristic.
  assert.equal(pinnedInstallLooksComplete("/custom/chrome", (path) => path === "/custom/chrome"), true);
  assert.equal(pinnedInstallLooksComplete(undefined, () => true), false);
});

test("an explicit override wins even over a fully installed pinned browser", () => {
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE: "/custom/chrome" },
    exists: () => true,
    readDir: noDirs
  });
  assert.equal(result, "/custom/chrome");
});

test("a missing pinned browser falls back to another build on the machine", () => {
  const available = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" },
    exists: (path) => path === available,
    readDir: () => ["chromium-1194", "chromium_headless_shell-1194", "ffmpeg-1011"]
  });
  assert.equal(result, available);
});

test("nothing is returned when no browser exists anywhere", () => {
  // Playwright should raise its own "run playwright install" error rather than
  // being handed a path that does not work.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: noEnv,
    exists: () => false,
    readDir: noDirs
  });
  assert.equal(result, undefined);
});

test("a system Chrome is used when no Playwright build is present", () => {
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: noEnv,
    exists: (path) => path === "/usr/bin/google-chrome",
    readDir: noDirs
  });
  assert.equal(result, "/usr/bin/google-chrome");
});

test("newer builds are preferred, compared numerically not as text", () => {
  const candidates = chromiumCandidates({
    env: { PLAYWRIGHT_BROWSERS_PATH: "/b" },
    readDir: () => ["chromium-999", "chromium-1194", "chromium-1080"]
  });
  const builds = candidates
    .map((path) => /chromium-(\d+)/.exec(path)?.[1])
    .filter(Boolean)
    .filter((build, index, all) => all.indexOf(build) === index);
  assert.deepEqual(builds, ["1194", "1080", "999"], "999 must not sort above 1194");
});

test("the headless shell is never offered as a browser", () => {
  const candidates = chromiumCandidates({
    env: { PLAYWRIGHT_BROWSERS_PATH: "/b" },
    readDir: () => ["chromium_headless_shell-1194", "chromium-1194"]
  });
  for (const candidate of candidates) {
    assert.ok(
      !candidate.includes("headless_shell"),
      `${candidate} cannot drive a headed run and must not be a candidate`
    );
  }
});

test("no candidates are invented when the browsers path is unset", () => {
  const candidates = chromiumCandidates({ env: noEnv, readDir: noDirs });
  assert.ok(
    candidates.every((path) => !path.includes("pw-browsers")),
    "must not guess at a Playwright browsers directory"
  );
  assert.ok(candidates.length > 0, "system locations should still be tried");
});

test("an unreadable browsers directory does not throw", () => {
  assert.doesNotThrow(() =>
    chromiumCandidates({
      env: { PLAYWRIGHT_BROWSERS_PATH: "/does/not/exist" },
      readDir: () => {
        throw new Error("ENOENT");
      }
    })
  );
});

test("the config applies the fallback to the chromium project", () => {
  const config = read("playwright.config.js");
  assert.match(config, /from "\.\/scripts\/resolve-chromium\.mjs"/);
  assert.match(
    config,
    /launchOptions: chromiumLaunchOptions\(\)/,
    "the resolved path must reach the browser that actually launches"
  );
  // A throwing resolver must degrade to Playwright's own behaviour, never break
  // the suite it is meant to unblock.
  assert.match(config, /catch \(error\) \{[\s\S]*?return \{\};/);
});
