import {
  boundedTranscript, isTrustedSpeechContext, parseSpeechRequest, SPEECH_LIMITS,
  SPEECH_SOURCE, SPEECH_VERSION, type SpeechError, type SpeechRequest, type SpeechResponse
} from "./speechProtocol.ts";

export interface SpeechRecognizer {
  available(): boolean;
  requestPermissions(): Promise<{ granted: boolean; restricted?: boolean }>;
  listen(handlers: { result(text: unknown, final: boolean): void; end(): void; error(code: string): void }): () => void;
  start(): void;
  stop(): void;
  abort(): void;
}
type Session = {
  request: SpeechRequest & { action: "start" };
  started: boolean;
  stopping: boolean;
  transcript: string;
  remove?: () => void;
  timer?: ReturnType<typeof setTimeout>;
};
type ControllerDependencies = {
  recognizer: SpeechRecognizer;
  consent(): Promise<boolean>;
  trusted(): boolean;
  respond(response: SpeechResponse): void;
};

/** One recognizer owner. No audio files, interim transcripts, tokens or diary writes. */
export class SpeechCaptureController {
  private session: Session | null = null;
  private seen = new Set<string>();
  private disposed = false;
  private draining = false;
  private unhealthy = false;
  private removeDrain?: () => void;
  private drainTimer?: ReturnType<typeof setTimeout>;
  private quietTimer?: ReturnType<typeof setTimeout>;
  private readonly deps: ControllerDependencies;
  constructor(deps: ControllerDependencies) { this.deps = deps; }

  private respond(request: SpeechRequest, result?: SpeechResponse["result"], error?: SpeechError) {
    if (this.disposed || !this.deps.trusted()) return;
    this.deps.respond({ source: SPEECH_SOURCE, version: SPEECH_VERSION, requestId: request.requestId,
      ok: !error, ...(error ? { error } : { result }) });
  }

  private live(s: Session) { return !this.disposed && this.session === s && this.deps.trusted(); }
  private arm(s: Session, ms: number) {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => this.finish(s, "timeout", true), ms);
  }

  private drain(abort: boolean) {
    // Native events have no session IDs. Drain abort's asynchronous `end` before
    // another session can attach listeners, so stale results cannot cross over.
    this.draining = true;
    let acknowledged = !abort;
    let ended = false;
    const quiet = () => {
      clearTimeout(this.quietTimer);
      if (!ended || !acknowledged) return;
      this.quietTimer = setTimeout(() => {
        this.draining = false;
        clearTimeout(this.drainTimer);
        this.removeDrain?.();
        this.removeDrain = undefined;
      }, SPEECH_LIMITS.quiet);
    };
    this.removeDrain = this.deps.recognizer.listen({
      result: quiet,
      error: (code) => { if (code === "aborted") acknowledged = true; quiet(); },
      end: () => { if (acknowledged) ended = true; quiet(); }
    });
    this.drainTimer = setTimeout(() => {
      this.unhealthy = true; // Fail closed if the native module never releases.
      clearTimeout(this.quietTimer);
      this.removeDrain?.();
      this.removeDrain = undefined;
      // A broken error path must not leave audio running. No retry is allowed
      // after this point, so late abort events cannot leak into another capture.
      try { this.deps.recognizer.abort(); } catch { /* Already unavailable. */ }
    }, SPEECH_LIMITS.drain);
    if (abort) {
      try { this.deps.recognizer.abort(); } catch { this.unhealthy = true; }
    }
  }

  private finish(s: Session, error?: SpeechError, abort = false, waitForEnd = false) {
    if (this.session !== s) return;
    this.session = null;
    clearTimeout(s.timer);
    s.remove?.();
    if (s.started && (abort || waitForEnd)) this.drain(abort);
    const text = s.transcript;
    s.transcript = "";
    this.respond(s.request, error ? undefined : { transcript: text }, error || (text ? undefined : "no-speech"));
  }

  async handle(raw: string, messageUrl: string, currentUrl: string) {
    if (this.disposed || !isTrustedSpeechContext(messageUrl, currentUrl) || !this.deps.trusted()) return;
    const request = parseSpeechRequest(raw);
    if (!request || this.seen.has(request.requestId)) return;
    this.seen.add(request.requestId);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    if (request.action === "getCapabilities") {
      let available = false;
      try { available = !this.unhealthy && this.deps.recognizer.available(); } catch { /* absent module */ }
      this.respond(request, { available });
      return;
    }
    if (request.action !== "start") {
      const s = this.session;
      if (!s || s.request.sessionId !== request.sessionId) {
        this.respond(request, undefined, "cancelled");
        return;
      }
      if (request.action === "cancel" || !s.started) this.finish(s, "cancelled", true);
      else if (!s.stopping) {
        s.stopping = true;
        this.arm(s, SPEECH_LIMITS.finish);
        try { this.deps.recognizer.stop(); } catch { this.finish(s, "capture-failed", true); }
      }
      this.respond(request, { finished: true });
      return;
    }
    if (this.unhealthy) { this.respond(request, undefined, "unavailable"); return; }
    if (this.session || this.draining) { this.respond(request, undefined, "busy"); return; }
    const s: Session = { request, started: false, stopping: false, transcript: "" };
    this.session = s;
    this.arm(s, SPEECH_LIMITS.permission);
    try {
      if (!this.deps.recognizer.available()) { this.finish(s, "unavailable"); return; }
      // Never trust a page's userGesture assertion alone. Native confirmation
      // must be tapped for EVERY session, before any OS permission request.
      const consent = await this.deps.consent();
      if (!this.live(s)) return;
      if (!consent) { this.finish(s, "cancelled"); return; }
      const permission = await this.deps.recognizer.requestPermissions();
      if (!this.live(s)) return;
      if (!permission.granted || permission.restricted) { this.finish(s, "permission-denied"); return; }
      s.remove = this.deps.recognizer.listen({
        result: (text, final) => {
          const normalized = boundedTranscript(text);
          if (this.live(s) && final && normalized) s.transcript = normalized;
        },
        end: () => { if (this.live(s)) this.finish(s); },
        error: (code) => {
          if (!this.live(s)) return;
          const error = code === "not-allowed" ? "permission-denied" :
            code === "no-speech" ? "no-speech" : code === "aborted" ? "cancelled" : "capture-failed";
          // The module guarantees error -> end. Do not issue a second abort:
          // its delayed events could otherwise terminate a later retry.
          this.finish(s, error, false, true);
        }
      });
      s.started = true;
      this.arm(s, SPEECH_LIMITS.capture);
      this.deps.recognizer.start();
    } catch { this.finish(s, "capture-failed", true); }
  }

  cancel() { if (this.session) this.finish(this.session, "cancelled", true); }
  dispose() {
    this.cancel();
    this.disposed = true;
    clearTimeout(this.drainTimer);
    clearTimeout(this.quietTimer);
    this.removeDrain?.();
  }
}
