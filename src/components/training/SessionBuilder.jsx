import { useState } from "react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
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
  const { addSession, upsertDailyLog, addStrengthLog } = useRecomp();
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
      await addSession(data);
      if (isStrength) {
        await Promise.all(
          validLifts.map((l) =>
            addStrengthLog({
              date,
              lift_name: l.name.trim(),
              weight: Number(l.weight),
              reps: Number(l.reps),
              sets: Math.max(1, Number(l.sets) || 1),
              estimated_1rm: estimateOneRepMax(Number(l.weight), Number(l.reps))
            })
          )
        );
      }
      if (date === todayStr()) {
        await upsertDailyLog(todayStr(), { workout_completed: true, workout_type: type });
      }
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
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Push day, 5k run…" />
          </div>
          <NumField label="Duration (min)" v={duration} on={setDuration} />
          <NumField label="RPE (1-10)" v={rpe} on={setRpe} />
        </div>

        {(type === "cardio" || type === "mixed") && (
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Distance (mi)" v={cardio.distance} on={(v) => setCardio((c) => ({ ...c, distance: v }))} />
            <NumField label="Avg HR" v={cardio.hr} on={(v) => setCardio((c) => ({ ...c, hr: v }))} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Muscle groups</Label>
          {muscleGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {muscleGroups.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full bg-panel3 text-foreground px-2 py-1 text-xs">
                  {m}
                  <button onClick={() => setMuscleGroups((g) => g.filter((x) => x !== m))} className="text-muted-foreground hover:text-foreground">
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
          />
          <div className="flex flex-wrap gap-1">
            {MUSCLE_SUGGESTIONS.filter((s) => !muscleGroups.some((m) => m.toLowerCase() === s.toLowerCase())).map((s) => (
              <button key={s} type="button" onClick={() => addMuscle(s)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground min-h-[28px]">
                + {s}
              </button>
            ))}
          </div>
        </div>

        {isStrength && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lifts</Label>
              <button onClick={addLift} className="text-xs text-teal font-medium inline-flex items-center gap-1 min-h-[28px]">
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
                    <Input value={l.name} onChange={(e) => updateLift(l.id, "name", e.target.value)} placeholder="Bench press" className="h-8 text-sm" />
                    <button onClick={() => removeLift(l.id)} className="text-muted-foreground hover:text-red shrink-0 p-1 min-w-[36px] min-h-[36px] flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <NumField compact label="Weight" v={l.weight} on={(v) => updateLift(l.id, "weight", v)} />
                    <NumField compact label="Reps" v={l.reps} on={(v) => updateLift(l.id, "reps", v)} />
                    <NumField compact label="Sets" v={l.sets} on={(v) => updateLift(l.id, "sets", v)} />
                    <div className="space-y-1">
                      <Label className="text-[10px]">1RM</Label>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground h-8 flex items-center">
                        {e1rm != null ? `${e1rm}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={!canSave || saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          {saving ? "Saving…" : "Save session"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NumField({ label, v, on, compact }) {
  return (
    <div className="space-y-1">
      <Label className={compact ? "text-[10px]" : ""}>{label}</Label>
      <Input type="number" inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} className={compact ? "h-8 text-sm" : ""} />
    </div>
  );
}