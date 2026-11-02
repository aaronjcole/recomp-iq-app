import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createMealSpeechCapture, getMealSpeechSupport } from "@/lib/nativeSpeechBridge";

const ERRORS = {
  "permission-denied": "Microphone or speech permission was denied. You can enable it in Settings, or type your meal.",
  "no-speech": "No final speech was captured. Try again or type your meal.",
  timeout: "Voice input timed out. Try again or type your meal.",
  "gesture-required": "Tap Record meal to start voice input.",
  busy: "Voice input is still closing. Wait a moment, then try again."
};

/** Optional input only. The parent owns editable text and explicit review/logging. */
export default function MealSpeechInput({ onTranscript, onActiveChange = undefined, disabled = false }) {
  const [mode, setMode] = useState(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const capture = useRef(null);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  const activeCallback = useRef(onActiveChange);
  activeCallback.current = onActiveChange;
  const consentId = useId();

  useEffect(() => {
    let mounted = true;
    let detection = 0;
    const detect = () => {
      const attempt = ++detection;
      void getMealSpeechSupport().then((support) => { if (mounted && attempt === detection) setMode(support); });
    };
    detect();
    window.addEventListener("recompone:speech-ready", detect);
    return () => { mounted = false; window.removeEventListener("recompone:speech-ready", detect); };
  }, []);

  useEffect(() => {
    if (!mode) return;
    let mounted = true;
    setState("idle");
    const instance = createMealSpeechCapture({ mode,
      onTranscript: (text) => { if (mounted) callback.current(text); },
      onState: (value) => { if (mounted) { setState(value); activeCallback.current?.(value !== "idle"); } },
      onError: (code) => { if (mounted) setError(ERRORS[code] || "Voice input is unavailable. Type your meal instead."); }
    });
    capture.current = instance;
    return () => { mounted = false; instance.dispose(); capture.current = null; activeCallback.current?.(false); };
  }, [mode]);

  useEffect(() => {
    if (disabled) { capture.current?.cancel(); setConsent(false); }
  }, [disabled]);

  if (!mode) return null;
  const active = state !== "idle";
  return (
    <div className="min-w-0 max-w-full flex flex-col items-start gap-2">
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {active ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {state === "finishing" ? "Finishing voice input…" : mode === "native"
              ? "Confirm on your device, then speak when the microphone indicator appears."
              : "Listening… Describe your meal, then select Stop."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11 border-teal/60 text-teal hover:bg-teal/10"
              disabled={state === "finishing"} onClick={() => capture.current?.stop()}>
              <Square className="mr-2 h-4 w-4" aria-hidden="true" /> Stop
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => capture.current?.cancel()}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" /> Cancel voice input
            </Button>
          </div>
        </>
      ) : consent ? (
        <>
          <p id={consentId} className="text-xs text-muted-foreground max-w-sm">
            Voice input uses your microphone for up to 60 seconds. {mode === "native" ? "Apple" : "Your browser’s speech service"} may
            process audio online. RecompOne does not save audio. Final text is added for review, not logged automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={disabled} aria-describedby={consentId}
              className="min-h-11 border-teal/60 text-teal hover:bg-teal/10"
              onClick={() => { setError(""); setConsent(false); capture.current?.start(); }}>
              <Mic className="mr-2 h-4 w-4" aria-hidden="true" /> Record meal
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConsent(false)}>Cancel voice input</Button>
          </div>
        </>
      ) : (
        <Button type="button" variant="outline" disabled={disabled} className="min-h-11 border-teal/60 text-teal hover:bg-teal/10"
          onClick={() => { setError(""); setConsent(true); }}>
          <Mic className="mr-2 h-4 w-4" aria-hidden="true" /> Describe by voice
        </Button>
      )}
    </div>
  );
}
