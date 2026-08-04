import { useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { strengthTrend } from "@/lib/fitness";
import ConfidenceRing from "@/components/common/ConfidenceRing";
import SignalStat from "@/components/common/SignalStat";

const CHIP = {
  "High confidence": "border-teal text-teal",
  "Building confidence": "border-gold text-gold",
  "Early read": "border-muted-foreground text-muted-foreground"
};

const RECOVERY_STATUS = { good: "good", moderate: "watch", poor: "bad", unknown: "neutral" };

const signed = (n, unit) => `${n > 0 ? "+" : ""}${n} ${unit}`;

export default function RecompSignalHero() {
  const { signal, recompSignal, boss, trend, strengthLogs } = useRecomp();

  const strength = useMemo(() => strengthTrend(strengthLogs), [strengthLogs]);
  const strengthCell = useMemo(() => {
    if (!strength) return null;
    const status = strength.direction === "up" ? "good" : strength.direction === "down" ? "watch" : "neutral";
    const value = `${strength.change_percent > 0 ? "+" : ""}${strength.change_percent}`;
    return { label: "STRENGTH", value, unit: "% e1RM", status };
  }, [strength]);

  if (!signal || !trend) return null;

  const isEarly = signal.label === "Early read";

  const weightCell = {
    label: "WEIGHT",
    value: trend.weight_change_lbs !== null ? signed(trend.weight_change_lbs, "lb/wk") : "—",
    status: trend.trend_label === "flat" ? "neutral" : trend.trend_label === "losing" ? "good" : trend.trend_label === "gaining" ? "watch" : "neutral"
  };

  const waistCell = {
    label: "WAIST",
    value: trend.waist_change_in !== null ? signed(trend.waist_change_in, "in") : "—",
    status: trend.waist_label === "down" ? "good" : trend.waist_label === "up" ? "watch" : "neutral"
  };

  const fuelCell = {
    label: "FUEL",
    value: trend.calorie_adherence != null ? `${Math.round(trend.calorie_adherence * 100)}%` : "—",
    status: (trend.calorie_adherence ?? 0) >= 0.8 ? "good" : "watch"
  };

  const proteinCell = {
    label: "PROTEIN",
    value: trend.protein_adherence != null ? `${Math.round(trend.protein_adherence * 100)}%` : "—",
    status: (trend.protein_adherence ?? 0) >= 0.8 ? "good" : "watch"
  };

  const recoveryCell = {
    label: "RECOVERY",
    value:
      trend.recovery_label && trend.recovery_label !== "unknown"
        ? trend.recovery_label.charAt(0).toUpperCase() + trend.recovery_label.slice(1)
        : "—",
    status: RECOVERY_STATUS[trend.recovery_label] ?? "neutral"
  };

  let cells = [weightCell, waistCell, strengthCell, fuelCell, proteinCell, recoveryCell].filter(Boolean);
  if (isEarly) cells = cells.filter((c) => c.value !== "—");

  const chipClass = CHIP[signal.label] ?? CHIP["Early read"];
  const coachLine = boss?.countermove || signal.copy;

  return (
    <div className="rounded-xl bg-panel border border-line shadow p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-label uppercase tracking-wider text-muted-foreground">Recomp Signal</h2>
        <span className={`font-mono text-label uppercase tracking-wider px-2 py-0.5 rounded-full border ${chipClass}`}>
          {signal.label}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <ConfidenceRing value={signal.score} size={120} stroke={12} label="Signal" />
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="font-semibold text-lg leading-tight">{recompSignal?.label ?? "—"}</div>
          <p className="text-sm text-muted-foreground leading-snug">{recompSignal?.copy ?? "—"}</p>
        </div>
      </div>

      {cells.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {cells.map((c) => (
            <SignalStat key={c.label} label={c.label} value={c.value} unit={c.unit} status={c.status} />
          ))}
        </div>
      )}

      {coachLine && (
        <div className="rounded-lg bg-panel2 px-3 py-2.5">
          <p className="text-sm leading-snug">
            {boss && <span className="font-bold">{boss.title}. </span>}
            {coachLine}
          </p>
        </div>
      )}
    </div>
  );
}
