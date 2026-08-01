import { useState, useEffect } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { calculateBMR } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const FIELDS = [
  { key: "calorie_target", label: "Calories", max: 20000 },
  { key: "protein_target_g", label: "Protein (g)", max: 2000 },
  { key: "carb_target_g", label: "Carbs (g)", max: 3000 },
  { key: "fat_target_g", label: "Fat (g)", max: 2000 },
  { key: "step_target", label: "Steps", max: 200000 }
];

export default function CustomTargetsCard() {
  const { strategy, profile, updateStrategy } = useRecomp();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (strategy) {
      setForm({
        calorie_target: strategy.calorie_target ?? "",
        protein_target_g: strategy.protein_target_g ?? "",
        carb_target_g: strategy.carb_target_g ?? "",
        fat_target_g: strategy.fat_target_g ?? "",
        step_target: strategy.step_target ?? ""
      });
    }
  }, [strategy]);

  if (!strategy || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v === "" ? "" : Number(v) }));
  const num = (v) => (v === "" ? undefined : Number(v));
  const targets = () => ({
    calorie_target: num(form.calorie_target),
    protein_target_g: num(form.protein_target_g),
    carb_target_g: num(form.carb_target_g),
    fat_target_g: num(form.fat_target_g),
    step_target: num(form.step_target)
  });
  const validTargets = FIELDS.every(({ key, max }) => {
    const value = num(form[key]);
    return Number.isFinite(value) && value >= 0 && value <= max;
  });

  let bmr = null;
  if (profile && profile.sex !== "unspecified") {
    try {
      bmr = calculateBMR({
        sex: profile.sex,
        weight_lbs: profile.current_weight_lbs,
        height_in: profile.height_in,
        age: profile.age
      });
    } catch {
      bmr = null;
    }
  }

  const calNum = num(form.calorie_target);
  const protNum = num(form.protein_target_g);
  const warnings = [];
  if (bmr && calNum && calNum < bmr) {
    warnings.push(
      `That's below your estimated BMR (~${bmr} kcal). Eating under your basal rate long-term is hard to sustain and can work against you.`
    );
  }
  if (profile && protNum && protNum < 0.6 * profile.current_weight_lbs) {
    warnings.push(
      `Protein looks quite low for your bodyweight. ~0.7–1g/lb helps protect muscle while dieting.`
    );
  }

  const toggleOverride = (on) => {
    updateStrategy(strategy.id, { manual_override: on }, on ? undefined : "Switched to adaptive targets");
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateStrategy(strategy.id, { ...targets(), manual_override: true }, "Manual target change");
      toast({
        title: "Targets saved",
        description: "Your custom targets are live and logged to your decision history."
      });
    } finally {
      setSaving(false);
    }
  };

  const locked = !strategy.manual_override;

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Custom targets</div>
            <div className="text-sm font-medium">Use my own targets</div>
          </div>
          <Switch checked={!!strategy.manual_override} onCheckedChange={toggleOverride} aria-label="Toggle custom targets" />
        </div>

        <div className={locked ? "space-y-3 opacity-50 pointer-events-none" : "space-y-3"}>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={f.max}
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-xs text-gold bg-questComplete rounded-md p-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={save}
            disabled={locked || saving || !validTargets}
            className="w-full bg-teal text-buttonText hover:opacity-90"
          >
            {saving ? "Saving…" : "Save targets"}
          </Button>
          {!validTargets && !locked && (
            <p role="alert" className="text-xs text-red">
              Enter non-negative targets within the supported range.
            </p>
          )}
        </div>

        {!strategy.manual_override && (
          <p className="text-xs text-muted-foreground">
            Adaptive mode is on — your weekly check-in tunes these automatically based on your trends.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
