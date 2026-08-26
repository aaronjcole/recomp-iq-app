import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { dedupeLogsByDate } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import WeightTrendChart from "@/components/progress/WeightTrendChart";
import CalorieAdherenceChart from "@/components/progress/CalorieAdherenceChart";

/**
 * At-a-glance progress dashboard for the Today (main) view. Shows compact
 * weight and calorie-adherence trends from existing logs. The full
 * TrendsDashboard (including strength) lives on the Progress page.
 */
export default function TodayProgressCard() {
  const { logs, strategy } = useRecomp();
  const dedupedLogs = useMemo(() => dedupeLogsByDate(logs), [logs]);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Your trends</h2>
          <Link to="/progress" className="flex items-center gap-0.5 text-xs text-teal">
            Full progress <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Weight · last 35 days</h3>
          <WeightTrendChart dedupedLogs={dedupedLogs} rangeDays={35} />
        </div>

        <div className="border-t border-lineSoft pt-4">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">
            Calories vs target · last 35 days
          </h3>
          <CalorieAdherenceChart dedupedLogs={dedupedLogs} calorieTarget={strategy?.calorie_target ?? null} rangeDays={35} />
        </div>
      </CardContent>
    </Card>
  );
}