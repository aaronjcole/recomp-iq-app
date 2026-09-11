import { useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { computeNutritionSignal } from "@/lib/fitness/nutritionSignal";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, TrendingUp } from "lucide-react";

const GRADE_TONES = {
  A: "text-green",
  B: "text-teal",
  C: "text-blue",
  D: "text-gold",
  F: "text-red",
  "—": "text-muted-foreground"
};

/**
 * Daily nutrition signal card — renders at the top of the Diary segment.
 * Computes an aggregate grade from macro adherence + per-food quality scoring
 * + the user's weight trend, with a plain-language nudge and goal-trend note.
 * Free for all users — no premium gate.
 */
export default function NutritionSignalCard({ onNudge }) {
  const { strategy, logs, foods, foodLogEntries, profile, preferences } = useRecomp();
  const { selectedDate } = useLoggingDate();

  const signal = useMemo(
    () =>
      computeNutritionSignal({
        log: logs.find((l) => l.date === selectedDate) ?? null,
        foodEntries: foodLogEntries.filter((e) => e.date === selectedDate),
        foods,
        strategy,
        profile,
        preferences,
        logs,
        referenceDate: selectedDate
      }),
    [logs, selectedDate, foodLogEntries, foods, strategy, profile, preferences]
  );

  const tone = GRADE_TONES[signal.grade] ?? "text-muted-foreground";

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center shrink-0">
            <span className={`font-mono text-3xl font-bold tabular-nums ${tone}`}>
              {signal.grade}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {signal.score}/100
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{signal.summary}</p>
          </div>
        </div>

        {signal.nudge && (
          <button
            type="button"
            onClick={() => onNudge?.(signal.nudgeAction)}
            className="flex w-full items-center gap-2 rounded-lg bg-panel2 px-3 py-2.5 text-left active:opacity-70 transition-opacity"
          >
            <span className="text-sm text-foreground">{signal.nudge}</span>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          </button>
        )}

        {signal.goalTrendNote && (
          <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
            <p className="text-xs text-foreground/90">{signal.goalTrendNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}