import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerHaptic, HAPTIC_IMPACTS } from "@/lib/haptics";
import { X, ScanLine, RefreshCw, Loader2, Plus, Bookmark, CameraOff } from "lucide-react";

const IDLE_TIMEOUT_MS = 8000;

// Restricting ZXing to the four food-relevant barcode formats makes each
// frame decode ~5–10× faster, which is what lets iOS Safari/WKWebView keep up
// with the camera stream instead of dropping frames and never firing.
const scanHints = new Map();
scanHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]);

export default function BarcodeScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const cameraStartIdRef = useRef(0);
  const scanHandledRef = useRef(false);
  const idleTimerRef = useRef(null);
  const [status, setStatus] = useState("camera"); // camera | idle | looking-up | found | not-found | error
  const [barcode, setBarcode] = useState("");
  const [manual, setManual] = useState("");
  const [food, setFood] = useState(null);
  const [err, setErr] = useState("");

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const stopCamera = () => {
    clearIdleTimer();
    try {
      controlsRef.current?.stop();
    } catch {
      // The camera may already have stopped after a successful scan.
    }
    controlsRef.current = null;
  };

  const handleClose = () => {
    cameraStartIdRef.current += 1;
    scanHandledRef.current = true;
    stopCamera();
    onClose();
  };

  const lookup = async (code) => {
    setStatus("looking-up");
    setBarcode(code);
    try {
      const res = await base44.functions.invoke("barcodeLookup", { barcode: code });
      if (!mountedRef.current) return;
      const data = res.data;
      if (data.error) {
        setErr(data.error);
        setStatus("error");
        return;
      }
      if (data.found === false) {
        setStatus("not-found");
        return;
      }
      setFood(data.food);
      setStatus("found");
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(e.message || "Lookup failed");
      setStatus("error");
    }
  };

  const startCamera = async () => {
    const startId = ++cameraStartIdRef.current;
    scanHandledRef.current = false;
    stopCamera();
    setStatus("camera");
    setFood(null);
    setErr("");
    try {
      const reader = new BrowserMultiFormatReader(scanHints);
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result, _error, scanControls) => {
          if (!result || !mountedRef.current || scanHandledRef.current) return;
          scanHandledRef.current = true;
          clearIdleTimer();
          scanControls?.stop();
          stopCamera();
          triggerHaptic(HAPTIC_IMPACTS.SUCCESS);
          lookup(result.getText());
        }
      );
      if (!mountedRef.current || startId !== cameraStartIdRef.current || scanHandledRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      // If nothing is detected within the idle window, surface a nudge
      // without stopping the camera — the user can keep trying.
      idleTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || scanHandledRef.current) return;
        if (cameraStartIdRef.current === startId) setStatus("idle");
      }, IDLE_TIMEOUT_MS);
    } catch (e) {
      if (!mountedRef.current || startId !== cameraStartIdRef.current) return;
      setErr(e.message || "Camera unavailable");
      setStatus("error");
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = /** @type {HTMLElement[]} */ (Array.from(
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element instanceof HTMLElement));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    startCamera();

    return () => {
      mountedRef.current = false;
      cameraStartIdRef.current += 1;
      scanHandledRef.current = true;
      stopCamera();
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    cameraStartIdRef.current += 1;
    scanHandledRef.current = true;
    stopCamera();
    lookup(manual.trim());
  };

  const showCamera = status === "camera" || status === "idle";

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-scanner-title"
      aria-describedby="barcode-scanner-description"
      aria-busy={status === "looking-up"}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black flex flex-col select-none"
    >
      <p id="barcode-scanner-description" className="sr-only">
        Scan a food barcode with your camera or enter the barcode manually.
      </p>
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div id="barcode-scanner-title" className="flex items-center gap-2 font-medium">
          <ScanLine className="w-5 h-5" />
          Scan food barcode
        </div>
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className="p-2 -mr-2 after:absolute after:inset-0 after:content-[''] relative min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close scanner"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera / content area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${showCamera ? "" : "hidden"}`}
          muted
          playsInline
          aria-hidden="true"
        />

        {/* Centered scan box — visible in every camera state */}
        {showCamera && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-40 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] overflow-hidden">
              {/* Corner accents */}
              <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-2xl border-l-2 border-t-2 border-white" />
              <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-2xl border-r-2 border-t-2 border-white" />
              <span className="absolute left-0 bottom-0 h-7 w-7 rounded-bl-2xl border-l-2 border-b-2 border-white" />
              <span className="absolute right-0 bottom-0 h-7 w-7 rounded-br-2xl border-r-2 border-b-2 border-white" />
              {/* Animated scan line (vertical sweep) while actively scanning */}
              {status === "camera" && (
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-teal shadow-[0_0_8px_2px_rgba(47,196,167,0.6)] rounded-full"
                  initial={{ top: "8%" }}
                  animate={{ top: ["8%", "92%", "8%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          </div>
        )}

        {/* Idle nudge — camera still running */}
        {status === "idle" && (
          <div className="absolute inset-x-0 bottom-24 flex justify-center px-6 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-center text-white text-sm max-w-xs">
              <p className="font-medium">No barcode detected yet</p>
              <p className="text-white/70 text-xs mt-0.5">
                Hold steady inside the box, or enter the number manually below.
              </p>
            </div>
          </div>
        )}

        {status === "looking-up" && (
          <div role="status" aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Looking up {barcode}…</p>
          </div>
        )}

        {status === "found" && food && (
          <div className="absolute inset-x-0 bottom-0 bg-panel text-foreground rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto">
            <div className="w-10 h-1.5 bg-lineSoft rounded-full mx-auto mb-4" />
            <div className="text-lg font-semibold">{food.name}</div>
            {food.brand_name && (
              <div className="text-xs text-muted-foreground">{food.brand_name}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">{food.serving_description}</div>

            <div className="grid grid-cols-4 gap-2 mt-4 text-center">
              <Macro label="kcal" value={food.calories} />
              <Macro label="Protein" value={food.protein_g} unit="g" />
              <Macro label="Carbs" value={food.carbs_g} unit="g" />
              <Macro label="Fat" value={food.fat_g} unit="g" />
            </div>
            {food.fiber_g != null && (
              <div className="text-xs text-muted-foreground mt-2">
                Fiber {food.fiber_g}g{food.sodium_mg != null ? ` · Sodium ${food.sodium_mg}mg` : ""}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-5">
              <Button
                className="bg-teal text-buttonText hover:opacity-90 h-11 min-h-[44px]"
                onClick={() => onResult(food, true)}
              >
                <Plus className="w-4 h-4 mr-1" /> Add to today
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-11 min-h-[44px]"
                  onClick={() => onResult(food, false)}
                >
                  <Bookmark className="w-4 h-4 mr-1" /> Save to library
                </Button>
                <Button
                  variant="ghost"
                  className="h-11 min-h-[44px] px-4"
                  onClick={startCamera}
                  aria-label="Scan another barcode"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {status === "not-found" && (
          <MessageCard
            title="No product found"
            subtitle={`Barcode ${barcode} isn't in the Open Food Facts database yet.`}
            icon={<CameraOff className="w-8 h-8 mb-1 opacity-70" />}
          />
        )}

        {status === "error" && (
          <MessageCard title="Scanner problem" subtitle={err || "Couldn't access the camera."} />
        )}
      </div>

      {/* Manual entry fallback (always available) */}
      {(status === "not-found" || status === "error" || showCamera) && (
        <form
          onSubmit={handleManual}
          className="bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-2"
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder="Enter barcode manually"
            aria-label="Barcode number"
            className="h-11 min-h-[44px] bg-bg"
          />
          <Button type="submit" variant="outline" className="h-11 min-h-[44px] shrink-0">
            Lookup
          </Button>
        </form>
      )}
    </div>
  );
}

function Macro({ label, value, unit = "" }) {
  return (
    <div className="rounded-lg bg-panel2 py-2">
      <div className="font-mono text-sm font-semibold tabular-nums">
        {value ?? "—"}
        {unit && value != null ? <span className="text-label">{unit}</span> : null}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function MessageCard({ title, subtitle, icon }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-8 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <p className="text-sm text-white/70">{subtitle}</p>
    </div>
  );
}