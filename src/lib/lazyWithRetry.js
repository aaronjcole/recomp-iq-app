import { lazy } from "react";

// After a Base44 republish, a returning user on a stale index.html requests
// chunk hashes that no longer exist, and every React.lazy import rejects. This
// retries the dynamic import, and if it still fails, does ONE hard reload to
// fetch the fresh index.html — guarded so it can never loop.
//
// The guard is a timestamp: at most one recovery reload per RELOAD_WINDOW_MS.
// It is never cleared by a successful load. Signed-in routes nest several lazy
// chunks (RecompGate, RequireOnboarding, AppLayout, then the page), so an
// unrelated chunk always loads before a failing page chunk; clearing the guard
// on any success (or on every entry run, as main.jsx once did) re-armed the
// reload on every page load and a persistently failing chunk (a partial deploy,
// a CDN 404, a cached shell offline) reloaded the app forever.

const RELOAD_KEY = "recompone_chunk_reload_at";
export const RELOAD_WINDOW_MS = 10 * 60 * 1000;

// Backstop for sessions where sessionStorage throws (Safari private mode, storage
// disabled): without it, a persistent failure would reload on every exhausted
// import. This in-memory flag survives until the reload actually navigates away.
let reloadedThisLoad = false;

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
  if (reloadedThisLoad) return; // in-memory guard, works even if storage throws
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY));
    // A clock that moved backwards (now < last) also counts as "too recent".
    if (last > 0 && now - last < RELOAD_WINDOW_MS) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage unavailable (e.g. private mode): the in-memory guard below still
    // prevents a reload loop within this page load.
  }
  reloadedThisLoad = true;
  window.location.reload();
}

// Retry a chunk import, then fall back to at most one reload per window.
export function loadChunkWithRecovery(factory) {
  return importWithRetry(factory, { retries: 2, onExhausted: hardReloadOnce });
}

export function lazyWithRetry(factory) {
  return lazy(() => loadChunkWithRecovery(factory));
}

// Vite emits this when a dynamically-imported module fails to load.
export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", () => hardReloadOnce());
}
