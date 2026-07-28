import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { useToast } from "@/components/ui/use-toast";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function QuickLogCard() {
  const { todayLog, upsertDailyLog } = useRecomp();
  const { toast } = useToast();
  const [weight, setWeight] = useState(todayLog?.weight_lbs ?? "");
  const [workout, setWorkout] = useState(!!todayLog?.workout_completed);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWeight(todayLog?.weight_lbs ?? "");
    setWorkout(!!todayLog?.workout_completed);
  }, [todayLog]);

  const saveWeight = async () => {
    const val = num(weight);
    if (todayLog?.weight_lbs === val) return;
    setSaving(true);
    try {
      await upsertDailyLog(todayStr(), { weight_lbs: val });
      toast({ title: "Logged", description: "Weight saved." });
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkout = async (v) => {
    setWorkout(v);
    try {
      await upsertDailyLog(todayStr(), { workout_completed: v });
      toast({ title: "Logged", description: "Workout status saved." });
    } catch {
      setWorkout(!v);
    }
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-4 space-y-3">
        <div className="font-medium text-sm">Quick log</div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">Weight (lb)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={weight ?? ""}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={saveWeight}
              className="h-9"
            />
          </div>
          <Button size="sm" className="bg-teal text-buttonText hover:opacity-90" onClick={saveWeight} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
          <Label htmlFor="quick-wc" className="text-sm">Workout done today</Label>
          <Switch id="quick-wc" checked={workout} onCheckedChange={toggleWorkout} />
        </div>
      </CardContent>
    </Card>
  );
}