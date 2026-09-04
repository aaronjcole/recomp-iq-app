import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { uploadPrivateAnalysisImage, validateAnalysisImage } from "@/lib/analysisImages";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2, Plus, Bookmark, RefreshCw, Sparkles } from "lucide-react";

export default function FoodPhotoScan({ onClose, onResult }) {
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [status, setStatus] = useState("capture"); // capture | preview | analyzing | found | error
  const [food, setFood] = useState(null);
  const [err, setErr] = useState("");

  const handleClose = () => onClose();

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
      ).filter((element) => element instanceof HTMLElement && !element.classList.contains("hidden")));
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

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // The overlay is mounted for its entire lifetime; its callbacks read current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke any preview object URL when it changes or on unmount, to prevent leaks.
  useEffect(() => {
    return () => {
      if (photo?.url) URL.revokeObjectURL(photo.url);
    };
  }, [photo?.url]);

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      validateAnalysisImage(file);
    } catch (validationError) {
      setErr(validationError.message);
      setStatus("error");
      return;
    }
    setPhoto({ file, url: URL.createObjectURL(file) });
    setStatus("preview");
  };

  const retake = () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setFood(null);
    setErr("");
    setStatus("capture");
  };

  const analyze = async () => {
    if (!photo) return;
    setStatus("analyzing");
    setErr("");
    try {
      const fileUri = await uploadPrivateAnalysisImage(
        base44.integrations.Core,
        photo.file
      );
      if (!mountedRef.current) return;

      const response = await base44.functions.invoke("analyzeFoodPhoto", {
        photoUri: fileUri
      });
      if (!mountedRef.current) return;
      const data = response?.data ?? response;
      if (!data || data.calories == null) throw new Error("No estimate returned");
      setFood({ ...data, source: "manual" });
      setStatus("found");
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(e?.message || "Couldn't analyze the photo.");
      setStatus("error");
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="food-photo-title"
      aria-describedby="food-photo-description"
      aria-busy={status === "analyzing"}
      tabIndex={-1}
      className="fixed inset-0 z-[60] bg-black flex flex-col select-none"
    >
      <p id="food-photo-description" className="sr-only">
        Take or choose a food photo to estimate its calories and macros.
      </p>
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div id="food-photo-title" className="flex items-center gap-2 font-medium">
          <Camera className="w-5 h-5" />
          Snap food
        </div>
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className="p-2 -mr-2 after:absolute after:inset-0 after:content-[''] relative min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
      />

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {status === "capture" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-3 text-white/80 px-8 text-center"
          >
            <span className="w-16 h-16 rounded-full border-2 border-white/60 flex items-center justify-center">
              <Camera className="w-7 h-7" />
            </span>
            <span className="text-sm font-medium">Take or choose a food photo</span>
            <span className="text-xs text-white/50 max-w-[16rem]">
              We'll estimate calories and macros from what's on the plate.
            </span>
          </button>
        )}

        {status === "preview" && photo && (
          <div className="absolute inset-0 flex flex-col">
            <img src={photo.url} alt="food" className="w-full flex-1 object-contain" />
            <div className="p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex gap-2">
              <Button variant="outline" className="flex-1 h-11 min-h-[44px]" onClick={retake}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retake
              </Button>
              <Button className="flex-1 h-11 min-h-[44px] bg-teal text-buttonText hover:opacity-90" onClick={analyze}>
                <Sparkles className="w-4 h-4 mr-1" /> Estimate macros
              </Button>
            </div>
          </div>
        )}

        {status === "analyzing" && (
          <div role="status" aria-live="polite" className="flex flex-col items-center justify-center text-white gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Estimating macros…</p>
          </div>
        )}

        {status === "found" && food && (
          <div className="absolute inset-x-0 bottom-0 bg-panel text-foreground rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto">
            <div className="w-10 h-1.5 bg-lineSoft rounded-full mx-auto mb-4" />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{food.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{food.serving_description}</div>
              </div>
              {food.confidence && (
                <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-label font-mono uppercase tracking-wide text-muted-foreground">
                  {food.confidence} confidence
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4 text-center">
              <Macro label="kcal" value={food.calories} />
              <Macro label="Protein" value={food.protein_g} unit="g" />
              <Macro label="Carbs" value={food.carbs_g} unit="g" />
              <Macro label="Fat" value={food.fat_g} unit="g" />
            </div>
            {food.fiber_g != null && (
              <div className="text-xs text-muted-foreground mt-2">Fiber {food.fiber_g}g</div>
            )}
            {food.notes && (
              <p className="text-xs text-muted-foreground mt-2 leading-snug">{food.notes}</p>
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
                <Button variant="ghost" className="h-11 min-h-[44px] px-4" onClick={retake} aria-label="Choose another photo">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 px-8 text-center">
            <p className="font-medium">Couldn't analyze the photo</p>
            <p className="text-sm text-white/70">{err}</p>
            <Button variant="outline" className="mt-2 h-11 min-h-[44px]" onClick={retake}>
              Try another photo
            </Button>
          </div>
        )}
      </div>
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