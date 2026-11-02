import { APP_ORIGIN } from "./bridgeProtocol.ts";
import { SPEECH_SOURCE, SPEECH_VERSION, SPEECH_RESPONSE_EVENT } from "./speechProtocol.ts";

export function buildInjectedSpeechBridgeScript(): string {
  return `
  (function () {
    if (window.top !== window || location.origin !== ${JSON.stringify(APP_ORIGIN)} || window.recompOneSpeech) return;
    var pending = Object.create(null), sequence = 0, active = null;
    var source = ${JSON.stringify(SPEECH_SOURCE)}, version = ${SPEECH_VERSION};
    function send(action, payload) {
      return new Promise(function (resolve, reject) {
        if (location.origin !== ${JSON.stringify(APP_ORIGIN)}) { reject(new Error('unavailable')); return; }
        var requestId = 'speech-' + Date.now().toString(36) + '-' + (++sequence);
        var timer = setTimeout(function () {
          delete pending[requestId];
          if (action === 'start') send('cancel', { sessionId: payload.sessionId }).catch(function () {});
          reject(new Error('timeout'));
        }, action === 'start' ? 100000 : 2000);
        pending[requestId] = function (detail) {
          clearTimeout(timer);
          if (detail.ok === true) resolve(detail.result); else reject(new Error(detail.error || 'capture-failed'));
        };
        try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ source: source, version: version, requestId: requestId, action: action }, payload))); }
        catch (e) { clearTimeout(timer); delete pending[requestId]; reject(new Error('unavailable')); }
      });
    }
    window.addEventListener(${JSON.stringify(SPEECH_RESPONSE_EVENT)}, function (e) {
      var d = e && e.detail;
      if (!d || d.source !== source || d.version !== version || typeof d.requestId !== 'string') return;
      var callback = pending[d.requestId];
      if (!callback) return;
      delete pending[d.requestId]; callback(d);
    });
    window.recompOneSpeech = Object.freeze({
      version: version,
      getCapabilities: function () { return send('getCapabilities'); },
      start: function (sessionId) {
        if (!navigator.userActivation || !navigator.userActivation.isActive) return Promise.reject(new Error('gesture-required'));
        if (active) return Promise.reject(new Error('busy'));
        active = sessionId;
        return send('start', { sessionId: sessionId, userGesture: true }).finally(function () { if (active === sessionId) active = null; });
      },
      stop: function (sessionId) { return send('stop', { sessionId: sessionId }); },
      cancel: function (sessionId) { return send('cancel', { sessionId: sessionId }); }
    });
    window.addEventListener('pagehide', function () {
      if (active) send('cancel', { sessionId: active }).catch(function () {});
      Object.keys(pending).forEach(function (id) { var callback = pending[id]; delete pending[id]; callback({ ok: false, error: 'cancelled' }); });
    });
    window.dispatchEvent(new Event('recompone:speech-ready'));
  })(); true;
  `;
}
