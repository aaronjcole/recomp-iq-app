import { getTabRootPath, isTabRootPath } from "./tabNavigation.js";

// Entry points a signed-out user lands on (directly or via RootRedirect /
// ProtectedRoute). Back from here must leave the app: navigating to "/" would
// just redirect back to /login and trap the user in a Back loop.
export const PUBLIC_EXIT_PATHS = Object.freeze([
  "/",
  "/login",
  "/coming-soon",
  "/hero"
]);

// Auth flow pages reached from an entry point. With in-app history Back returns
// to that entry point; without it (deep link at idx 0) Back leaves the app.
export const PUBLIC_AUTH_PATHS = Object.freeze([
  "/register",
  "/forgot-password",
  "/reset-password"
]);

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * Decide what the Android hardware Back button should do.
 * @param {string} pathname current location pathname
 * @param {number} historyIdx react-router history index (window.history.state.idx)
 * @returns {{ type: "exit" } | { type: "back" } | { type: "navigate", to: string, replace: boolean }}
 */
export function resolveAndroidBack(pathname, historyIdx) {
  const path = normalizePathname(pathname);
  const idx = Number.isInteger(historyIdx) && historyIdx > 0 ? historyIdx : 0;

  if (isTabRootPath(path) || PUBLIC_EXIT_PATHS.includes(path)) {
    return { type: "exit" };
  }
  if (idx > 0) {
    return { type: "back" };
  }
  if (PUBLIC_AUTH_PATHS.includes(path)) {
    return { type: "exit" };
  }
  const tabRootPath = getTabRootPath(path);
  if (tabRootPath) {
    return { type: "navigate", to: tabRootPath, replace: true };
  }
  return { type: "navigate", to: "/", replace: false };
}
