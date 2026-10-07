// Delivering an export file to the user. A browser download (an <a download>
// for a blob) does not work inside the iOS or Android app shells' WebViews, so
// there the system share sheet is used when the WebView supports sharing files,
// and otherwise the user is pointed to the web app to download.

import { hasNativeIapBridge } from "./nativeIapBridge.js";
import { isNativeStoreShell } from "./nativeStoreShell.js";

export class ExportDeliveryUnavailable extends Error {
  constructor() {
    super("This app version can't save files. Open RecompOne in a web browser to download your export.");
    this.name = "ExportDeliveryUnavailable";
  }
}

export function exportFileName(kind, extension, now = new Date()) {
  const stamp = now.toISOString().slice(0, 10);
  return `recompone-${kind}-${stamp}.${extension}`;
}

/**
 * @param {{ name: string, text: string, type: string }} file
 * @param {Window & typeof globalThis} [browserWindow]
 * @returns {Promise<"shared" | "downloaded">}
 */
export async function deliverExportFile({ name, text, type }, browserWindow = window) {
  const nativeShell = hasNativeIapBridge(browserWindow) || isNativeStoreShell(browserWindow);
  const FileCtor = browserWindow.File;
  const nav = browserWindow.navigator;
  if (FileCtor && typeof nav?.share === "function" && typeof nav?.canShare === "function") {
    const file = new FileCtor([text], name, { type });
    if (nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return "shared";
    }
  }
  if (nativeShell) throw new ExportDeliveryUnavailable();

  const url = browserWindow.URL.createObjectURL(new browserWindow.Blob([text], { type }));
  try {
    const link = browserWindow.document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    browserWindow.document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked after the click has been handled, not before.
    browserWindow.setTimeout(() => browserWindow.URL.revokeObjectURL(url), 1000);
  }
  return "downloaded";
}
