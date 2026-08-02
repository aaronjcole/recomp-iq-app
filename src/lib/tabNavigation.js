export const ROOT_TAB_PATHS = Object.freeze([
  "/today",
  "/nutrition",
  "/training",
  "/progress",
  "/more"
]);

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return pathname || "/";
  return pathname.replace(/\/+$/, "");
}

export function getTabRootPath(pathname) {
  const normalizedPath = normalizePathname(pathname);
  return (
    ROOT_TAB_PATHS.find(
      (rootPath) =>
        normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}/`)
    ) || null
  );
}

export function isTabRootPath(pathname) {
  const normalizedPath = normalizePathname(pathname);
  return ROOT_TAB_PATHS.includes(normalizedPath);
}
