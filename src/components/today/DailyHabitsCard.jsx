import { useRecomp, todayStr } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProgressRing from "@/components/common/ProgressRing";
import { Minus, Plus } from "lucide-react";

const WATER_GOAL = 100;
const CUP_OZ = 8;
const SLEEP_STEP = 0.5;

export default function DailyHabitsCard() {
  const { todayLog, upsertDailyLog } = useRecomp();

  const waterOz = todayLog?.water_oz ?? 0;
  const sleepHours = todayLog?.sleep_hours ?? null;

  const addWater = (delta) => {
    const next = Math.max(0, waterOz + delta);
    upsertDailyLog(todayStr(), { water_oz: next });
  };
  const stepSleep = (delta) => {
    const base = sleepHours ?? 0;
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    upsertDailyLog(todayStr(), { sleep_hours: next });
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <ProgressRing
            size={56}
            stroke={6}
            value={waterOz}
            max={WATER_GOAL}
            label={`${Math.round(waterOz)}`}
            sublabel="oz"
          />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Water</div>
            <div className="font-mono text-sm tabular-nums">
              {Math.round(waterOz)} / {WATER_GOAL} oz
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-line"
              onClick={() => addWater(-CUP_OZ)}
              aria-label="Remove a cup of water"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Button
              className="h-8 px-3 text-xs bg-teal text-buttonText hover:opacity-90"
              onClick={() => addWater(CUP_OZ)}
            >
              +1 cup
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sleep</div>
            <div className="font-mono text-sm tabular-nums">
              {sleepHours !== null ? `${sleepHours}h` : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-line"
              onClick={() => stepSleep(-SLEEP_STEP)}
              aria-label="Subtract half an hour of sleep"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-line"
              onClick={() => stepSleep(SLEEP_STEP)}
              aria-label="Add half an hour of sleep"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}