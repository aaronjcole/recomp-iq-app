import { isTrustedAppUrl } from "./bridgeProtocol.ts";

export const SPEECH_SOURCE = "recompone-native-speech" as const;
export const SPEECH_VERSION = 1 as const;
export const SPEECH_RESPONSE_EVENT = "recompone:speech-response";
export const MAX_TRANSCRIPT_LENGTH = 4000;
export const SPEECH_LIMITS = Object.freeze({ permission: 30_000, capture: 60_000, finish: 5_000, drain: 2_000, quiet: 250 });
const ID = /^[a-zA-Z0-9_-]{1,80}$/;

type Envelope = { source: typeof SPEECH_SOURCE; version: typeof SPEECH_VERSION; requestId: string };
export type SpeechRequest = Envelope & (
  | { action: "getCapabilities" }
  | { action: "start"; sessionId: string; userGesture: true }
  | { action: "stop" | "cancel"; sessionId: string }
);
export type SpeechError = "unsupported" | "busy" | "cancelled" | "permission-denied" | "unavailable" | "timeout" | "no-speech" | "capture-failed";
export type SpeechResponse = Envelope & {
  ok: boolean;
  result?: { available: boolean } | { transcript: string } | { finished: true };
  error?: SpeechError;
};

export function isTrustedSpeechContext(messageUrl: string, currentUrl: string): boolean {
  // No fallback to currentUrl for a missing/malformed sender URL.
  return isTrustedAppUrl(messageUrl) && isTrustedAppUrl(currentUrl);
}

export function parseSpeechRequest(raw: string): SpeechRequest | null {
  if (typeof raw !== "string" || raw.length > 1024) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v) || v.source !== SPEECH_SOURCE ||
        v.version !== SPEECH_VERSION || typeof v.requestId !== "string" || !ID.test(v.requestId)) return null;
    const keys = ["source", "version", "requestId", "action"];
    if (v.action === "start" || v.action === "stop" || v.action === "cancel") {
      if (typeof v.sessionId !== "string" || !ID.test(v.sessionId)) return null;
      keys.push("sessionId");
      if (v.action === "start") {
        if (v.userGesture !== true) return null;
        keys.push("userGesture");
      }
    } else if (v.action !== "getCapabilities") return null;
    if (Object.keys(v).some((key) => !keys.includes(key))) return null;
    return v as SpeechRequest;
  } catch { return null; }
}

export function boundedTranscript(value: unknown): string {
  return typeof value === "string"
    ? value.slice(0, MAX_TRANSCRIPT_LENGTH).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    : "";
}
