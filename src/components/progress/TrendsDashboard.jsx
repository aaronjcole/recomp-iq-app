import { useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { dedupeLogsByDate } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Scale, Flame, Dumbbell } from "lucide-react";
import WeightTrendChart from "./WeightTrendChart";
import CalorieAdherenceChart from "./CalorieAdherenceChart";
import StrengthProgressChart from "./StrengthProgressChart";

/**
 * Consolidated visual-trends overview: weight, calorie adherence, and
 * strength progress side by side. Sits at the top of the Progress page as
 * an at-a-glance dashboard; the detailed weight chart and readouts follow.
 */
export default function TrendsDashboard() {
  const { logs, strategy, strengthLogs } = useRecomp();

  const dedupedLogs = useMemo(() => dedupeLogsByDate(logs), [logs]);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-6">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Scale className="h-4 w-4 text-teal" aria-hidden="true" /> Weight
          </h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Last 35 days · 7-day avg</p>
          <div className="mt-2">
            <WeightTrendChart dedupedLogs={dedupedLogs} rangeDays={35} />
          </div>
        </div>

        <div className="border-t border-lineSoft pt-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Flame className="h-4 w-4 text-teal" aria-hidden="true" /> Calories vs target
          </h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {strategy?.calorie_target ? `${strategy.calorie_target} kcal target` : "Set a calorie target"} · Last 35 days
          </p>
          <div className="mt-2">
            <CalorieAdherenceChart dedupedLogs={dedupedLogs} calorieTarget={strategy?.calorie_target ?? null} rangeDays={35} />
          </div>
        </div>

        <div className="border-t border-lineSoft pt-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Dumbbell className="h-4 w-4 text-teal" aria-hidden="true" /> Strength (e1RM)
          </h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Estimated one-rep max over time</p>
          <div className="mt-2">
            <StrengthProgressChart strengthLogs={strengthLogs} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}