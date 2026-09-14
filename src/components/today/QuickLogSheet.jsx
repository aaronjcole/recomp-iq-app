import { useState, useEffect, useId, useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRecomp } from "@/lib/RecompContext";
import RatingControl from "@/components/today/RatingControl";
import { HAPTIC_TRIGGERS, triggerHaptic } from "@/lib/haptics";
import { todayStr, formatWeekdayName } from "@/lib/loggingDateUtils";

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
  sleep_quality: "",
  notes: ""
};

// Fields shown in Simple mode — the daily essentials.
const SIMPLE_KEYS = ["weight_lbs", "sleep_hours", "calories", "protein_g", "steps"];

export default function QuickLogSheet({ open, onOpenChange, date = todayStr() }) {
  const { logs, upsertDailyLog } = useRecomp();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState("simple");

  const logForDate = useMemo(() => logs.find((l) => l.date === date) ?? null, [logs, date]);
  const isToday = date === todayStr();
  const weekday = formatWeekdayName(date);

  useEffect(() => {
    if (open) {
      setForm({
        weight_lbs: logForDate?.weight_lbs ?? "",
        calories: logForDate?.calories ?? "",
        protein_g: logForDate?.protein_g ?? "",
        carbs_g: logForDate?.carbs_g ?? "",
        fat_g: logForDate?.fat_g ?? "",
        steps: logForDate?.steps ?? "",
        waist_in: logForDate?.waist_in ?? "",
        workout_completed: logForDate?.workout_completed ?? false,
        hunger_rating: logForDate?.hunger_rating ?? "",
        energy_rating: logForDate?.energy_rating ?? "",
        soreness_rating: logForDate?.soreness_rating ?? "",
        sleep_hours: logForDate?.sleep_hours ?? "",
        sleep_quality: logForDate?.sleep_quality ?? "",
        notes: logForDate?.notes ?? ""
      });
      setViewMode("simple");
    }
  }, [open, logForDate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (viewMode === "simple") {
        // Simple mode: only send the essential fields with non-null values.
        // Hidden Full-view fields are preserved in the existing daily log —
        // we never write null for fields omitted from the Simple view.
        const fields = {};
        for (const key of SIMPLE_KEYS) {
          const val = num(form[key]);
          if (val != null) fields[key] = val;
        }
        await upsertDailyLog(date, fields);
      } else {
        // Full mode: send all fields. Null explicitly clears a field the user
        // emptied — this is the only mode that writes null.
        await upsertDailyLog(date, {
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
          sleep_quality: num(form.sleep_quality),
          notes: form.notes || undefined
        });
      }
      triggerHaptic(HAPTIC_TRIGGERS.LOG_SAVED);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  // Date-aware labels
  const titleText = isToday ? "Log today" : `Log ${weekday}`;
  const descText = isToday
    ? "Add the signals you have. Empty fields stay unlogged."
    : `Add the signals you have for ${weekday}. Empty fields stay unlogged.`;
  const saveText = isToday ? "Save today's log" : `Save ${weekday}'s log`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titleText}</SheetTitle>
          <SheetDescription>{descText}</SheetDescription>
        </SheetHeader>

        {/* Simple/Full toggle — low-emphasis segmented control */}
        <div className="px-4 pt-2">
          <div className="inline-flex rounded-lg bg-panel2 p-0.5" role="tablist" aria-label="Log detail level">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "simple"}
              onClick={() => setViewMode("simple")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "simple" ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "full"}
              onClick={() => setViewMode("full")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "full" ? "bg-panel text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Full
            </button>
          </div>
        </div>

        <div className="space-y-5 px-4 py-4">
          {viewMode === "simple" ? (
            <>
              <Section label="Body">
                <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" min={40} max={1200} />
              </Section>

              <Section label="Nutrition">
                <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" min={0} max={20000} />
                <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" min={0} max={2000} />
              </Section>

              <Section label="Activity">
                <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" min={0} max={200000} />
              </Section>

              <Section label="Sleep">
                <Field label="Sleep hours" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" min={0} max={24} />
              </Section>
            </>
          ) : (
            <>
              <Section label="Body">
                <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" min={40} max={1200} />
                <Field label="Waist (in)" value={form.waist_in} onChange={(v) => set("waist_in", v)} type="number" min={10} max={150} />
              </Section>

              <Section label="Nutrition">
                <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" min={0} max={20000} />
                <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" min={0} max={2000} />
                <Field label="Carbs (g)" value={form.carbs_g} onChange={(v) => set("carbs_g", v)} type="number" min={0} max={3000} />
                <Field label="Fat (g)" value={form.fat_g} onChange={(v) => set("fat_g", v)} type="number" min={0} max={2000} />
              </Section>

              <Section label="Activity">
                <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" min={0} max={200000} />
                <div className="col-span-2 flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
                  <Label htmlFor="wc">Workout completed</Label>
                  <Switch id="wc" checked={!!form.workout_completed} onCheckedChange={(v) => set("workout_completed", v)} />
                </div>
              </Section>

              <Section label="Sleep & recovery">
                <Field label="Sleep hours" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" min={0} max={24} />
                <RatingControl label="Sleep quality (1-5)" value={form.sleep_quality} onChange={(v) => set("sleep_quality", v)} />
                <RatingControl label="Energy (1-5)" value={form.energy_rating} onChange={(v) => set("energy_rating", v)} />
                <RatingControl label="Soreness (1-5)" value={form.soreness_rating} onChange={(v) => set("soreness_rating", v)} />
              </Section>

              <Section label="How you felt">
                <RatingControl label="Hunger (1-5)" value={form.hunger_rating} onChange={(v) => set("hunger_rating", v)} />
              </Section>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
              </div>
            </>
          )}
        </div>
        <SheetFooter className="px-4 pb-6">
          <Button className="w-full bg-teal text-buttonText hover:opacity-90" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : saveText}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

/**
 * @param {{label: React.ReactNode, value?: string | number, onChange: (value: string) => void, type?: React.HTMLInputTypeAttribute, min?: string | number, max?: string | number}} props
 */
function Field({ label, value, onChange, type = "text", min, max }) {
  const inputId = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} type={type} inputMode={type === "number" ? "decimal" : undefined} min={min} max={max} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}