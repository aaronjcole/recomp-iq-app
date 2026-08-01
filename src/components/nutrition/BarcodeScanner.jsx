import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ScanLine, RefreshCw, Loader2, Plus, Bookmark } from "lucide-react";

export default function BarcodeScanner({ onClose, onResult }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const cameraStartIdRef = useRef(0);
  const scanHandledRef = useRef(false);
  const [status, setStatus] = useState("camera"); // camera | looking-up | found | not-found | error
  const [barcode, setBarcode] = useState("");
  const [manual, setManual] = useState("");
  const [food, setFood] = useState(null);
  const [err, setErr] = useState("");

  const stopCamera = () => {
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
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result, _error, scanControls) => {
          if (!result || !mountedRef.current || scanHandledRef.current) return;
          scanHandledRef.current = true;
          scanControls?.stop();
          stopCamera();
          lookup(result.getText());
        }
      );
      if (!mountedRef.current || startId !== cameraStartIdRef.current || scanHandledRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
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
          className={`w-full h-full object-cover ${status === "camera" ? "" : "hidden"}`}
          muted
          playsInline
          aria-hidden="true"
        />

        {status === "camera" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-white/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
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
          />
        )}

        {status === "error" && (
          <MessageCard title="Scanner problem" subtitle={err || "Couldn't access the camera."} />
        )}
      </div>

      {/* Manual entry fallback (always available) */}
      {(status === "not-found" || status === "error" || status === "camera") && (
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
        {unit && value != null ? <span className="text-[10px]">{unit}</span> : null}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function MessageCard({ title, subtitle }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-white/70">{subtitle}</p>
    </div>
  );
}
