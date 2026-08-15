import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRecompActions } from "@/lib/RecompContext";
import { estimateOneRepMax } from "@/lib/fitness";
import { useToast } from "@/components/ui/use-toast";

const uid = () => Math.random().toString(36).slice(2, 9);

const TYPE_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mixed", label: "Mixed" },
  { value: "mobility", label: "Mobility" },
  { value: "sport", label: "Sport" }
];

const MUSCLE_SUGGESTIONS = [
  "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Glutes", "Hamstrings", "Quads", "Calves"
];

function sessionToEditState(session) {
  return {
    title: session.title ?? "",
    type: session.type ?? "strength",
    duration: session.duration_minutes != null ? String(session.duration_minutes) : "",
    rpe: session.perceived_exertion != null ? String(session.perceived_exertion) : "",
    muscles: session.muscle_groups ?? [],
    cardio: {
      distance: session.cardio_distance_miles != null ? String(session.cardio_distance_miles) : "",
      hr: session.cardio_avg_heart_rate != null ? String(session.cardio_avg_heart_rate) : ""
    },
    exercises: buildExercises(session.sets ?? [])
  };
}

function buildExercises(sets) {
  const map = new Map();
  for (const s of sets) {
    if (!s?.exercise_name) continue;
    if (!map.has(s.exercise_name)) {
      map.set(s.exercise_name, { id: uid(), name: s.exercise_name, sets: [] });
    }
    map.get(s.exercise_name).sets.push({
      id: uid(),
      weight: s.weight_lbs != null ? String(s.weight_lbs) : "",
      reps: s.reps != null ? String(s.reps) : ""
    });
  }
  return [...map.values()];
}

export default function SessionEditSheet({ session, open, onOpenChange }) {
  const { updateSession } = useRecompActions();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [state, setState] = useState(() => sessionToEditState(session));
  const [muscleInput, setMuscleInput] = useState("");

  // Re-hydrate when a different session is passed in
  const [lastSessionId, setLastSessionId] = useState(session?.id);
  if (session?.id !== lastSessionId) {
    setLastSessionId(session?.id);
    setState(sessionToEditState(session));
  }

  const set = (key, val) => setState((s) => ({ ...s, [key]: val }));

  const isStrength = state.type === "strength" || state.type === "mixed";

  const addMuscle = (val) => {
    const v = (val ?? muscleInput).trim();
    if (!v || state.muscles.some((m) => m.toLowerCase() === v.toLowerCase())) {
      setMuscleInput("");
      return;
    }
    set("muscles", [...state.muscles, v]);
    setMuscleInput("");
  };

  const addExercise = () =>
    set("exercises", [...state.exercises, { id: uid(), name: "", sets: [{ id: uid(), weight: "", reps: "" }] }]);

  const updateExerciseName = (exId, name) =>
    set("exercises", state.exercises.map((e) => (e.id === exId ? { ...e, name } : e)));

  const removeExercise = (exId) =>
    set("exercises", state.exercises.filter((e) => e.id !== exId));

  const addSet = (exId) =>
    set("exercises", state.exercises.map((e) =>
      e.id === exId ? { ...e, sets: [...e.sets, { id: uid(), weight: "", reps: "" }] } : e
    ));

  const updateSet = (exId, setId, field, value) =>
    set("exercises", state.exercises.map((e) =>
      e.id === exId
        ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)) }
        : e
    ));

  const removeSet = (exId, setId) =>
    set("exercises", state.exercises.map((e) =>
      e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e
    ));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const validExercises = state.exercises.filter((e) => e.name.trim());
      const sets = validExercises.flatMap((e) =>
        e.sets
          .filter((s) => s.weight || s.reps)
          .map((s, i) => ({
            exercise_name: e.name.trim(),
            weight_lbs: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            set_index: i + 1
          }))
      );
      const strengthEntries = isStrength
        ? validExercises.flatMap((e) => {
            const validSets = e.sets.filter((s) => s.weight && s.reps);
            if (!validSets.length) return [];
            const best = validSets.reduce((a, b) =>
              estimateOneRepMax(Number(a.weight), Number(a.reps)) >=
              estimateOneRepMax(Number(b.weight), Number(b.reps))
                ? a
                : b
            );
            return [{
              date: session.date,
              lift_name: e.name.trim(),
              weight: Number(best.weight),
              reps: Number(best.reps),
              sets: validSets.length,
              estimated_1rm: estimateOneRepMax(Number(best.weight), Number(best.reps))
            }];
          })
        : [];

      await updateSession({
        id: session.id,
        session: {
          date: session.date,
          type: state.type,
          title: state.title.trim() || state.type,
          duration_minutes: state.duration ? Number(state.duration) : null,
          perceived_exertion: state.rpe ? Number(state.rpe) : null,
          muscle_groups: state.muscles,
          sets,
          cardio_distance_miles:
            (state.type === "cardio" || state.type === "mixed") && state.cardio.distance
              ? Number(state.cardio.distance)
              : undefined,
          cardio_avg_heart_rate:
            (state.type === "cardio" || state.type === "mixed") && state.cardio.hr
              ? Number(state.cardio.hr)
              : undefined
        },
        strengthEntries
      });
      toast({ title: "Session updated" });
      onOpenChange(false);
    } catch {
      toast({ title: "Couldn't update session", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit session</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input
                className="h-11"
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={state.type === "cardio" ? "Morning run" : "Push day, leg day…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={state.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input
                className="h-11"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                value={state.duration}
                onChange={(e) => set("duration", e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>RPE (1–10)</Label>
              <Input
                className="h-11"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                value={state.rpe}
                onChange={(e) => set("rpe", e.target.value)}
                placeholder="How hard was it?"
              />
            </div>
          </div>

          {(state.type === "cardio" || state.type === "mixed") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Distance (mi)</Label>
                <Input
                  className="h-11"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={state.cardio.distance}
                  onChange={(e) => set("cardio", { ...state.cardio, distance: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Avg HR</Label>
                <Input
                  className="h-11"
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={260}
                  value={state.cardio.hr}
                  onChange={(e) => set("cardio", { ...state.cardio, hr: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Muscle groups</Label>
            {state.muscles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {state.muscles.map((m) => (
                  <span key={m} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-panel3 py-1 pl-3 pr-1 text-xs">
                    {m}
                    <button
                      type="button"
                      onClick={() => set("muscles", state.muscles.filter((x) => x !== m))}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${m}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {MUSCLE_SUGGESTIONS.filter((s) =>
                !state.muscles.some((m) => m.toLowerCase() === s.toLowerCase())
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addMuscle(s)}
                  className="min-h-11 rounded-full border border-line px-3 py-1 text-xs text-muted-foreground hover:border-teal/50 hover:text-foreground"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {state.exercises.length > 0 && (
            <div className="space-y-2">
              <Label>Exercises</Label>
              {state.exercises.map((exercise) => (
                <div key={exercise.id} className="rounded-lg border border-lineSoft bg-panel2 overflow-hidden">
                  <div className="flex items-center gap-2 p-2.5">
                    <Input
                      value={exercise.name}
                      onChange={(e) => updateExerciseName(exercise.id, e.target.value)}
                      placeholder="Exercise name"
                      className="h-11 text-sm flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeExercise(exercise.id)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-red hover:bg-panel3"
                      aria-label="Remove exercise"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-2.5 pb-2.5 space-y-1.5">
                    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-label text-muted-foreground px-1 mb-0.5">
                      <span className="w-6 text-center">#</span>
                      <span>Weight (lb)</span>
                      <span>Reps</span>
                      <span className="w-8" />
                    </div>
                    {exercise.sets.map((s, idx) => (
                      <div key={s.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                        <span className="w-6 text-center font-mono text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={s.weight}
                          onChange={(e) => updateSet(exercise.id, s.id, "weight", e.target.value)}
                          className="h-11 text-sm text-center"
                          placeholder="135"
                        />
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={s.reps}
                          onChange={(e) => updateSet(exercise.id, s.id, "reps", e.target.value)}
                          className="h-11 text-sm text-center"
                          placeholder="8"
                        />
                        <button
                          type="button"
                          onClick={() => removeSet(exercise.id, s.id)}
                          className="flex min-h-11 min-w-[2rem] items-center justify-center rounded-lg text-muted-foreground hover:text-red"
                          aria-label={`Remove set ${idx + 1}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSet(exercise.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs font-medium text-teal hover:bg-teal/10"
                    >
                      <Plus className="w-3 h-3" /> Add set
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addExercise}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/10 px-3 text-xs font-medium text-teal hover:bg-teal/15"
          >
            <Plus className="w-3.5 h-3.5" /> Add exercise
          </button>
        </div>

        <SheetFooter className="px-4 pb-6">
          <Button
            className="w-full bg-teal text-buttonText hover:opacity-90"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
