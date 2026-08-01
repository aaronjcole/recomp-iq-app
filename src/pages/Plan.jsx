import { useMemo, useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { calculateInitialStrategy, generateScenarioProjection } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DecisionLedgerTimeline from "@/components/common/DecisionLedgerTimeline";
import ChildTopBar from "@/components/ChildTopBar";

const SCENARIOS = [
  { mode: "current_plan", title: "Current plan" },
  { mode: "reduce_150_calories", title: "−150 calories" },
  { mode: "add_2000_steps", title: "+2,000 steps" },
  { mode: "combined", title: "Combined" }
];

export default function Plan() {
  const { profile, strategy, logs } = useRecomp();
  const [weeks, setWeeks] = useState(12);

  const tdee = useMemo(() => (profile ? calculateInitialStrategy(profile).tdee_estimate : null), [profile]);
  const scenarios = useMemo(() => {
    if (!profile || !strategy) return [];
    return generateScenarioProjection({
      logs,
      weeks,
      calorieTarget: strategy.calorie_target,
      tdee,
      goalWeight: profile.goal_weight_lbs,
      currentWeight: profile.current_weight_lbs
    });
  }, [profile, strategy, logs, tdee, weeks]);

  if (!profile || !strategy) return null;

  return (
    <div className="space-y-5">
      <ChildTopBar title="Plan" />

      <div className="flex items-center justify-between">
        <div className="font-medium">Scenario projections</div>
        <div className="flex gap-1">
          {[8, 12, 16].map((w) => (
            <Button
              key={w}
              size="sm"
              variant={weeks === w ? "default" : "outline"}
              className={weeks === w ? "bg-teal text-buttonText hover:opacity-90 h-8 px-3" : "border-line h-8 px-3"}
              onClick={() => setWeeks(w)}
            >
              {w}w
            </Button>
          ))}
        </div>
      </div>

      {scenarios.map((proj, i) => (
        <Card key={proj.mode} className="bg-panel border-line">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{SCENARIOS[i].title}</div>
              <Badge variant="outline" className="capitalize">{proj.confidence}</Badge>
            </div>
            <div className="grid grid-cols-3 text-center">
              <Stat label="Low" value={proj.projected_low_end_weight} />
              <Stat label="Likely" value={proj.projected_median_end_weight} highlight />
              <Stat label="High" value={proj.projected_high_end_weight} />
            </div>
            <p className="text-xs text-muted-foreground">{proj.explanation}</p>
          </CardContent>
        </Card>
      ))}

      <div className="font-medium pt-2">Plan history</div>
      <DecisionLedgerTimeline />
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div>
      <div className={`text-lg font-bold ${highlight ? "text-teal" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
