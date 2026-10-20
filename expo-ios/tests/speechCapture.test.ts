import test from "node:test";
import assert from "node:assert/strict";
import { SpeechCaptureController, type SpeechRecognizer } from "../src/speechCapture.ts";
import {
  boundedTranscript, isTrustedSpeechContext, MAX_TRANSCRIPT_LENGTH, parseSpeechRequest,
  SPEECH_LIMITS, SPEECH_SOURCE, SPEECH_VERSION, type SpeechResponse
} from "../src/speechProtocol.ts";

const APP = "https://recomp-iq.base44.app";
const message = (action = "start", requestId = "command-1", sessionId = "session-1", extra = {}) => JSON.stringify({
  source: SPEECH_SOURCE, version: SPEECH_VERSION, action, requestId,
  ...(action === "getCapabilities" ? {} : { sessionId }), ...(action === "start" ? { userGesture: true } : {}), ...extra
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

function fixture(options: { permission?: Promise<{ granted: boolean; restricted?: boolean }>; consent?: Promise<boolean>; available?: boolean; abortEvents?: boolean } = {}) {
  const calls: string[] = [];
  const responses: SpeechResponse[] = [];
  const handlers = new Set<Parameters<SpeechRecognizer["listen"]>[0]>();
  const emit = (kind: "end" | "error" | "result", text = "", final = true) => {
    for (const h of [...handlers]) {
      if (kind === "result") h.result(text, final);
      else if (kind === "error") h.error(text);
      else h.end();
    }
  };
  let trusted = true;
  const controller = new SpeechCaptureController({
    trusted: () => trusted,
    consent: () => { calls.push("consent"); return options.consent ?? Promise.resolve(true); },
    respond: (response) => responses.push(response),
    recognizer: {
      available: () => options.available !== false,
      requestPermissions: () => { calls.push("permission"); return options.permission ?? Promise.resolve({ granted: true }); },
      listen: (handler) => { handlers.add(handler); return () => { handlers.delete(handler); }; },
      start: () => { calls.push("start"); },
      stop: () => { calls.push("stop"); },
      abort: () => { calls.push("abort"); if (options.abortEvents !== false) { emit("error", "aborted"); emit("end"); } }
    }
  });
  return { calls, responses, handlers, emit, controller,
    navigate() { trusted = false; controller.cancel(); },
    handle: (raw = message(), sender = APP, top = APP) => controller.handle(raw, sender, top) };
}

test("speech commands have strict action, envelope, ID, payload and size bounds", () => {
  for (const action of ["start", "stop", "cancel", "getCapabilities"]) assert.ok(parseSpeechRequest(message(action)));
  for (const raw of ["null", "[]", "{", message("purchase"), message("start", ""), message("start", "x".repeat(81)),
    message("start", "bad id"), message("start", "ok", ""), message("start", "ok", "session", { userGesture: false }),
    message("start", "ok", "session", { version: 2 }), message("start", "ok", "session", { source: "recompone-native-iap" }),
    message("start", "ok", "session", { audioSource: "https://evil.example/audio" }), " ".repeat(1025)]) {
    assert.equal(parseSpeechRequest(raw), null, raw);
  }
});

test("both sender and current top-page origin must be exact HTTPS app origin", async () => {
  const f = fixture();
  for (const bad of ["", "null", "http://recomp-iq.base44.app", "https://recomp-iq.base44.app.evil.example", "https://base44.app",
    "https://recomp-iq.base44.app@evil.example", "https://evil.example", "file:///app"]) {
    assert.equal(isTrustedSpeechContext(bad, APP), false);
    assert.equal(isTrustedSpeechContext(APP, bad), false);
    await f.handle(message(), bad);
    await f.handle(message(), APP, bad);
  }
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.responses, []);
});

test("capabilities request is permission-free and reports unavailable recognizer", async () => {
  const f = fixture({ available: false });
  await f.handle(message("getCapabilities"));
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.responses[0]?.result, { available: false });
  await f.handle(message("start", "start-1"));
  assert.equal(f.responses[1]?.error, "unavailable");
});

test("native consent precedes permission; denial/restriction never starts capture", async () => {
  for (const option of [{ consent: Promise.resolve(false) }, { permission: Promise.resolve({ granted: false }) },
    { permission: Promise.resolve({ granted: true, restricted: true }) }]) {
    const f = fixture(option);
    await f.handle();
    assert.equal(f.calls.includes("start"), false);
    assert.equal(f.calls[0], "consent");
    assert.equal(f.responses.length, 1);
    f.controller.dispose();
  }
});

test("Stop requests one final result; duplicate final/end events deliver exactly once", async () => {
  const f = fixture();
  await f.handle();
  assert.deepEqual(f.calls, ["consent", "permission", "start"]);
  f.emit("result", "private interim", false);
  assert.equal(f.responses.length, 0);
  await f.handle(message("stop", "stop-1"));
  await f.handle(message("stop", "stop-2"));
  assert.equal(f.calls.filter((c) => c === "stop").length, 1);
  f.emit("result", "two eggs");
  f.emit("result", "two eggs");
  f.emit("end"); f.emit("end");
  const final = f.responses.filter((r) => r.requestId === "command-1");
  assert.deepEqual(final.map((r) => r.result), [{ transcript: "two eggs" }]);
  assert.equal(f.handlers.size, 0);
  f.controller.dispose();
});

test("cancel discards finals, aborts capture and rejects session-mismatched commands", async () => {
  const f = fixture();
  await f.handle(); f.emit("result", "not for delivery");
  await f.handle(message("cancel", "wrong-cancel", "other-session"));
  assert.equal(f.responses[0]?.error, "cancelled");
  assert.equal(f.calls.includes("abort"), false);
  await f.handle(message("cancel", "cancel-1"));
  f.emit("result", "late final"); f.emit("end");
  assert.equal(f.calls.filter((c) => c === "abort").length, 1);
  assert.equal(f.responses.find((r) => r.requestId === "command-1")?.error, "cancelled");
  assert.equal(f.responses.some((r) => r.result && "transcript" in r.result), false);
  f.controller.dispose();
});

test("a replayed command ID cannot restart capture, and concurrent start is busy", async () => {
  const f = fixture();
  await f.handle(); await f.handle();
  await f.handle(message("start", "concurrent", "other"));
  assert.equal(f.responses[0]?.error, "busy");
  f.controller.cancel();
  await f.handle();
  assert.equal(f.calls.filter((c) => c === "start").length, 1);
  f.controller.dispose();
});

test("cancel, disposal and navigation prevent late permission grants from opening mic", async () => {
  for (const action of ["cancel", "dispose", "navigate"] as const) {
    const permission = deferred<{ granted: boolean }>();
    const f = fixture({ permission: permission.promise });
    const pending = f.handle();
    await Promise.resolve();
    if (action === "navigate") f.navigate(); else f.controller[action]();
    permission.resolve({ granted: true }); await pending;
    assert.equal(f.calls.includes("start"), false, action);
    assert.equal(f.responses.some((r) => r.result && "transcript" in r.result), false);
    f.controller.dispose();
  }
});

test("consent and recording deadlines clean up and discard late results", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const consent = deferred<boolean>();
  const f = fixture({ consent: consent.promise });
  const pending = f.handle();
  t.mock.timers.tick(SPEECH_LIMITS.permission);
  consent.resolve(true); await pending;
  assert.deepEqual(f.calls, ["consent"]);
  assert.equal(f.responses[0]?.error, "timeout");
  const capture = fixture(); await capture.handle();
  capture.emit("result", "must be discarded");
  t.mock.timers.tick(SPEECH_LIMITS.capture);
  assert.equal(capture.responses[0]?.error, "timeout");
  assert.ok(capture.calls.includes("abort"));
  capture.controller.dispose(); f.controller.dispose();
});

test("Stop deadline and recognizer errors abort and never return partial text", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); await f.handle();
  f.emit("result", "private", false);
  await f.handle(message("stop", "stop"));
  t.mock.timers.tick(SPEECH_LIMITS.finish);
  assert.equal(f.responses.find((r) => r.requestId === "command-1")?.error, "timeout");
  for (const error of ["not-allowed", "no-speech", "network", "interrupted", "aborted"]) {
    const bad = fixture(); await bad.handle();
    bad.emit("result", "discarded"); bad.emit("error", error); bad.emit("end");
    t.mock.timers.tick(SPEECH_LIMITS.quiet);
    assert.equal(bad.responses.length, 1);
    assert.equal(bad.responses[0]?.ok, false);
    assert.equal(bad.handlers.size, 0);
    bad.controller.dispose();
  }
  f.controller.dispose();
});

test("an empty final cannot erase the recognizer's previous nonempty final", async () => {
  const f = fixture(); await f.handle();
  f.emit("result", "two eggs"); f.emit("result", ""); f.emit("end");
  assert.deepEqual(f.responses[0]?.result, { transcript: "two eggs" });
  f.controller.dispose();
});

test("native errors wait for their own end, without a redundant asynchronous abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); await f.handle();
  f.emit("error", "network");
  assert.equal(f.calls.includes("abort"), false);
  await f.handle(message("start", "retry-1", "session-2"));
  assert.equal(f.responses.at(-1)?.error, "busy");
  f.emit("end");
  await f.handle(message("start", "retry-2", "session-2"));
  assert.equal(f.responses.at(-1)?.error, "busy");
  t.mock.timers.tick(SPEECH_LIMITS.quiet);
  await f.handle(message("start", "retry-3", "session-2"));
  f.emit("result", "retry text"); f.emit("end");
  assert.deepEqual(f.responses.at(-1)?.result, { transcript: "retry text" });
  assert.equal(f.calls.filter((c) => c === "start").length, 2);
  f.controller.dispose();
});

test("Cancel ignores a queued pre-abort end and drains confirmed abort completion before retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture({ abortEvents: false }); await f.handle();
  f.controller.cancel();
  f.emit("end"); // Natural/error end queued before native abort was handled.
  t.mock.timers.tick(SPEECH_LIMITS.quiet);
  await f.handle(message("start", "retry-1", "session-2"));
  assert.equal(f.responses.at(-1)?.error, "busy");
  f.emit("error", "aborted");
  t.mock.timers.tick(SPEECH_LIMITS.quiet);
  await f.handle(message("start", "retry-2", "session-2"));
  assert.equal(f.responses.at(-1)?.error, "busy");
  f.emit("end"); t.mock.timers.tick(SPEECH_LIMITS.quiet);
  await f.handle(message("start", "retry-3", "session-2"));
  f.emit("result", "safe retry"); f.emit("end");
  assert.deepEqual(f.responses.at(-1)?.result, { transcript: "safe retry" });
  f.controller.dispose();
});

test("a recognizer that fails to end is disabled instead of leaking events into retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture({ abortEvents: false }); await f.handle(); f.controller.cancel();
  t.mock.timers.tick(SPEECH_LIMITS.drain);
  await f.handle(message("getCapabilities", "capabilities"));
  assert.deepEqual(f.responses.at(-1)?.result, { available: false });
  await f.handle(message("start", "retry", "session-2"));
  assert.equal(f.responses.at(-1)?.error, "unavailable");
  f.controller.dispose();
});

test("transcripts are bounded, controls sanitized, and empty/non-string finals rejected", async () => {
  assert.equal(boundedTranscript("x".repeat(5000)).length, MAX_TRANSCRIPT_LENGTH);
  assert.equal(boundedTranscript(" eggs\n\u0000milk "), "eggs  milk");
  assert.equal(boundedTranscript({ text: "no" }), "");
  const f = fixture(); await f.handle(); f.emit("end");
  assert.equal(f.responses[0]?.error, "no-speech");
  f.controller.dispose();
});
