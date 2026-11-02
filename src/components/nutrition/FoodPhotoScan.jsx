import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { uploadPrivateAnalysisImage, validateAnalysisImage } from "@/lib/analysisImages";
import { Button } from "@/components/ui/button";
import { X, Camera, LoaderCircle, Plus, Bookmark, RefreshCw, Sparkles } from "lucide-react";

export default function FoodPhotoScan({ onClose, onResult, onManual = undefined, reviewLabel = "Review food" }) {
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [status, setStatus] = useState("capture"); // capture | preview | analyzing | found | error
  const [food, setFood] = useState(null);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState(false);
  const analysisLock = useRef(false);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const submit = async (review) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSaveError("");
    try { await onResult(review ? food : { ...items[0], source: "manual" }, review); }
    catch (error) { if (mountedRef.current) setSaveError(error.message || "Couldn't save food. Please try again."); }
    finally { submittingRef.current = false; if (mountedRef.current) setSubmitting(false); }
  };

  const handleClose = () => { if (!submittingRef.current) onClose(); };

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
      ).filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusable.some((element) => element === document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
    setConsent(false);
    setStatus("preview");
  };

  const retake = () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setFood(null);
    setErr("");
    setStatus("capture");
    setConsent(false);
  };

  const analyze = async () => {
    if (!photo || !consent || analysisLock.current) return;
    analysisLock.current = true;
    setStatus("analyzing");
    setErr("");
    try {
      const fileUri = await uploadPrivateAnalysisImage(
        base44.functions,
        photo.file,
        "food_photo"
      );
      if (!mountedRef.current) return;

      const response = await base44.functions.invoke("analyzeFoodPhoto", {
        photoUri: fileUri,
        responseVersion: 2
      });
      if (!mountedRef.current) return;
      const data = response?.data ?? response;
      if (data?.estimate_status === "unable_to_estimate") {
        setErr(data.notes || "This photo is unclear. Try another photo or enter the food manually.");
        setStatus("unable");
        return;
      }
      if (!data || !(Array.isArray(data.items) && data.items.length > 0) && data.calories == null) throw new Error("No estimate returned");
      setFood(data);
      setStatus("found");
    } catch (e) {
      if (!mountedRef.current) return;
      setErr(e?.message || "Couldn't analyze the photo.");
      setStatus("error");
    } finally {
      analysisLock.current = false;
    }
  };
  const items = food?.items ?? (food ? [food] : []);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="food-photo-title"
      aria-describedby="food-photo-description"
      aria-busy={status === "analyzing"}
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-black select-none"
    >
      <p id="food-photo-description" className="sr-only">
        Take or choose a food photo to estimate its calories and macros.
      </p>
      <div className="flex shrink-0 items-center justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div id="food-photo-title" className="flex items-center gap-2 font-medium">
          <Camera className="w-5 h-5" />
          Snap food
        </div>
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className="p-2 -mr-2 after:absolute after:inset-0 after:content-[''] relative min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center"
          aria-label="Close"
          disabled={submitting}
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
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
          <div className="absolute inset-0 flex flex-col overflow-y-auto">
            <img src={photo.url} alt="food" className="min-h-0 w-full flex-1 object-contain" />
            <div className="shrink-0 bg-panel p-4 text-foreground">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-teal" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                Send this photo through private upload to our AI provider for a food estimate. Portions and nutrition can be wrong; I will review them before logging.
              </label>
            </div>
            <div className="flex shrink-0 gap-2 bg-panel p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" className="min-h-11 h-auto min-w-0 flex-1 whitespace-normal py-2" onClick={retake}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retake
              </Button>
              <Button className="min-h-11 h-auto min-w-0 flex-1 whitespace-normal bg-teal py-2 text-buttonText hover:opacity-90" onClick={analyze} disabled={!consent}>
                <Sparkles className="w-4 h-4 mr-1" /> Estimate macros
              </Button>
            </div>
          </div>
        )}

        {status === "analyzing" && (
          <div role="status" aria-live="polite" className="flex flex-col items-center justify-center text-white gap-3">
            <LoaderCircle className="w-8 h-8 animate-spin" />
            <p className="text-sm">Estimating macros…</p>
          </div>
        )}

        {status === "found" && food && (
          <div className="absolute inset-x-0 bottom-0 bg-panel text-foreground rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto">
            <div className="w-10 h-1.5 bg-lineSoft rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Review {items.length} estimated {items.length === 1 ? "food" : "foods"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Photo estimates are not verified. Correct portions and remove mistaken items in the next step.</p>
            {items.map((item, index) => <div key={index} className="mt-3 rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{item.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.serving_description}</div>
              </div>
              {item.confidence && (
                <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-label font-mono uppercase tracking-wide text-muted-foreground">
                  {item.confidence} confidence
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4 text-center">
              <Macro label="kcal" value={item.calories} />
              <Macro label="Protein" value={item.protein_g} unit="g" />
              <Macro label="Carbs" value={item.carbs_g} unit="g" />
              <Macro label="Fat" value={item.fat_g} unit="g" />
            </div>
            {item.fiber_g != null && (
              <div className="text-xs text-muted-foreground mt-2">Fiber {item.fiber_g}g</div>
            )}
            {item.notes && (
              <p className="text-xs text-muted-foreground mt-2 leading-snug">{item.notes}</p>
            )}
            </div>)}
            {food.notes && <p className="mt-2 text-xs text-muted-foreground">{food.notes}</p>}

            <div className="flex flex-col gap-2 mt-5">
              <Button
                className="min-h-11 h-auto whitespace-normal bg-teal py-2 text-buttonText hover:opacity-90"
                onClick={() => submit(true)}
                disabled={submitting}
              >
                <Plus className="w-4 h-4 mr-1" /> {reviewLabel}
              </Button>
              <div className="flex gap-2">
                {items.length === 1 && <Button
                  variant="outline"
                  className="min-h-11 h-auto min-w-0 flex-1 whitespace-normal py-2"
                  onClick={() => submit(false)}
                  disabled={submitting}
                >
                  <Bookmark className="w-4 h-4 mr-1" /> Save to library
                </Button>}
                <Button variant="ghost" className="h-11 min-h-[44px] px-4" disabled={submitting} onClick={retake} aria-label="Choose another photo">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            </div>
          </div>
        )}

        {(status === "error" || status === "unable") && (
          <div role="alert" className="absolute inset-0 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center gap-3 px-8 py-4 text-center text-white">
            <p className="font-medium">{status === "unable" ? "We couldn't estimate this photo" : "Couldn't analyze the photo"}</p>
            <p className="text-sm text-white/70">{err}</p>
            <Button variant="outline" className="mt-2 h-11 min-h-[44px]" onClick={retake}>
              Try another photo
            </Button>
            {onManual && <Button variant="outline" className="min-h-11" onClick={onManual}>Enter food manually</Button>}
          </div>
          </div>
        )}
      </div>
    </div>, document.body
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
