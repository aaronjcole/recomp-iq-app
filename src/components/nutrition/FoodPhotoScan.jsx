import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2, Plus, Bookmark, RefreshCw, Sparkles } from "lucide-react";

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short food or dish name" },
    serving_description: { type: "string", description: "Human-readable portion, e.g. '1 bowl (≈350g)'" },
    serving_grams: { type: "number", description: "Estimated portion weight in grams" },
    calories: { type: "number", description: "Estimated kcal for the shown portion" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    fiber_g: { type: "number" },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    notes: { type: "string", description: "One-line note on assumptions or items that couldn't be identified" }
  },
  required: ["name", "serving_description", "calories", "protein_g", "carbs_g", "fat_g"]
};

export default function FoodPhotoScan({ onClose, onResult }) {
  const inputRef = useRef(null);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [status, setStatus] = useState("capture"); // capture | preview | analyzing | found | error
  const [food, setFood] = useState(null);
  const [err, setErr] = useState("");

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
      const { file_url } = await base44.integrations.Core.UploadFile({ file: photo.file });

      const prompt = `You are a nutrition estimation assistant. Analyze the food in this photo and estimate the nutrition for the VISIBLE PORTION on the plate/in the glass.

Guidelines:
- Identify the dish and its likely ingredients.
- Estimate the portion size as realistically as the photo allows (use the plate/bowl/hand for scale).
- Return per-portion macros (calories, protein, carbs, fat, fiber) for that portion only.
- If multiple items are present, combine into one estimate and name the dish accordingly.
- Be conservative and honest; if the food is ambiguous, give your best estimate and set confidence to "low".
- Do not refuse — always provide your best estimate.

Return ONLY the JSON object matching the schema.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "gemini_3_flash",
        file_urls: [file_url],
        response_json_schema: SCHEMA
      });

      const data = typeof res === "object" && res !== null ? res : null;
      if (!data || data.calories == null) throw new Error("No estimate returned");
      setFood({ ...data, source: "manual" });
      setStatus("found");
    } catch (e) {
      setErr(e?.message || "Couldn't analyze the photo.");
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col select-none">
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-2 font-medium">
          <Camera className="w-5 h-5" />
          Snap food
        </div>
        <button
          onClick={onClose}
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
          <div className="flex flex-col items-center justify-center text-white gap-3">
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
                <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
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
                <Button variant="ghost" className="h-11 min-h-[44px] px-4" onClick={retake}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 px-8 text-center">
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

function Macro({ label, value, unit }) {
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