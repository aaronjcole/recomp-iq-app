import { useMemo, useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { dedupeLogsByDate } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scale, Flame, Dumbbell } from "lucide-react";
import WeightTrendChart from "./WeightTrendChart";
import CalorieAdherenceChart from "./CalorieAdherenceChart";
import StrengthProgressChart from "./StrengthProgressChart";
import ConfidenceRing from "@/components/common/ConfidenceRing";

const WEIGHT_RANGES = [
  { value: 35, label: "35d" },
  { value: 90, label: "90d" },
  { value: null, label: "All" }
];

/**
 * Consolidated visual-trends overview: weight, calorie adherence, and
 * strength progress side by side. Sits at the top of the Progress page as
 * an at-a-glance dashboard; the detailed weight chart and readouts follow.
 */
export default function TrendsDashboard() {
  const { logs, strategy, strengthLogs, signal } = useRecomp();
  const [weightRangeDays, setWeightRangeDays] = useState(35);

  const dedupedLogs = useMemo(() => dedupeLogsByDate(logs), [logs]);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-6">
        {signal && (
          <div className="flex items-center gap-4 rounded-xl bg-teal/10 p-4">
            <ConfidenceRing value={signal.score} size={76} stroke={8} label="Signal" />
            <div className="min-w-0">
              <p className="font-mono text-label uppercase tracking-wider text-teal">Progress Signal</p>
              <h2 className="mt-1 font-semibold">{signal.label}</h2>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">Your current trend confidence across recent progress signals.</p>
            </div>
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-teal" aria-hidden="true" />
                <h2 className="font-medium">Weight</h2>
              </div>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {weightRangeDays === null ? "All history" : `Last ${weightRangeDays} days`} · 7-day avg
              </p>
            </div>
            <div role="group" className="flex gap-1" aria-label="Weight trend range">
              {WEIGHT_RANGES.map(({ value, label }) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={weightRangeDays === value ? "default" : "outline"}
                  aria-pressed={weightRangeDays === value}
                  className={weightRangeDays === value
                    ? "h-11 bg-teal px-3 text-xs text-buttonText hover:opacity-90"
                    : "h-11 border-line px-3 text-xs"}
                  onClick={() => setWeightRangeDays(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <WeightTrendChart dedupedLogs={dedupedLogs} rangeDays={weightRangeDays} />
          </div>
        </div>

        <div className="border-t border-lineSoft pt-5">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="font-medium">Calories vs target</h2>
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {strategy?.calorie_target ? `${strategy.calorie_target} kcal target` : "Set a calorie target"} · Last 35 days
          </p>
          <div className="mt-2">
            <CalorieAdherenceChart dedupedLogs={dedupedLogs} calorieTarget={strategy?.calorie_target ?? null} rangeDays={35} />
          </div>
        </div>

        <div className="border-t border-lineSoft pt-5">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="font-medium">Strength (e1RM)</h2>
          </div>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Estimated one-rep max over time</p>
          <div className="mt-2">
            <StrengthProgressChart strengthLogs={strengthLogs} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
