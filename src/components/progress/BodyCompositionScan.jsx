import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { base44 } from "@/api/base44Client";
import { GOAL_LABELS } from "@/lib/fitness";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, ScanLine, RefreshCw, AlertTriangle } from "lucide-react";

const POSES = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" }
];

const SCHEMA = {
  type: "object",
  properties: {
    body_fat_pct: { type: "number", description: "Estimated body fat percentage (0-60)" },
    category: { type: "string", description: "e.g. Essential, Athletic, Fitness, Average, Above average" },
    lean_mass_estimate_lbs: { type: "number", description: "Estimated lean body mass in pounds" },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    summary: { type: "string", description: "One-paragraph holistic assessment" },
    tips: { type: "array", items: { type: "string" }, description: "3-6 concrete, personalized improvement tips" }
  },
  required: ["body_fat_pct", "category", "confidence", "summary", "tips"]
};

function storageKey(userId) {
  return `recompiq_bf_scan_${userId ?? "anon"}`;
}

export default function BodyCompositionScan() {
  const { user } = useAuth();
  const { profile, strategy, todayLog } = useRecomp();
  const { toast } = useToast();

  const [photos, setPhotos] = useState({ front: null, side: null, back: null });
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRefs = useRef({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(user?.id));
      if (saved) setResult(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [user?.id]);

  const allSet = POSES.every((p) => photos[p.key]);

  const onPick = (key, e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((prev) => {
      if (prev[key]?.url) URL.revokeObjectURL(prev[key].url);
      return { ...prev, [key]: { file, url } };
    });
  };

  const clearSlot = (key) => {
    setPhotos((prev) => {
      if (prev[key]?.url) URL.revokeObjectURL(prev[key].url);
      return { ...prev, [key]: null };
    });
  };

  const analyze = async () => {
    if (!allSet || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        POSES.map(async (p) => {
          const { file_url } = await base44.integrations.Core.UploadFile({ file: photos[p.key].file });
          return file_url;
        })
      );

      const prompt = `You are a body-recomposition expert analyzing physique photos to estimate body composition.

USER PROFILE:
- Sex: ${profile?.sex ?? "unspecified"}; Age: ${profile?.age ?? "n/a"}
- Height: ${profile?.height_in ? Math.round(profile.height_in) + " in" : "n/a"}
- Current weight: ${profile?.current_weight_lbs ?? todayLog?.weight_lbs ?? "n/a"} lb
- Goal: ${GOAL_LABELS[profile?.goal]?.label ?? profile?.goal ?? "n/a"}
- Experience: ${profile?.experience_level ?? "n/a"}
- Current targets: ${strategy?.calorie_target ?? "n/a"} kcal, ${strategy?.protein_target_g ?? "n/a"}g protein

You are given FRONT, SIDE, and BACK physique photos of the same person (in that order).

TASK:
1. Estimate body fat percentage as accurately as the photos allow. Consider muscularity, vascularity, abdominal definition, and overall leanness across all three angles.
2. Estimate lean body mass in pounds (weight × (1 - bodyfat fraction)).
3. Assign a descriptive category.
4. Rate your confidence honestly (photo-based estimates are approximate).
5. Write a short, non-judgmental holistic summary.
6. Give 3-6 concrete, personalized improvement tips aligned to the user's goal. Apply NASM-aligned training principles (progressive overload, balanced movement, recovery) and adherence-based, non-shaming nutrition guidance (no moralizing food, flexible resets). Tie tips to their actual targets and experience level.

Return ONLY the JSON object matching the schema. Use only numbers from the profile where relevant; the body fat and lean mass estimates are yours to derive.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "gemini_3_flash",
        file_urls: uploaded,
        response_json_schema: SCHEMA
      });

      const data = typeof res === "object" && res !== null ? res : null;
      if (!data) throw new Error("No result");
      const enriched = { ...data, date: todayStr() };
      setResult(enriched);
      try { localStorage.setItem(storageKey(user?.id), JSON.stringify(enriched)); } catch { /* ignore */ }
      // free local previews after analysis
      setPhotos({ front: null, side: null, back: null });
      toast({ title: "Analysis complete" });
    } catch (e) {
      setError(e?.message || "Analysis failed. Try again.");
      toast({ title: "Couldn't analyze photos", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setResult(null);
    try { localStorage.removeItem(storageKey(user?.id)); } catch { /* ignore */ }
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-teal" />
          <span className="font-medium">Body composition scan</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Upload front, side, and back photos for an AI body-fat estimate and personalized tips. Photos are uploaded for analysis — not stored in your on-device photo timeline.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {POSES.map((p) => {
            const photo = photos[p.key];
            return (
              <div key={p.key} className="space-y-1">
                <input
                  ref={(el) => (fileRefs.current[p.key] = el)}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onPick(p.key, e)}
                />
                <button
                  type="button"
                  onClick={() => fileRefs.current[p.key]?.click()}
                  className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-panel2 border border-line flex items-center justify-center"
                >
                  {photo ? (
                    <>
                      <img src={photo.url} alt={p.label} className="w-full h-full object-cover" />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearSlot(p.key); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clearSlot(p.key); } }}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >
                        ×
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px] font-mono uppercase tracking-wider">{p.label}</span>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <Button
          className="w-full bg-teal text-buttonText hover:opacity-90"
          onClick={analyze}
          disabled={!allSet || analyzing}
        >
          {analyzing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1" />}
          {analyzing ? "Analyzing…" : "Estimate body fat"}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2 border-t border-lineSoft">
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Estimated body fat</div>
                <div className="text-3xl font-bold tabular-nums">{Math.round(result.body_fat_pct)}<span className="text-lg text-muted-foreground">%</span></div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lean mass</div>
                <div className="text-lg font-semibold tabular-nums">{result.lean_mass_estimate_lbs != null ? `${Math.round(result.lean_mass_estimate_lbs)} lb` : "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-panel3 px-2 py-0.5 text-xs">{result.category}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs capitalize">Confidence: {result.confidence}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">{result.date}</span>
            </div>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            {result.tips?.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Personalized tips</div>
                <ul className="space-y-1.5">
                  {result.tips.map((t, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-teal font-mono shrink-0">{i + 1}.</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button variant="outline" className="border-line w-full" onClick={reset}>
              <RefreshCw className="w-4 h-4 mr-1" /> New scan
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Estimate only — not a medical measurement. For guidance, consult a qualified professional.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}