import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createMealSpeechCapture, getMealSpeechSupport, normalizeMealTranscript } from "../../src/lib/nativeSpeechBridge.js";
import { buildInjectedSpeechBridgeScript } from "../../expo-ios/src/injectedSpeechBridge.ts";
import { SPEECH_SOURCE, SPEECH_VERSION, SPEECH_RESPONSE_EVENT } from "../../expo-ios/src/speechProtocol.ts";

const APP = "https://recomp-iq.base44.app";
function browserTarget() {
  const target = new EventTarget();
  target.top = target;
  target.navigator = { userActivation: { isActive: true } };
  target.isSecureContext = true;
  target.document = new EventTarget();
  const instances = [];
  target.SpeechRecognition = class {
    starts = 0; stops = 0; aborts = 0;
    constructor() { instances.push(this); }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
  };
  return { target, instances };
}
const finalEvent = (text, isFinal = true) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function capture(mode = "browser") {
  const f = browserTarget(), text = [], errors = [], states = [];
  const instance = createMealSpeechCapture({ mode, target: f.target, onTranscript: (v) => text.push(v),
    onError: (v) => errors.push(v), onState: (v) => states.push(v) });
  return { ...f, text, errors, states, instance };
}

test("old shell, unavailable native and unsupported browser have no microphone capability", async () => {
  const { target } = browserTarget();
  delete target.SpeechRecognition;
  target.ReactNativeWebView = {};
  assert.equal(await getMealSpeechSupport(target), null);
  target.recompOneSpeech = { version: 0, start() {} };
  assert.equal(await getMealSpeechSupport(target), null);
  target.recompOneSpeech = { version: 1, getCapabilities: async () => ({ available: false }), start() {}, stop() {}, cancel() {} };
  assert.equal(await getMealSpeechSupport(target), null);
  target.recompOneSpeech.getCapabilities = async () => ({ available: true });
  assert.equal(await getMealSpeechSupport(target), "native");
});

test("browser fallback requires top frame, secure context and user activation support", async () => {
  const { target } = browserTarget();
  assert.equal(await getMealSpeechSupport(target), "browser");
  target.isSecureContext = false; assert.equal(await getMealSpeechSupport(target), null);
  target.isSecureContext = true; target.top = {}; assert.equal(await getMealSpeechSupport(target), null);
  target.top = target; delete target.navigator.userActivation; assert.equal(await getMealSpeechSupport(target), null);
});

test("a non-answering native capability handshake falls back within two seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { target } = browserTarget();
  target.recompOneSpeech = { version: 1, getCapabilities: () => new Promise(() => {}), start() {}, stop() {}, cancel() {} };
  const support = getMealSpeechSupport(target);
  t.mock.timers.tick(2000);
  assert.equal(await support, "browser");
});

test("web capture cannot be started without an active user gesture", () => {
  const f = capture(); f.target.navigator.userActivation.isActive = false;
  f.instance.start();
  assert.equal(f.instances.length, 0);
  assert.deepEqual(f.errors, ["gesture-required"]);
  f.instance.dispose();
});

test("browser Stop delivers bounded deduplicated final once, never interim text", () => {
  const f = capture(); f.instance.start(); f.instance.start();
  assert.equal(f.instances.length, 1);
  const r = f.instances[0];
  r.onresult(finalEvent("interim", false));
  assert.deepEqual(f.text, []);
  r.onresult(finalEvent("two eggs")); r.onresult(finalEvent("two eggs"));
  const staleEnd = r.onend;
  f.instance.stop(); f.instance.stop();
  assert.equal(r.stops, 1);
  r.onresult(finalEvent("two eggs and toast")); r.onend(); staleEnd();
  assert.deepEqual(f.text, ["two eggs and toast"]);
  assert.equal(r.onresult, null); assert.equal(r.onend, null);
  f.instance.dispose();
});

test("Cancel, unmount and navigation discard accumulated and late browser transcripts", () => {
  for (const action of ["cancel", "dispose", "pagehide", "popstate", "hashchange", "visibilitychange"]) {
    const f = capture(); f.instance.start();
    const r = f.instances[0]; r.onresult(finalEvent("do not add"));
    const lateEnd = r.onend;
    if (action === "cancel" || action === "dispose") f.instance[action]();
    else if (action === "visibilitychange") {
      f.target.document.visibilityState = "hidden"; f.target.document.dispatchEvent(new Event(action));
    } else f.target.dispatchEvent(new Event(action));
    lateEnd();
    assert.deepEqual(f.text, [], action); assert.equal(r.aborts, 1, action);
    f.instance.dispose();
  }
});

test("browser errors, no-speech, capture timeout and finish timeout always settle", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const code of ["not-allowed", "network", "audio-capture", "no-speech"]) {
    const f = capture(); f.instance.start();
    f.instances[0].onerror({ error: code });
    assert.equal(f.instances[0].aborts, 1); assert.deepEqual(f.text, []);
    assert.equal(f.states.at(-1), "idle"); assert.equal(f.errors.length, 1);
    f.instance.dispose();
  }
  const empty = capture(); empty.instance.start(); empty.instances[0].onend();
  assert.deepEqual(empty.errors, ["no-speech"]); empty.instance.dispose();
  for (const stopping of [false, true]) {
    const f = capture(); f.instance.start();
    if (stopping) f.instance.stop();
    t.mock.timers.tick(stopping ? 5000 : 60000);
    assert.deepEqual(f.errors, ["timeout"]); assert.equal(f.instances[0].aborts, 1);
    f.instance.dispose();
  }
});

test("native Stop resolves final once, Cancel ignores late final and notifies shell", async () => {
  for (const cancel of [false, true]) {
    const f = capture("native"), pending = deferred(), calls = [];
    f.target.recompOneSpeech = { version: 1, getCapabilities() {},
      start: (id) => { calls.push(["start", id]); return pending.promise; },
      stop: async (id) => { calls.push(["stop", id]); }, cancel: async (id) => { calls.push(["cancel", id]); } };
    f.instance.start();
    if (cancel) f.instance.cancel(); else { f.instance.stop(); f.instance.stop(); }
    pending.resolve({ transcript: "banana" }); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(f.text, cancel ? [] : ["banana"]);
    assert.equal(calls.length, 2); assert.equal(calls[0][1], calls[1][1]);
    assert.equal(calls[1][0], cancel ? "cancel" : "stop");
    f.instance.dispose();
  }
});

test("native total deadline cancels a non-answering shell without delivering text", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = capture("native"), calls = [];
  f.target.recompOneSpeech = { version: 1, getCapabilities() {}, start: () => new Promise(() => {}), stop() {},
    cancel: async () => { calls.push("cancel"); } };
  f.instance.start(); t.mock.timers.tick(100000);
  assert.deepEqual(f.errors, ["timeout"]); assert.deepEqual(f.text, []); assert.deepEqual(calls, ["cancel"]);
  f.instance.dispose();
});

function injected(origin = APP, iframe = false) {
  const { target } = browserTarget(), posted = [];
  if (iframe) target.top = {};
  target.ReactNativeWebView = { postMessage: (raw) => posted.push(JSON.parse(raw)) };
  const context = vm.createContext({ window: target, location: { origin }, navigator: target.navigator,
    Event, CustomEvent, setTimeout, clearTimeout });
  vm.runInContext(buildInjectedSpeechBridgeScript(), context);
  const respond = (request, result, override = {}) => target.dispatchEvent(new CustomEvent(SPEECH_RESPONSE_EVENT, {
    detail: { source: SPEECH_SOURCE, version: SPEECH_VERSION, requestId: request.requestId, ok: true, result, ...override }
  }));
  return { target, posted, respond };
}

test("injected native bridge is never installed off-origin or in subframes", () => {
  for (const origin of ["https://evil.example", "https://base44.app", "http://recomp-iq.base44.app", "null"]) {
    assert.equal(injected(origin).target.recompOneSpeech, undefined);
  }
  assert.equal(injected(APP, true).target.recompOneSpeech, undefined);
});

test("injected bridge rejects gesture-free starts and ignores wrong version/ID replies", async () => {
  const f = injected();
  f.target.navigator.userActivation.isActive = false;
  await assert.rejects(f.target.recompOneSpeech.start("session-1"), /gesture-required/);
  assert.deepEqual(f.posted, []);
  f.target.navigator.userActivation.isActive = true;
  const pending = f.target.recompOneSpeech.start("session-1");
  const request = f.posted[0];
  f.respond(request, { transcript: "untrusted" }, { version: 2 });
  f.respond(request, { transcript: "untrusted" }, { requestId: "unmatched" });
  f.respond(request, { transcript: "eggs" });
  assert.equal((await pending).transcript, "eggs");
  assert.equal(request.userGesture, true); assert.equal(request.sessionId, "session-1");
});

test("injected pagehide cancels recording and rejects pending requests", async () => {
  const f = injected(), pending = f.target.recompOneSpeech.start("session-1");
  f.target.dispatchEvent(new Event("pagehide"));
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(f.posted.map((r) => r.action), ["start", "cancel"]);
});

test("native permission plugin is configured without a version/build bump; IAP parser unchanged", () => {
  const config = JSON.parse(readFileSync(new URL("../../expo-ios/app.json", import.meta.url), "utf8")).expo;
  const plugin = config.plugins.find((p) => p[0] === "expo-speech-recognition")[1];
  assert.match(plugin.microphonePermission, /microphone/);
  assert.match(plugin.speechRecognitionPermission, /review/);
  assert.equal(config.version, "1.0.0"); assert.equal(config.ios.buildNumber, "1");
  assert.equal(normalizeMealTranscript("x".repeat(5000)).length, 4000);
  const iap = readFileSync(new URL("../../expo-ios/src/bridgeProtocol.ts", import.meta.url), "utf8");
  assert.doesNotMatch(iap, /recompone-native-speech|action: "start"/);
  const adapter = readFileSync(new URL("../../expo-ios/src/nativeSpeech.ts", import.meta.url), "utf8");
  assert.match(adapter, /requireOptionalNativeModule/);
  assert.match(adapter, /import type \{ ExpoSpeechRecognitionModule \}/);
  assert.doesNotMatch(adapter, /import \{ ExpoSpeechRecognitionModule \}/);
});

test("privacy policy discloses optional meal speech processing and explicit food confirmation", () => {
  const policy = readFileSync(new URL("../../src/pages/Privacy.jsx", import.meta.url), "utf8");
  assert.match(policy, /Meal dictation is optional/);
  assert.match(policy, /Apple or your browser&apos;s speech service/);
  assert.match(policy, /may process audio online/);
  assert.match(policy, /RecompOne does not save audio/);
  assert.match(policy, /nothing is logged\s+automatically/);
  assert.match(policy, /Only the foods you review and confirm are saved/);
});
