import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

const SpeechRecognition = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const isSpeechSupported = () => Boolean(SpeechRecognition);

export default function VoiceInput({ onTranscript, disabled = false, className = "" }) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const finalRef = useRef("");

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
    finalRef.current = "";
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) return;
    setError(null);
    finalRef.current = "";
    setInterimText("");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let final = finalRef.current;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += (final ? " " : "") + transcript.trim();
        } else {
          interim = transcript;
        }
      }
      finalRef.current = final;
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        setError("Microphone permission denied. Enable it in browser settings.");
      } else {
        setError("Voice input unavailable. Type your message instead.");
      }
      stop();
    };

    recognition.onend = () => {
      const text = finalRef.current.trim();
      setListening(false);
      setInterimText("");
      finalRef.current = "";
      recognitionRef.current = null;
      if (text) onTranscript(text);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onTranscript, stop]);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  if (!SpeechRecognition) return null;

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {listening && interimText && (
        <div className="text-xs text-muted-foreground px-1 italic truncate max-w-[200px]" aria-live="polite">
          {interimText}
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive px-1" role="alert">{error}</div>
      )}
      {listening ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={stop}
          disabled={disabled}
          aria-label="Stop recording"
          className="min-h-11 min-w-11 border-destructive text-destructive hover:bg-destructive/10 animate-pulse"
        >
          <Square className="w-4 h-4" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={start}
          disabled={disabled}
          aria-label="Start voice input"
          className="min-h-11 min-w-11 border-teal/60 text-teal hover:bg-teal/10"
        >
          <Mic className="w-4 h-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
