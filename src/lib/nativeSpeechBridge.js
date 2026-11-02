export const MEAL_SPEECH_MAX_LENGTH = 4000;
const CAPTURE_MS = 60_000;
const FINISH_MS = 5_000;
let sequence = 0;
/**
 * Browser speech constructors are not included in TypeScript's DOM library.
 * Keep that extension local instead of loosening the application's Window.
 * @typedef {Window & { SpeechRecognition?: new () => any, webkitSpeechRecognition?: new () => any }} MealSpeechWindow
 */
/** @returns {MealSpeechWindow | null} */
const defaultWindow = () => typeof window === "undefined" ? null : /** @type {MealSpeechWindow} */ (window);

export function normalizeMealTranscript(value) {
  return typeof value === "string"
    ? value.slice(0, MEAL_SPEECH_MAX_LENGTH).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    : "";
}

function boundedPromise(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), ms); })
  ]).finally(() => clearTimeout(timer));
}

function nativeBridge(target) {
  const bridge = target?.recompOneSpeech;
  return bridge?.version === 1 && ["getCapabilities", "start", "stop", "cancel"].every((key) =>
    typeof bridge[key] === "function") ? bridge : null;
}

/** Permission-free capability handshake; old native shells never get a dead mic button. */
export async function getMealSpeechSupport(target = defaultWindow()) {
  if (!target || target.top !== target || target.isSecureContext === false || !target.navigator?.userActivation) return null;
  const bridge = nativeBridge(target);
  if (bridge) {
    try {
      const capabilities = await boundedPromise(Promise.resolve(bridge.getCapabilities()), 2000);
      if (capabilities?.available === true) return "native";
    } catch { /* Old/unavailable native module: try the browser, never wait forever. */ }
  }
  return typeof (target.SpeechRecognition || target.webkitSpeechRecognition) === "function" ? "browser" : null;
}

/** Final-text-only capture, owned by the mounting control. No persistence or backend calls. */
export function createMealSpeechCapture({ mode, onTranscript, onError, onState, target = defaultWindow() }) {
  let active = null;
  let disposed = false;

  function settle(session, error, text, abort = false) {
    if (active !== session) return;
    active = null;
    clearTimeout(session.timer);
    if (session.recognition) {
      const r = session.recognition;
      r.onresult = r.onerror = r.onend = null;
      if (abort) { try { r.abort(); } catch { /* Already ended. */ } }
    }
    onState?.("idle");
    if (disposed || error === "cancelled") return;
    if (error) onError?.(error);
    else {
      const final = normalizeMealTranscript(text);
      if (final) onTranscript(final);
      else onError?.("no-speech");
    }
  }

  function cancelNative(session) {
    try { void boundedPromise(Promise.resolve(session.bridge.cancel(session.id)), 2000).catch(() => {}); }
    catch { /* The page/shell may already be gone. */ }
  }

  function cancel() {
    const session = active;
    if (!session) return;
    // Invalidate FIRST: even a synchronous native/browser result is discarded.
    settle(session, "cancelled", null, true);
    if (session.bridge) cancelNative(session);
  }

  function stop() {
    const session = active;
    if (!session || session.stopping) return;
    session.stopping = true;
    onState?.("finishing");
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      settle(session, "timeout", null, true);
      if (session.bridge) cancelNative(session);
    }, FINISH_MS);
    try {
      if (session.bridge) {
        void boundedPromise(Promise.resolve(session.bridge.stop(session.id)), 2000)
          .catch((error) => {
            if (active !== session) return;
            settle(session, error.message || "capture-failed");
            cancelNative(session);
          });
      } else session.recognition.stop();
    } catch { settle(session, "capture-failed", null, true); }
  }

  function start() {
    if (disposed || active) return;
    if (!target?.navigator?.userActivation?.isActive || target.top !== target) {
      onError?.("gesture-required"); return;
    }
    const session = { id: `meal-${Date.now().toString(36)}-${++sequence}`, bridge: null,
      recognition: null, timer: null, stopping: false };
    active = session;
    onState?.("listening");
    if (mode === "native") {
      session.bridge = nativeBridge(target);
      if (!session.bridge) { settle(session, "unavailable"); return; }
      // Covers consent, OS permission, recording and native finish deadlines.
      session.timer = setTimeout(() => {
        settle(session, "timeout"); cancelNative(session);
      }, 100_000);
      try {
        void Promise.resolve(session.bridge.start(session.id)).then(
          (result) => settle(session, null, result?.transcript),
          (error) => settle(session, error?.message || "capture-failed")
        );
      } catch { settle(session, "capture-failed"); }
      return;
    }
    const Recognition = target.SpeechRecognition || target.webkitSpeechRecognition;
    if (mode !== "browser" || typeof Recognition !== "function") { settle(session, "unavailable"); return; }
    try {
      const recognition = new Recognition();
      session.recognition = recognition;
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      const finals = new Map();
      recognition.onresult = (event) => {
        if (active !== session) return;
        // Result indexes can repeat. Replace, don't append duplicate finals.
        for (let i = event.resultIndex; i < event.results.length && i < 256; i++) {
          if (event.results[i].isFinal) finals.set(i, normalizeMealTranscript(event.results[i][0]?.transcript));
        }
        if ([...finals.values()].join(" ").length >= MEAL_SPEECH_MAX_LENGTH) stop();
      };
      recognition.onend = () => settle(session, null, [...finals.values()].join(" "));
      recognition.onerror = (event) => settle(session,
        event.error === "not-allowed" ? "permission-denied" : event.error === "aborted" ? "cancelled" : event.error || "capture-failed",
        null, true);
      session.timer = setTimeout(() => settle(session, "timeout", null, true), CAPTURE_MS);
      recognition.start();
    } catch { settle(session, "capture-failed", null, true); }
  }

  const onHidden = () => { if (target.document?.visibilityState === "hidden") cancel(); };
  target?.addEventListener("pagehide", cancel);
  target?.addEventListener("popstate", cancel);
  target?.addEventListener("hashchange", cancel);
  target?.document?.addEventListener("visibilitychange", onHidden);
  return {
    start, stop, cancel,
    dispose() {
      disposed = true;
      cancel();
      target?.removeEventListener("pagehide", cancel);
      target?.removeEventListener("popstate", cancel);
      target?.removeEventListener("hashchange", cancel);
      target?.document?.removeEventListener("visibilitychange", onHidden);
    }
  };
}
