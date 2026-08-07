// Finds a usable Chromium for the Playwright suite when the exact build this
// project pins is not on the machine.
//
// CI runs `npx playwright install --with-deps chromium`, so the pinned build is
// present and this resolver stays out of the way. Sandboxed dev containers often
// ship a *different* prebuilt Chromium and block the download, which made
// `npm run test:e2e` fail on browser resolution rather than on any real problem.
//
// Order of preference:
//   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE, if set — an explicit choice always wins.
//   2. Nothing at all, if Playwright's own pinned build is complete (the CI path).
//   3. A Chromium already under PLAYWRIGHT_BROWSERS_PATH, newest build first.
//   4. A system Chrome/Chromium install.
// Returning undefined leaves Playwright to raise its own "run playwright
// install" error, which is the right message when no browser exists anywhere.
//
// Every path is checked for being a *launchable regular file*, never mere
// existence: existsSync() is true for directories and for half-installed trees,
// and handing either to Playwright fails at launch. A directory named `chromium`
// under the browsers path would otherwise also mask the valid builds behind it.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

// The headless shell's directory name varies by platform
// (chrome-headless-shell-linux64, -mac-arm64, -win64, ...), so it is discovered
// rather than enumerated.
const SHELL_BINARIES = ["chrome-headless-shell", "chrome-headless-shell.exe", "headless_shell"];

/** Build number from a "chromium-1194" directory, or -1 when absent. */
function buildNumber(entry) {
  const match = /^chromium-(\d+)$/.exec(entry);
  return match ? Number(match[1]) : -1;
}

/**
 * Whether a path is something Playwright could actually launch: a regular file
 * carrying an execute bit. Directories, dangling symlinks and non-executable
 * files are all rejected.
 */
export function isLaunchable(path, { stat = statSync, platform = process.platform } = {}) {
  try {
    const stats = stat(path);
    if (!stats.isFile()) return false;
    if (platform === "win32") return true; // Execute bits are not meaningful there.
    return (stats.mode & 0o111) !== 0;
  } catch {
    return false; // Missing, unreadable, or a broken link.
  }
}

/**
 * The headless-shell binary inside a "chromium_headless_shell-<build>"
 * directory, or undefined when that directory holds no launchable binary — the
 * state an interrupted `playwright install` leaves behind.
 */
export function headlessShellExecutable(
  shellDir,
  { readDir = readdirSync, stat = statSync, platform = process.platform } = {}
) {
  const findIn = (dir) => {
    for (const name of SHELL_BINARIES) {
      const candidate = join(dir, name);
      if (isLaunchable(candidate, { stat, platform })) return candidate;
    }
    return undefined;
  };

  const direct = findIn(shellDir);
  if (direct) return direct;

  let entries = [];
  try {
    entries = readDir(shellDir);
  } catch {
    return undefined; // Directory missing or unreadable.
  }

  for (const entry of entries) {
    const found = findIn(join(shellDir, entry));
    if (found) return found;
  }
  return undefined;
}

/**
 * Whether Playwright can launch its pinned build without downloading anything.
 *
 * Checking the headed binary alone is not enough: in headless mode — the default
 * for this suite — Playwright launches a *separate* headless-shell build. A
 * machine can have one without the other, and deferring in that state fails with
 * "Executable doesn't exist at .../chromium_headless_shell-<build>/...".
 */
export function pinnedInstallLooksComplete(
  expectedPath,
  { readDir = readdirSync, stat = statSync, platform = process.platform } = {}
) {
  if (!expectedPath || !isLaunchable(expectedPath, { stat, platform })) return false;

  const match = /^(.*)[/\\]chromium-(\d+)[/\\]/.exec(expectedPath);
  if (!match) return true; // Unrecognised layout; trust the headed binary.

  const [, root, build] = match;
  const shellDir = join(root, `chromium_headless_shell-${build}`);
  return Boolean(headlessShellExecutable(shellDir, { readDir, stat, platform }));
}

/**
 * Chromium binaries worth trying, most preferred first. Pure apart from the
 * injected directory read, so the ordering can be tested.
 */
export function chromiumCandidates({ env = process.env, readDir = readdirSync } = {}) {
  const candidates = [];
  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH;

  if (browsersPath) {
    // Some images expose a stable symlink alongside the versioned directories.
    candidates.push(join(browsersPath, "chromium"));

    let entries = [];
    try {
      entries = readDir(browsersPath);
    } catch {
      entries = [];
    }

    // Newest build first. "chromium_headless_shell-*" is deliberately excluded:
    // the headless shell cannot drive a headed run.
    const versioned = entries
      .filter((entry) => buildNumber(entry) >= 0)
      .sort((a, b) => buildNumber(b) - buildNumber(a));

    for (const entry of versioned) {
      candidates.push(join(browsersPath, entry, "chrome-linux64", "chrome"));
      candidates.push(join(browsersPath, entry, "chrome-linux", "chrome"));
    }
  }

  candidates.push(...SYSTEM_CANDIDATES);
  return candidates;
}

/**
 * Absolute path to the Chromium that should override Playwright's own, or
 * undefined to leave Playwright's resolution untouched.
 *
 * @param {object}  options
 * @param {string} [options.expectedPath] What Playwright itself wants to launch.
 */
export function resolveChromiumExecutable({
  expectedPath,
  env = process.env,
  readDir = readdirSync,
  stat = statSync,
  platform = process.platform
} = {}) {
  const override = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override) return override;

  // The pinned build is fully installed — this is CI, so change nothing.
  if (pinnedInstallLooksComplete(expectedPath, { readDir, stat, platform })) return undefined;

  // Skip past anything unlaunchable so a directory or stub cannot mask a working
  // browser listed after it.
  for (const candidate of chromiumCandidates({ env, readDir })) {
    if (isLaunchable(candidate, { stat, platform })) return candidate;
  }

  return undefined;
}
