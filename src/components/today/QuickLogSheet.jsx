import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { useToast } from "@/components/ui/use-toast";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function QuickLogSheet({ open, onOpenChange }) {
  const { todayLog, upsertDailyLog } = useRecomp();
  const { toast } = useToast();
  const [form, setForm] = useState({});
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
        </SheetHeader>
        <div className="grid grid-cols-2 gap-4 px-4 py-4">
          <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" />
          <Field label="Waist (in)" value={form.waist_in} onChange={(v) => set("waist_in", v)} type="number" />
          <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" />
          <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" />
          <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" />
          <Field label="Carbs (g)" value={form.carbs_g} onChange={(v) => set("carbs_g", v)} type="number" />
          <Field label="Fat (g)" value={form.fat_g} onChange={(v) => set("fat_g", v)} type="number" />
          <Field label="Sleep (h)" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" />
          <RatingField label="Hunger (1-5)" value={form.hunger_rating} onChange={(v) => set("hunger_rating", v)} />
          <RatingField label="Energy (1-5)" value={form.energy_rating} onChange={(v) => set("energy_rating", v)} />
          <RatingField label="Soreness (1-5)" value={form.soreness_rating} onChange={(v) => set("soreness_rating", v)} />
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
            <Label htmlFor="wc">Workout completed</Label>
            <Switch id="wc" checked={form.workout_completed} onCheckedChange={(v) => set("workout_completed", v)} />
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function RatingField({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ? String(value) : ""} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}