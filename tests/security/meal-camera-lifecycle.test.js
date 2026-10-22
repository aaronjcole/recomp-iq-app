import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../src/components/nutrition/BarcodeScanner.jsx", import.meta.url), "utf8");
const callbacksStart = source.indexOf("  const clearIdleTimer = () => {");
const callbacksEnd = source.indexOf("\n  useEffect(() => {", callbacksStart);
const manualStart = source.indexOf("  const handleManual = (e) => {");
const manualEnd = source.indexOf("\n  const showCamera =", manualStart);
assert.ok(callbacksStart >= 0 && callbacksEnd > callbacksStart, "production camera callbacks are available");
assert.ok(manualStart >= 0 && manualEnd > manualStart, "production manual handler is available");

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Execute the actual production startCamera, lookup, manual/close handlers, and
// cleanup helpers. Only external reader/video/SDK I/O and React state are faked;
// assertions inspect behavior, not source patterns. No camera, network, real
// idle timer, or browser is used. Every async boundary is explicitly released.
function harness() {
  const playback = deferred();
  const playStarted = deferred();
  const lookupResponse = deferred();
  const statuses = [], foods = [], errors = [], lookups = [], timers = new Map();
  const mountedRef = { current: true };
  const cameraStartIdRef = { current: 0 };
  const scanHandledRef = { current: false };
  const controlsRef = { current: null };
  const idleTimerRef = { current: null };
  const controls = { stops: 0, stop() { this.stops += 1; } };
  let status = "starting", food = null, timerId = 0, closes = 0, lookupPromise;
  const bindings = {
    mountedRef, cameraStartIdRef, scanHandledRef, controlsRef, idleTimerRef,
    submittingRef: { current: false },
    videoRef: { current: { play() { playStarted.resolve(); return playback.promise; } } },
    scanHints: new Map(), IDLE_TIMEOUT_MS: 8000,
    BrowserMultiFormatReader: class {
      async decodeFromConstraints(constraints, video, callback) {
        assert.deepEqual(constraints, { video: { facingMode: "environment" } });
        assert.equal(video, bindings.videoRef.current);
        assert.equal(typeof callback, "function");
        return controls;
      }
    },
    base44: { functions: { invoke(name, body) {
      lookups.push({ name, body });
      lookupPromise = lookupResponse.promise;
      return lookupPromise;
    } } },
    manual: " 0123456789012 ",
    setStatus(value) { status = value; statuses.push(value); },
    setFood(value) { food = value; foods.push(value); },
    setErr(value) { errors.push(value); },
    setBarcode(value) { assert.equal(value, "0123456789012"); },
    onClose() { closes += 1; },
    triggerHaptic() { assert.fail("no barcode frame should be decoded in a playback test"); },
    HAPTIC_IMPACTS: { SUCCESS: "success" },
    setTimeout(callback, delay) {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  const callbacks = new Function(...Object.keys(bindings), `
    ${source.slice(callbacksStart, callbacksEnd)}
    ${source.slice(manualStart, manualEnd)}
    return { startCamera, handleManual, handleClose, stopCamera };
  `)(...Object.values(bindings));
  return {
    ...callbacks, playback, playStarted, controls, controlsRef, idleTimerRef,
    cameraStartIdRef, scanHandledRef, mountedRef, statuses, foods, errors, timers,
    lookups, lookupResponse,
    status: () => status, food: () => food, closes: () => closes,
    async finishLookup(value) {
      assert.ok(lookupPromise, "manual lookup reached the fake SDK");
      lookupResponse.resolve({ data: { found: true, food: value } });
      // The production lookup continuation was registered before this await.
      await lookupPromise;
    }
  };
}

for (const playbackResult of ["resolve", "reject"]) {
  function settle(h) {
    if (playbackResult === "resolve") h.playback.resolve();
    else h.playback.reject(new Error("Autoplay interrupted"));
  }

  test(`active camera reaches camera state and schedules idle after play ${playbackResult}`, { timeout: 1000 }, async () => {
    const h = harness();
    const starting = h.startCamera();
    await h.playStarted.promise;
    assert.equal(h.status(), "starting");
    assert.equal(h.timers.size, 0, "idle countdown cannot start before playback settles");
    settle(h);
    await starting;
    assert.deepEqual(h.statuses, ["starting", "camera"]);
    assert.equal(h.controlsRef.current, h.controls);
    assert.equal(h.controls.stops, 0);
    assert.equal(h.timers.size, 1);
    const timer = h.timers.get(h.idleTimerRef.current);
    assert.equal(timer.delay, 8000);
    timer.callback();
    assert.equal(h.status(), "idle");
    h.stopCamera();
    assert.equal(h.timers.size, 0);
  });

  for (const transition of ["manual lookup", "closed while mounted", "unmounted"]) {
    test(`late play ${playbackResult} cannot overwrite ${transition} or install an idle timer`, { timeout: 1000 }, async () => {
      const h = harness();
      const starting = h.startCamera();
      await h.playStarted.promise;
      assert.equal(h.controlsRef.current, h.controls, "race starts after reader setup but during play");
      if (transition === "manual lookup") {
        let prevented = false;
        h.handleManual({ preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
        assert.equal(h.status(), "looking-up");
        assert.deepEqual(h.lookups, [{ name: "barcodeLookup", body: { barcode: "0123456789012" } }]);
        await h.finishLookup({ id: "manual-food", name: "Manual oats" });
        assert.equal(h.status(), "found");
        assert.equal(h.food().id, "manual-food");
      } else if (transition === "closed while mounted") {
        h.handleClose();
        assert.equal(h.closes(), 1);
        assert.equal(h.mountedRef.current, true, "close must guard before React unmounts");
      } else {
        // Isolate the mounted check: teardown stops the reader, but deliberately
        // leave generation/scanHandled unchanged so those cannot hide a missing
        // mounted guard after the awaited playback.
        h.mountedRef.current = false;
        h.stopCamera();
        assert.equal(h.cameraStartIdRef.current, 1);
        assert.equal(h.scanHandledRef.current, false);
      }
      assert.equal(h.controlsRef.current, null);
      assert.ok(h.controls.stops >= 1, "transition stops the acquired reader");
      const before = { statuses: [...h.statuses], foods: [...h.foods], errors: [...h.errors] };
      const stopsBefore = h.controls.stops;
      settle(h);
      await starting;
      assert.deepEqual(h.statuses, before.statuses, "stale playback must not publish camera/error state");
      assert.deepEqual(h.foods, before.foods, "manual result must remain intact");
      assert.deepEqual(h.errors, before.errors);
      assert.equal(h.controlsRef.current, null, "stale reader must not be restored");
      assert.equal(h.controls.stops, stopsBefore + 1, "post-play guard stops obsolete controls");
      assert.equal(h.timers.size, 0, "stale playback must not register an idle callback");
      assert.equal(h.idleTimerRef.current, null);
    });
  }
}
