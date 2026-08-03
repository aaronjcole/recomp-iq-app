import { lazy } from "react";

// After a Base44 republish, a returning user on a stale index.html requests
// chunk hashes that no longer exist, and every React.lazy import rejects. This
// retries the dynamic import, and if it still fails, does ONE hard reload to
// fetch the fresh index.html — guarded so it can never loop.

const RELOAD_KEY = "recompone_chunk_reloaded";

export async function importWithRetry(factory, { retries = 1, onExhausted } = {}) {
  try {
    return await factory();
  } catch (error) {
    if (retries > 0) return importWithRetry(factory, { retries: retries - 1, onExhausted });
    if (onExhausted) onExhausted(error);
    throw error;
  }
}

function hardReloadOnce() {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(RELOAD_KEY)) return; // already tried this session
    window.sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // If storage is unavailable, fall through to a single reload attempt.
  }
  window.location.reload();
}

// Clear the guard once the app has successfully loaded, so a later genuine
// stale-chunk event can reload again.
export function markChunksLoaded() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // no-op
  }
}

export function lazyWithRetry(factory) {
  return lazy(() => importWithRetry(factory, { retries: 2, onExhausted: hardReloadOnce }));
}

// Vite emits this when a dynamically-imported module fails to load.
export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", () => hardReloadOnce());
}
