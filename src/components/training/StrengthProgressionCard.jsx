import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useRecomp } from "@/lib/RecompContext";
import { liftSessions, loggedLifts, summarizeStrengthProgress } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import ExerciseHistorySheet from "@/components/training/ExerciseHistorySheet";

const DOT_COLOR = {
  building: "var(--green)",
  stable: "var(--teal)",
  declining: "var(--gold)",
  need_more_data: "var(--muted-foreground)"
};

function Sparkline({ values, color }) {
  const w = 100;
  const h = 28;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 2 * pad) + pad;
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-7">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LiftRow({ name, summary, series, onOpen }) {
  const curr = summary.current_estimated_1rm;
  const change = summary.change_lbs;
  const label = summary.label;
  const color = DOT_COLOR[label] || "var(--muted-foreground)";
  const hasTrend = label !== "need_more_data" && change !== null && curr !== null;
  const pct = hasTrend && curr - change !== 0 ? Math.round((change / (curr - change)) * 100) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full py-2.5 text-left border-b border-lineSoft last:border-0"
      aria-label={`${name} history`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground truncate">{name}</div>
          <div className="font-mono text-xl font-bold tabular-nums leading-tight">
            {curr != null ? `${Math.round(curr)} lb` : "—"}
          </div>
        </div>
        <div className="text-right shrink-0">
          {label === "need_more_data" ? (
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Need more data</div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                <span className="font-mono text-xs tabular-nums">
                  {change > 0 ? "+" : ""}
                  {Math.round(change)} lb
                </span>
              </div>
              {pct !== null && (
                <div className="font-mono text-xs tabular-nums text-muted-foreground mt-0.5">
                  {pct > 0 ? "+" : ""}
                  {pct}%
                </div>
              )}
            </>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {series.length >= 2 && <Sparkline values={series} color={color} />}
    </button>
  );
}

export default function StrengthProgressionCard() {
  const { strengthLogs, sessions, trend } = useRecomp();
  const [openLift, setOpenLift] = useState(null);

  // Lifts are grouped by normalized name, so "Bench Press" and "bench press"
  // are one history.
  const rows = useMemo(() => {
    if (!strengthLogs || strengthLogs.length === 0) return [];
    return loggedLifts(strengthLogs).slice(0, 3).map((lift) => {
      const history = liftSessions(strengthLogs, lift.key);
      const named = history.map((row) => ({ ...row, lift_name: lift.name }));
      return {
        lift,
        summary: summarizeStrengthProgress(named, lift.name),
        series: history.map((row) => row.estimated_1rm)
      };
    });
  }, [strengthLogs]);

  if (rows.length === 0) {
    return (
      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-1">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Strength progression</h2>
          <p className="text-sm text-muted-foreground">Log a few lifts to see your 1RM trend.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-1">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">Strength progression</h2>
        {rows.map((r) => (
          <LiftRow key={r.lift.key} name={r.lift.name} summary={r.summary} series={r.series} onOpen={() => setOpenLift(r.lift)} />
        ))}
      </CardContent>
      <ExerciseHistorySheet
        lift={openLift}
        strengthLogs={strengthLogs}
        sessions={sessions}
        recovery={trend?.recovery_label ?? "unknown"}
        onOpenChange={(open) => { if (!open) setOpenLift(null); }}
      />
    </Card>
  );
}
