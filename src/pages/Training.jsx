import { useState } from "react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { estimateOneRepMax } from "@/lib/fitness";
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
import { Plus } from "lucide-react";
import StrengthProgressionCard from "@/components/training/StrengthProgressionCard";
import SessionHistory from "@/components/training/SessionHistory";

const num = (v) => (v === "" ? null : Number(v));

export default function Training() {
  const { sessions, addSession, upsertDailyLog, addStrengthLog } = useRecomp();
  const [form, setForm] = useState({ date: todayStr(), type: "strength", title: "", duration_minutes: "", perceived_exertion: "", muscle_groups: "", notes: "" });
  const [lift, setLift] = useState({ lift_name: "", weight: "", reps: "", sets: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveSession = async () => {
    const data = {
      date: form.date,
      type: form.type,
      title: form.title || form.type,
      duration_minutes: num(form.duration_minutes),
      perceived_exertion: num(form.perceived_exertion),
      muscle_groups: form.muscle_groups ? form.muscle_groups.split(",").map((s) => s.trim()).filter(Boolean) : [],
      notes: form.notes || undefined
    };
    await addSession(data);
    if (form.date === todayStr()) {
      await upsertDailyLog(todayStr(), { workout_completed: true, workout_type: form.type });
    }
    setForm({ date: todayStr(), type: "strength", title: "", duration_minutes: "", perceived_exertion: "", muscle_groups: "", notes: "" });
  };

  const saveLift = async () => {
    await addStrengthLog({
      date: todayStr(),
      lift_name: lift.lift_name,
      weight: Number(lift.weight),
      reps: Number(lift.reps),
      sets: Number(lift.sets) || 1,
      estimated_1rm: estimateOneRepMax(Number(lift.weight), Number(lift.reps))
    });
    setLift({ lift_name: "", weight: "", reps: "", sets: "" });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Training</h1>

      <StrengthProgressionCard />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="font-medium">Log a session</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="cardio">Cardio</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="mobility">Mobility</SelectItem>
                  <SelectItem value="sport">Sport</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Push day, 5k run…" />
            </div>
            <Field label="Duration (min)" v={form.duration_minutes} on={(v) => set("duration_minutes", v)} />
            <Field label="RPE (1-10)" v={form.perceived_exertion} on={(v) => set("perceived_exertion", v)} />
            <div className="col-span-2 space-y-1.5">
              <Label>Muscle groups</Label>
              <Input value={form.muscle_groups} onChange={(e) => set("muscle_groups", e.target.value)} placeholder="chest, triceps" />
            </div>
          </div>
          <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={saveSession} disabled={!form.date}>
            <Plus className="w-4 h-4 mr-1" /> Save session
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="font-medium">Quick strength log</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Lift</Label>
              <Input value={lift.lift_name} onChange={(e) => setLift((l) => ({ ...l, lift_name: e.target.value }))} placeholder="Bench press" />
            </div>
            <Field label="Weight (lb)" v={lift.weight} on={(v) => setLift((l) => ({ ...l, weight: v }))} />
            <Field label="Reps" v={lift.reps} on={(v) => setLift((l) => ({ ...l, reps: v }))} />
          </div>
          <Button variant="outline" className="w-full" onClick={saveLift} disabled={!lift.lift_name || !lift.weight || !lift.reps}>
            Log lift
          </Button>
        </CardContent>
      </Card>

      <SessionHistory />
    </div>
  );
}

function Field({ label, v, on }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}