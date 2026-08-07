import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  chromiumCandidates,
  headlessShellExecutable,
  isLaunchable,
  pinnedInstallLooksComplete,
  resolveChromiumExecutable
} from "../../scripts/resolve-chromium.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

const ROOT = "/opt/pw-browsers";
const PINNED = `${ROOT}/chromium-1234/chrome-linux64/chrome`;
const PINNED_SHELL_DIR = `${ROOT}/chromium_headless_shell-1234`;
const PINNED_SHELL_BIN = `${PINNED_SHELL_DIR}/chrome-headless-shell-linux64/chrome-headless-shell`;
const OLDER = `${ROOT}/chromium-1194/chrome-linux/chrome`;

/**
 * Fake stat: `files` are launchable regular files, `dirs` are directories, and
 * `stubs` are regular files with no execute bit. Anything else does not exist.
 */
const fakeStat = ({ files = [], dirs = [], stubs = [] } = {}) => (path) => {
  if (files.includes(path)) return { isFile: () => true, mode: 0o755 };
  if (stubs.includes(path)) return { isFile: () => true, mode: 0o644 };
  if (dirs.includes(path)) return { isFile: () => false, mode: 0o755 };
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

// A complete `playwright install chromium`: headed binary plus a real shell binary.
const completeInstall = fakeStat({
  files: [PINNED, PINNED_SHELL_BIN],
  dirs: [ROOT, PINNED_SHELL_DIR, `${PINNED_SHELL_DIR}/chrome-headless-shell-linux64`]
});
const completeDirs = (dir) =>
  dir === PINNED_SHELL_DIR ? ["chrome-headless-shell-linux64"] : [];

test("a launchable path must be a regular file with an execute bit", () => {
  assert.equal(isLaunchable("/a/chrome", { stat: fakeStat({ files: ["/a/chrome"] }) }), true);
  assert.equal(isLaunchable("/a/dir", { stat: fakeStat({ dirs: ["/a/dir"] }) }), false);
  assert.equal(isLaunchable("/a/stub", { stat: fakeStat({ stubs: ["/a/stub"] }) }), false);
  assert.equal(isLaunchable("/a/missing", { stat: fakeStat() }), false);
  // Windows has no execute bit, so a regular file is enough there.
  assert.equal(
    isLaunchable("/a/stub", { stat: fakeStat({ stubs: ["/a/stub"] }), platform: "win32" }),
    true
  );
});

test("the pinned browser is used untouched when it is fully installed", () => {
  // The CI path: both builds present, so the resolver must not redirect the run.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: ROOT },
    stat: completeInstall,
    readDir: completeDirs
  });
  assert.equal(result, undefined, "must defer to Playwright when the pinned build is complete");
});

test("an empty headless-shell directory is not a complete install", () => {
  // What an interrupted `playwright install` leaves behind. Checking only that the
  // directory exists made this look complete, and the run then died with
  // "Executable doesn't exist at .../chromium_headless_shell-1234/...".
  const emptyShell = fakeStat({ files: [PINNED, OLDER], dirs: [ROOT, PINNED_SHELL_DIR] });
  assert.equal(
    pinnedInstallLooksComplete(PINNED, { stat: emptyShell, readDir: () => [] }),
    false
  );

  // …and the run is rescued by falling back to a real binary.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: ROOT },
    stat: emptyShell,
    readDir: (dir) => (dir === ROOT ? ["chromium-1234", "chromium-1194"] : [])
  });
  assert.equal(result, PINNED, "must launch a concrete binary rather than defer");
});

test("a headless shell present but not executable is not a complete install", () => {
  const stubShell = fakeStat({
    files: [PINNED],
    stubs: [PINNED_SHELL_BIN],
    dirs: [ROOT, PINNED_SHELL_DIR, `${PINNED_SHELL_DIR}/chrome-headless-shell-linux64`]
  });
  assert.equal(pinnedInstallLooksComplete(PINNED, { stat: stubShell, readDir: completeDirs }), false);
});

test("a headed build without any headless shell is not a complete install", () => {
  const headedOnly = fakeStat({ files: [PINNED], dirs: [ROOT] });
  assert.equal(pinnedInstallLooksComplete(PINNED, { stat: headedOnly, readDir: () => [] }), false);
  assert.equal(pinnedInstallLooksComplete(PINNED, { stat: completeInstall, readDir: completeDirs }), true);
});

test("the shell binary is found whatever the platform directory is named", () => {
  for (const inner of [
    "chrome-headless-shell-linux64",
    "chrome-headless-shell-mac-arm64",
    "chrome-headless-shell-win64"
  ]) {
    const bin = `${PINNED_SHELL_DIR}/${inner}/chrome-headless-shell`;
    const found = headlessShellExecutable(PINNED_SHELL_DIR, {
      stat: fakeStat({ files: [bin], dirs: [PINNED_SHELL_DIR, `${PINNED_SHELL_DIR}/${inner}`] }),
      readDir: () => [inner]
    });
    assert.equal(found, bin, `${inner} layout must be discovered`);
  }
});

test("an unlaunchable candidate does not mask a working browser behind it", () => {
  // A directory named `chromium` under the browsers path is the realistic case:
  // existsSync() is true for it, which previously short-circuited the search.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_BROWSERS_PATH: ROOT },
    stat: fakeStat({ files: [OLDER], dirs: [ROOT, `${ROOT}/chromium`] }),
    readDir: (dir) => (dir === ROOT ? ["chromium-1194"] : [])
  });
  assert.equal(result, OLDER, "the directory must be skipped, not returned");
});

test("an explicit override wins even over a fully installed pinned browser", () => {
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE: "/custom/chrome" },
    stat: completeInstall,
    readDir: completeDirs
  });
  assert.equal(result, "/custom/chrome");
});

test("an unrecognised browser layout trusts the headed binary", () => {
  assert.equal(
    pinnedInstallLooksComplete("/custom/chrome", { stat: fakeStat({ files: ["/custom/chrome"] }) }),
    true
  );
  assert.equal(pinnedInstallLooksComplete(undefined, { stat: fakeStat() }), false);
});

test("nothing is returned when no browser exists anywhere", () => {
  // Playwright should raise its own "run playwright install" error rather than
  // being handed a path that cannot launch.
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: {},
    stat: fakeStat(),
    readDir: () => []
  });
  assert.equal(result, undefined);
});

test("a system Chrome is used when no Playwright build is present", () => {
  const result = resolveChromiumExecutable({
    expectedPath: PINNED,
    env: {},
    stat: fakeStat({ files: ["/usr/bin/google-chrome"] }),
    readDir: () => []
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
  const candidates = chromiumCandidates({ env: {}, readDir: () => [] });
  assert.ok(
    candidates.every((path) => !path.includes("pw-browsers")),
    "must not guess at a Playwright browsers directory"
  );
  assert.ok(candidates.length > 0, "system locations should still be tried");
});

test("an unreadable browsers directory does not throw", () => {
  const boom = () => {
    throw new Error("EACCES");
  };
  assert.doesNotThrow(() =>
    chromiumCandidates({ env: { PLAYWRIGHT_BROWSERS_PATH: "/nope" }, readDir: boom })
  );
  assert.doesNotThrow(() => headlessShellExecutable("/nope", { readDir: boom, stat: fakeStat() }));
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
