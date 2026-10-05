import { useState, useEffect, useId, useMemo, useRef } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { buildDailyLogPatch, validateDailyLogForm } from "@/lib/dailyLogForm";

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
const FULL_KEYS = Object.keys(EMPTY_FORM);

export default function QuickLogSheet({ open, onOpenChange, date = todayStr() }) {
  const { logs, upsertDailyLog } = useRecomp();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState("simple");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const { toast } = useToast();

  const logForDate = useMemo(() => logs.find((l) => l.date === date) ?? null, [logs, date]);
  // Read through a ref so the reset below runs only when the sheet opens or
  // the date changes. A save replaces (or, on failure, rolls back) the log
  // object; resetting on that identity change would wipe the user's input.
  const logForDateRef = useRef(logForDate);
  logForDateRef.current = logForDate;
  const isToday = date === todayStr();
  const weekday = formatWeekdayName(date);

  useEffect(() => {
    if (open) {
      const logForDate = logForDateRef.current;
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
      setErrors({});
    }
  }, [open, date]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const handleSave = async () => {
    if (saving) return;
    // Simple mode sends only the essentials; hidden Full-view fields are
    // preserved in the existing log. Either mode sends null only for a field
    // the user emptied that the log currently has a value for.
    const keys = viewMode === "simple" ? SIMPLE_KEYS : FULL_KEYS;
    const nextErrors = validateDailyLogForm(form, keys);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const fields = buildDailyLogPatch(form, logForDate, keys);
    if (Object.keys(fields).length === 0) {
      // Nothing entered and nothing to clear; the server rejects an empty patch.
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await upsertDailyLog(date, fields);
      triggerHaptic(HAPTIC_TRIGGERS.LOG_SAVED);
      onOpenChange(false);
    } catch {
      // Keep the sheet open with the user's input so they can fix and retry.
      toast({
        title: "Could not save log",
        description: "Your entries are still here. Check them and try again.",
        variant: "destructive"
      });
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
                <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" min={40} max={1200} error={errors.weight_lbs} />
              </Section>

              <Section label="Nutrition">
                <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" min={0} max={20000} error={errors.calories} />
                <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" min={0} max={2000} error={errors.protein_g} />
              </Section>

              <Section label="Activity">
                <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" min={0} max={200000} error={errors.steps} />
              </Section>

              <Section label="Sleep">
                <Field label="Sleep hours" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" min={0} max={24} error={errors.sleep_hours} />
              </Section>
            </>
          ) : (
            <>
              <Section label="Body">
                <Field label="Weight (lb)" value={form.weight_lbs} onChange={(v) => set("weight_lbs", v)} type="number" min={40} max={1200} error={errors.weight_lbs} />
                <Field label="Waist (in)" value={form.waist_in} onChange={(v) => set("waist_in", v)} type="number" min={10} max={150} error={errors.waist_in} />
              </Section>

              <Section label="Nutrition">
                <Field label="Calories" value={form.calories} onChange={(v) => set("calories", v)} type="number" min={0} max={20000} error={errors.calories} />
                <Field label="Protein (g)" value={form.protein_g} onChange={(v) => set("protein_g", v)} type="number" min={0} max={2000} error={errors.protein_g} />
                <Field label="Carbs (g)" value={form.carbs_g} onChange={(v) => set("carbs_g", v)} type="number" min={0} max={3000} error={errors.carbs_g} />
                <Field label="Fat (g)" value={form.fat_g} onChange={(v) => set("fat_g", v)} type="number" min={0} max={2000} error={errors.fat_g} />
              </Section>

              <Section label="Activity">
                <Field label="Steps" value={form.steps} onChange={(v) => set("steps", v)} type="number" min={0} max={200000} error={errors.steps} />
                <div className="col-span-2 flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
                  <Label htmlFor="wc">Workout completed</Label>
                  <Switch id="wc" checked={!!form.workout_completed} onCheckedChange={(v) => set("workout_completed", v)} />
                </div>
              </Section>

              <Section label="Sleep & recovery">
                <Field label="Sleep hours" value={form.sleep_hours} onChange={(v) => set("sleep_hours", v)} type="number" min={0} max={24} error={errors.sleep_hours} />
                <RatingControl label="Sleep quality (1-5)" value={form.sleep_quality} onChange={(v) => set("sleep_quality", v)} />
                <FieldError message={errors.sleep_quality} />
                <RatingControl label="Energy (1-5)" value={form.energy_rating} onChange={(v) => set("energy_rating", v)} />
                <FieldError message={errors.energy_rating} />
                <RatingControl label="Soreness (1-5)" value={form.soreness_rating} onChange={(v) => set("soreness_rating", v)} />
                <FieldError message={errors.soreness_rating} />
              </Section>

              <Section label="How you felt">
                <RatingControl label="Hunger (1-5)" value={form.hunger_rating} onChange={(v) => set("hunger_rating", v)} />
                <FieldError message={errors.hunger_rating} />
              </Section>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} aria-invalid={errors.notes ? true : undefined} />
                <FieldError message={errors.notes} />
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

/** @param {{message?: string}} props */
function FieldError({ message }) {
  if (!message) return null;
  return <p className="col-span-2 text-xs text-destructive">{message}</p>;
}

/**
 * @param {{label: React.ReactNode, value?: string | number, onChange: (value: string) => void, type?: React.HTMLInputTypeAttribute, min?: string | number, max?: string | number, error?: string}} props
 */
function Field({ label, value, onChange, type = "text", min, max, error }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}