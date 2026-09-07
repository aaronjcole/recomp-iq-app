const NATIVE_SHELL_USER_AGENT = /WixBrandedLiteApp/i;

/**
 * Detects the Base44 store wrapper without treating an installed web PWA as a
 * native build. The bridge is injected by the wrapper before app content runs;
 * the user-agent check preserves compatibility with wrapper revisions that
 * expose only their branded-app identifier.
 *
 * @param {(Window & { wixMobileNativeBridge?: unknown }) | null} [browserWindow]
 */
export function isNativeStoreShell(
  browserWindow = typeof window === "undefined" ? null : window
) {
  if (!browserWindow) return false;
  if (browserWindow.wixMobileNativeBridge) return true;
  return NATIVE_SHELL_USER_AGENT.test(browserWindow.navigator?.userAgent ?? "");
}
