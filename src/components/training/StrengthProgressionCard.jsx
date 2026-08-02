import { useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { summarizeStrengthProgress } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";

const DOT_COLOR = {
  building: "var(--green)",
  stable: "var(--teal)",
  declining: "var(--gold)",
  need_more_data: "var(--muted-foreground)"
};

function topLifts(strengthLogs) {
  const counts = new Map();
  for (const l of strengthLogs) {
    if (!l?.lift_name) continue;
    const e = counts.get(l.lift_name) || { name: l.lift_name, count: 0, last: "" };
    e.count++;
    if ((l.date || "") > e.last) e.last = l.date;
    counts.set(l.lift_name, e);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : -1))
    .slice(0, 3)
    .map((e) => e.name);
}

function liftSeries(strengthLogs, name) {
  return strengthLogs
    .filter((l) => l.lift_name === name && typeof l.estimated_1rm === "number")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map((l) => l.estimated_1rm);
}

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

function LiftRow({ name, summary, series }) {
  const curr = summary.current_estimated_1rm;
  const change = summary.change_lbs;
  const label = summary.label;
  const color = DOT_COLOR[label] || "var(--muted-foreground)";
  const hasTrend = label !== "need_more_data" && change !== null && curr !== null;
  const pct = hasTrend && curr - change !== 0 ? Math.round((change / (curr - change)) * 100) : null;

  return (
    <div className="py-2.5 border-b border-lineSoft last:border-0">
      <div className="flex items-center justify-between">
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
      </div>
      {series.length >= 2 && <Sparkline values={series} color={color} />}
    </div>
  );
}

export default function StrengthProgressionCard() {
  const { strengthLogs } = useRecomp();

  const rows = useMemo(() => {
    if (!strengthLogs || strengthLogs.length === 0) return [];
    return topLifts(strengthLogs).map((name) => ({
      name,
      summary: summarizeStrengthProgress(strengthLogs, name),
      series: liftSeries(strengthLogs, name)
    }));
  }, [strengthLogs]);

  if (rows.length === 0) {
    return (
      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-1">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Strength progression</div>
          <p className="text-sm text-muted-foreground">Log a few lifts to see your 1RM trend.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-1">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">Strength progression</div>
        {rows.map((r) => (
          <LiftRow key={r.name} name={r.name} summary={r.summary} series={r.series} />
        ))}
      </CardContent>
    </Card>
  );
}
