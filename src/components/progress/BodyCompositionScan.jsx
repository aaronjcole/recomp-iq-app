import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { todayStr } from "@/lib/RecompContext";
import { uploadPrivateAnalysisImage, validateAnalysisImage } from "@/lib/analysisImages";
import { useToast } from "@/components/ui/use-toast";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Camera, Loader2, RefreshCw, ScanLine, X } from "lucide-react";

const POSES = Object.freeze([
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" }
]);

const EMPTY_PHOTOS = Object.freeze({ front: null, side: null, back: null });

function storageKey(userId) {
  return `recompone_body_scan_${userId ?? "anon"}`;
}

function revokePreviews(photos) {
  Object.values(photos).forEach((photo) => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
  });
}

function formatRange(low, high, suffix = "") {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "—";
  return `${Math.round(low * 10) / 10}–${Math.round(high * 10) / 10}${suffix}`;
}

export default function BodyCompositionScan() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [photos, setPhotos] = useState(EMPTY_PHOTOS);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const fileRefs = useRef({});
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => revokePreviews(photosRef.current), []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(user?.id));
      setResult(saved ? JSON.parse(saved) : null);
    } catch {
      setResult(null);
      try { sessionStorage.removeItem(storageKey(user?.id)); } catch { /* ignore */ }
    }
  }, [user?.id]);

  const allSet = POSES.every(({ key }) => photos[key]);

  const onPick = (key, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      validateAnalysisImage(file);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setError("");
    const url = URL.createObjectURL(file);
    setPhotos((previous) => {
      if (previous[key]?.url) URL.revokeObjectURL(previous[key].url);
      return { ...previous, [key]: { file, url } };
    });
  };

  const clearSlot = (key) => {
    setPhotos((previous) => {
      if (previous[key]?.url) URL.revokeObjectURL(previous[key].url);
      return { ...previous, [key]: null };
    });
  };

  const analyze = async () => {
    if (!allSet || analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      const entries = await Promise.all(
        POSES.map(async ({ key }) => [
          key,
          await uploadPrivateAnalysisImage(base44.integrations.Core, photos[key].file)
        ])
      );
      const response = await base44.functions.invoke("analyzeBodyComposition", {
        photoRefs: Object.fromEntries(entries)
      });
      const data = response?.data ?? response;
      if (!data || typeof data !== "object") throw new Error("The analysis returned no result.");

      const enriched = { ...data, date: todayStr() };
      setResult(enriched);
      try { sessionStorage.setItem(storageKey(user?.id), JSON.stringify(enriched)); } catch { /* ignore */ }
      setPhotos((previous) => {
        revokePreviews(previous);
        return EMPTY_PHOTOS;
      });
      toast({ title: "Estimate ready" });
    } catch (analysisError) {
      setError(analysisError?.message || "The estimate failed. Try again.");
      toast({ title: "Couldn't analyze photos", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setResult(null);
    try { sessionStorage.removeItem(storageKey(user?.id)); } catch { /* ignore */ }
  };

  return (
    <Card className="border-line bg-panel">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ScanLine className="h-4 w-4 text-teal" aria-hidden="true" />
          <h2 className="font-medium">AI body-composition range</h2>
          <PremiumBadge />
        </div>
        <p className="text-xs text-muted-foreground">
          Add front, side, and back photos for an approximate educational range and practical tips.
          This is not a medical measurement.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {POSES.map(({ key, label }) => {
            const photo = photos[key];
            return (
              <div key={key} className="relative space-y-1">
                <input
                  ref={(element) => { fileRefs.current[key] = element; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => onPick(key, event)}
                />
                <button
                  type="button"
                  onClick={() => fileRefs.current[key]?.click()}
                  aria-label={photo ? `Replace ${label.toLowerCase()} photo` : `Add ${label.toLowerCase()} photo`}
                  className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-panel2"
                >
                  {photo ? (
                    <img src={photo.url} alt={`${label} preview`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Camera className="h-5 w-5" aria-hidden="true" />
                      <span className="font-mono text-label uppercase tracking-wider">{label}</span>
                    </span>
                  )}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => clearSlot(key)}
                    aria-label={`Remove ${label.toLowerCase()} photo`}
                    className="absolute right-1 top-1 flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <Button
          className="w-full bg-teal text-buttonText hover:opacity-90"
          onClick={analyze}
          disabled={!allSet || analyzing}
        >
          {analyzing
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <ScanLine className="mr-1 h-4 w-4" aria-hidden="true" />}
          {analyzing ? "Analyzing…" : "Estimate a range"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Photos are uploaded to private Base44 storage and shared through five-minute signed links.
          RecompOne cannot currently request immediate deletion of those uploaded private files;
          provider retention may apply as described in the Privacy Policy.
        </p>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3 border-t border-lineSoft pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-label uppercase tracking-wider text-muted-foreground">
                  Body-fat range
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatRange(result.bodyFatRangeLowPct, result.bodyFatRangeHighPct, "%")}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-label uppercase tracking-wider text-muted-foreground">
                  Lean-mass range
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatRange(result.leanMassRangeLowLbs, result.leanMassRangeHighLbs, " lb")}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-2 py-0.5 text-xs capitalize">
                Confidence: {result.confidence}
              </span>
              <span className="ml-auto font-mono text-label uppercase tracking-wider text-muted-foreground">
                {result.date}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            {result.tips?.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-label uppercase tracking-wider text-muted-foreground">
                  Practical next steps
                </div>
                <ul className="space-y-1.5">
                  {result.tips.map((tip, index) => (
                    <li key={`${index}-${tip}`} className="flex gap-2 text-sm">
                      <span className="shrink-0 font-mono text-teal">{index + 1}.</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button variant="outline" className="w-full border-line" onClick={reset}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" /> New estimate
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Approximate visual range only—not a diagnosis or medical measurement.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
