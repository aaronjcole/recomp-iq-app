import { useState } from "react";
import { useRecompActions, todayStr } from "@/lib/RecompContext";
import { estimateOneRepMax } from "@/lib/fitness";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Plus, Trash2, X, Dumbbell, Loader2 } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v) => (v === "" ? null : Number(v));

const MUSCLE_SUGGESTIONS = [
  "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Glutes", "Hamstrings", "Quads", "Calves"
];

const TYPE_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mixed", label: "Mixed" },
  { value: "mobility", label: "Mobility" },
  { value: "sport", label: "Sport" }
];

export default function SessionBuilder() {
  const { saveTrainingSession } = useRecompActions();
  const { toast } = useToast();

  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState("strength");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState("");
  const [muscleGroups, setMuscleGroups] = useState([]);
  const [muscleInput, setMuscleInput] = useState("");
  const [lifts, setLifts] = useState([]);
  const [cardio, setCardio] = useState({ distance: "", hr: "" });
  const [saving, setSaving] = useState(false);

  const isStrength = type === "strength" || type === "mixed";

  const addMuscle = (val) => {
    const v = (val ?? muscleInput).trim();
    if (!v) return;
    if (muscleGroups.some((m) => m.toLowerCase() === v.toLowerCase())) {
      setMuscleInput("");
      return;
    }
    setMuscleGroups((g) => [...g, v]);
    setMuscleInput("");
  };

  const addLift = () =>
    setLifts((l) => [...l, { id: uid(), name: "", weight: "", reps: "", sets: "1" }]);
  const updateLift = (id, k, v) => setLifts((l) => l.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const removeLift = (id) => setLifts((l) => l.filter((x) => x.id !== id));

  const validLifts = lifts.filter((l) => l.name.trim() && l.weight && l.reps);
  const hasCardio = cardio.distance || cardio.hr;
  const canSave = !!date && (isStrength ? validLifts.length > 0 || title.trim() : title.trim() || hasCardio || duration);

  const reset = () => {
    setDate(todayStr());
    setType("strength");
    setTitle("");
    setDuration("");
    setRpe("");
    setMuscleGroups([]);
    setMuscleInput("");
    setLifts([]);
    setCardio({ distance: "", hr: "" });
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const sets = validLifts.flatMap((l) => {
        const count = Math.max(1, Number(l.sets) || 1);
        return Array.from({ length: count }, (_, i) => ({
          exercise_name: l.name.trim(),
          weight_lbs: Number(l.weight),
          reps: Number(l.reps),
          set_index: i + 1
        }));
      });
      const data = {
        date,
        type,
        title: title.trim() || (type === "cardio" ? "Cardio" : type === "strength" ? "Strength" : type),
        duration_minutes: num(duration),
        perceived_exertion: num(rpe),
        muscle_groups: muscleGroups,
        sets,
        cardio_distance_miles: type === "cardio" || type === "mixed" ? num(cardio.distance) : undefined,
        cardio_avg_heart_rate: type === "cardio" || type === "mixed" ? num(cardio.hr) : undefined
      };
      const strengthEntries = isStrength
        ? validLifts.map((l) => ({
            date,
            lift_name: l.name.trim(),
            weight: Number(l.weight),
            reps: Number(l.reps),
            sets: Math.max(1, Number(l.sets) || 1),
            estimated_1rm: estimateOneRepMax(Number(l.weight), Number(l.reps))
          }))
        : [];
      await saveTrainingSession({
        session: data,
        strengthEntries,
        markDaily: date === todayStr()
      });
      toast({ title: "Session logged", description: `${data.title} saved for ${date}.` });
      reset();
    } catch (e) {
      toast({ title: "Couldn't save session", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-teal" />
          <span className="font-medium">Log a session</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Push day, 5k run…" />
          </div>
          <NumField label="Duration (min)" v={duration} on={setDuration} min={0} max={1440} />
          <NumField label="RPE (1-10)" v={rpe} on={setRpe} min={1} max={10} />
        </div>

        {(type === "cardio" || type === "mixed") && (
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Distance (mi)" v={cardio.distance} on={(v) => setCardio((c) => ({ ...c, distance: v }))} min={0} max={1000} />
            <NumField label="Avg HR" v={cardio.hr} on={(v) => setCardio((c) => ({ ...c, hr: v }))} min={20} max={260} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Muscle groups</Label>
          {muscleGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {muscleGroups.map((m) => (
                <span key={m} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-panel3 py-1 pl-3 pr-1 text-xs text-foreground">
                  {m}
                  <button
                    type="button"
                    onClick={() => setMuscleGroups((g) => g.filter((x) => x !== m))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-panel2 hover:text-foreground"
                    aria-label={`Remove ${m}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            value={muscleInput}
            onChange={(e) => setMuscleInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addMuscle(); } }}
            placeholder="Type and press enter"
            className="h-11"
          />
          <div className="flex flex-wrap gap-1">
            {MUSCLE_SUGGESTIONS.filter((s) => !muscleGroups.some((m) => m.toLowerCase() === s.toLowerCase())).map((s) => (
              <button key={s} type="button" onClick={() => addMuscle(s)} className="min-h-11 rounded-full border border-line px-3 py-1 text-xs text-muted-foreground hover:border-teal/50 hover:text-foreground">
                + {s}
              </button>
            ))}
          </div>
        </div>

        {isStrength && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lifts</Label>
              <button type="button" onClick={addLift} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-teal/30 bg-teal/10 px-3 text-xs font-medium text-teal hover:bg-teal/15">
                <Plus className="w-3.5 h-3.5" /> Add lift
              </button>
            </div>
            {lifts.length === 0 && (
              <p className="text-xs text-muted-foreground">Add the lifts you performed — log as many as you need per session.</p>
            )}
            {lifts.map((l) => {
              const e1rm = l.weight && l.reps ? Math.round(estimateOneRepMax(Number(l.weight), Number(l.reps))) : null;
              return (
                <div key={l.id} className="rounded-lg border border-lineSoft bg-panel2 p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={l.name} onChange={(e) => updateLift(l.id, "name", e.target.value)} placeholder="Bench press" className="h-11 text-sm" />
                    <button type="button" onClick={() => removeLift(l.id)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1 text-muted-foreground hover:bg-panel3 hover:text-red" aria-label="Remove lift">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <NumField compact label="Weight" v={l.weight} on={(v) => updateLift(l.id, "weight", v)} min={0} max={5000} />
                    <NumField compact label="Reps" v={l.reps} on={(v) => updateLift(l.id, "reps", v)} min={1} max={1000} />
                    <NumField compact label="Sets" v={l.sets} on={(v) => updateLift(l.id, "sets", v)} min={1} max={100} />
                    <div className="space-y-1">
                      <Label className="text-[10px]">1RM</Label>
                      <div className="flex h-11 items-center font-mono text-xs tabular-nums text-muted-foreground">
                        {e1rm != null ? `${e1rm}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button className="min-h-11 w-full bg-teal text-buttonText hover:opacity-90 disabled:bg-panel2 disabled:text-muted-foreground disabled:opacity-100" onClick={save} disabled={!canSave || saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          {saving ? "Saving…" : "Save session"}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * @param {{label: React.ReactNode, v: string | number, on: (value: string) => void, compact?: boolean, min?: string | number, max?: string | number}} props
 */
function NumField({ label, v, on, compact = false, min, max }) {
  return (
    <div className="space-y-1">
      <Label className={compact ? "text-[10px]" : ""}>{label}</Label>
      <Input type="number" inputMode="decimal" min={min} max={max} value={v} onChange={(e) => on(e.target.value)} className={compact ? "h-11 text-sm" : "h-11"} />
    </div>
  );
}
