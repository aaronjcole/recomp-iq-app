import { Link } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * At-a-glance progress dashboard for the Today (main) view. Shows compact
 * weight and calorie-adherence trends from existing logs. The full
 * TrendsDashboard (including strength) lives on the Progress page.
 */
export default function TodayProgressCard() {
  const { trend } = useRecomp();
  const weightChange = trend?.weight_change_lbs;
  const WeightIcon = weightChange == null || Math.abs(weightChange) <= 0.3
    ? Minus
    : weightChange < 0
      ? ArrowDownRight
      : ArrowUpRight;
  const weightLabel = weightChange == null
    ? "Building weight trend"
    : `${weightChange > 0 ? "+" : ""}${weightChange} lb this week`;
  const calorieLabel = trend?.calorie_adherence == null
    ? "Building nutrition trend"
    : `${Math.round(trend.calorie_adherence * 100)}% calorie consistency`;

  return (
    <Card className="bg-panel border-line">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
          <WeightIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Progress snapshot</h2>
          <p className="text-xs text-muted-foreground">{weightLabel} · {calorieLabel}</p>
        </div>
        <Link
          to="/progress" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-teal"
          aria-label="View full progress"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
