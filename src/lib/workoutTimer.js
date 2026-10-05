// Elapsed seconds derived from the wall clock. WKWebView suspends timers while
// the app is backgrounded or the phone is locked, so counting interval ticks
// would undercount; the interval only triggers a re-read of this value.
/**
 * @param {number | null | undefined} startTime epoch ms
 * @param {number} [now] epoch ms
 */
export function elapsedSecondsSince(startTime, now = Date.now()) {
  if (!startTime) return 0;
  return Math.max(0, Math.floor((now - startTime) / 1000));
}
