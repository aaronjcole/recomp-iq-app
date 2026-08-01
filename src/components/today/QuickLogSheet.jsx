import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import RatingDrawer from "@/components/today/RatingDrawer";
import { useToast } from "@/components/ui/use-toast";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const EMPTY_FORM = {
  weight_lbs: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  steps: "",
  waist_in: "",
  workout_completed: false,
  hunger_rating: "",
  energy_rating: "",
  soreness_rating: "",
  sleep_hours: "",
  notes: ""
};

/**
 * @typedef {{
 *   weight_lbs?: string | number,
 *   calories?: string | number,
 *   protein_g?: string | number,
 *   carbs_g?: string | number,
 *   fat_g?: string | number,
 *   steps?: string | number,
 *   waist_in?: string | number,
 *   workout_completed?: boolean,
 *   hunger_rating?: string | number,
 *   energy_rating?: string | number,
 *   soreness_rating?: string | number,
 *   sleep_hours?: string | number,
 *   notes?: string,
 * }} QuickLogForm
 */

export default function QuickLogSheet({ open, onOpenChange }) {
  const { todayLog, upsertDailyLog } = useRecomp();
  const { toast } = useToast();
  const [form, setForm] = useState(/** @type {QuickLogForm} */ ({ ...EMPTY_FORM }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        weight_lbs: todayLog?.weight_lbs ?? "",
        calories: todayLog?.calories ?? "",
        protein_g: todayLog?.protein_g ?? "",
        carbs_g: todayLog?.carbs_g ?? "",
        fat_g: todayLog?.fat_g ?? "",
        steps: todayLog?.steps ?? "",
        waist_in: todayLog?.waist_in ?? "",
        workout_completed: todayLog?.workout_completed ?? false,
        hunger_rating: todayLog?.hunger_rating ?? "",
        energy_rating: todayLog?.energy_rating ?? "",
        soreness_rating: todayLog?.soreness_rating ?? "",
        sleep_hours: todayLog?.sleep_hours ?? "",
        notes: todayLog?.notes ?? ""
      });
    }
  }, [open, todayLog]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertDailyLog(todayStr(), {
        weight_lbs: num(form.weight_lbs),
        calories: num(form.calories),
        protein_g: num(form.protein_g),
        carbs_g: num(form.carbs_g),
        fat_g: num(form.fat_g),
        steps: num(form.steps),
        waist_in: num(form.waist_in),
        workout_completed: !!form.workout_completed,
        hunger_rating: num(form.hunger_rating),
        energy_rating: num(form.energy_rating),
        soreness_rating: num(form.soreness_rating),
        sleep_hours: num(form.sleep_hours),
        notes: form.notes || undefined
      });
      toast({ title: "Logged", description: "Today's numbers are saved." });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log today</SheetTitle>
          <SheetDescription>Add the signals you have. Empty fields stay unlogged.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" min={40} max={1200} />
          <Field label="Waist (in)" value={form.waist_in} onChange={(v) => set("waist_in", v)} type="number" min={10} max={150} />
          <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" min={0} max={20000} />
          <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" min={0} max={200000} />
          <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" min={0} max={2000} />
          <Field label="Carbs (g)" value={form.carbs_g} onChange={(v) => set("carbs_g", v)} type="number" min={0} max={3000} />
          <Field label="Fat (g)" value={form.fat_g} onChange={(v) => set("fat_g", v)} type="number" min={0} max={2000} />
          <Field label="Sleep (h)" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" min={0} max={24} />
          <RatingDrawer label="Hunger (1-5)" value={form.hunger_rating} onChange={(v) => set("hunger_rating", v)} />
          <RatingDrawer label="Energy (1-5)" value={form.energy_rating} onChange={(v) => set("energy_rating", v)} />
          <RatingDrawer label="Soreness (1-5)" value={form.soreness_rating} onChange={(v) => set("soreness_rating", v)} />
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
            <Label htmlFor="wc">Workout completed</Label>
            <Switch id="wc" checked={!!form.workout_completed} onCheckedChange={(v) => set("workout_completed", v)} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <SheetFooter className="px-4 pb-6">
          <Button className="w-full bg-teal text-buttonText hover:opacity-90" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save today's log"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * @param {{label: React.ReactNode, value?: string | number, onChange: (value: string) => void, type?: React.HTMLInputTypeAttribute, min?: string | number, max?: string | number}} props
 */
function Field({ label, value, onChange, type = "text", min, max }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} inputMode={type === "number" ? "decimal" : undefined} min={min} max={max} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
