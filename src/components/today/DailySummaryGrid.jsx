import { Link } from "react-router-dom";
import { Footprints, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Daily fuel & activity summary. Desktop renders a 2x2 grid; mobile renders a
 * compact horizontal scroll. Cells: macro ring (calorie progress), total
 * protein, steps, and week weight delta.
 *
 * @param {{ log: any, strategy: any, trend: any }} props
 */
export default function DailySummaryGrid({ log, strategy, trend }) {
  const isMobile = useIsMobile();

  const calories = Number(log?.calories) || 0;
  const protein = Number(log?.protein_g) || 0;
  const steps = Number(log?.steps) || 0;
  const calorieTarget = strategy?.calorie_target || 1;
  const proteinTarget = strategy?.protein_target_g || 1;
  const stepTarget = strategy?.step_target || 1;

  const weightChange = trend?.weight_change_lbs;
  const WeightIcon = weightChange == null || Math.abs(weightChange) <= 0.3
    ? Minus
    : weightChange < 0
      ? TrendingDown
      : TrendingUp;
  const weightLabel = weightChange == null
    ? "—"
    : `${weightChange > 0 ? "+" : ""}${weightChange} lb`;

  const cells = [
    {
      key: "calories",
      label: "FUEL",
      ring: Math.min(1, calories / calorieTarget),
      value: `${Math.round(calories)}`,
      sub: `of ${calorieTarget} kcal`,
      accent: "text-teal"
    },
    {
      key: "protein",
      label: "PROTEIN",
      value: `${Math.round(protein)}g`,
      sub: `of ${proteinTarget}g`,
      accent: "text-teal",
      bar: Math.min(1, protein / proteinTarget)
    },
    {
      key: "steps",
      label: "STEPS",
      icon: Footprints,
      value: steps.toLocaleString(),
      sub: `of ${stepTarget.toLocaleString()}`,
      accent: "text-blue",
      bar: Math.min(1, steps / stepTarget)
    },
    {
      key: "weight",
      label: "WEIGHT Δ",
      icon: WeightIcon,
      value: weightLabel,
      sub: "this week",
      accent: weightChange != null && weightChange < 0 ? "text-teal" : weightChange != null && weightChange > 0 ? "text-gold" : "text-muted-foreground",
      to: "/progress"
    }
  ];

  const containerClass = isMobile
    ? "no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1"
    : "grid grid-cols-2 gap-3";

  return (
    <section aria-label="Daily summary" className={containerClass}>
      {cells.map((cell) => {
        const Icon = cell.icon;
        const body = (
          <div
            className={`flex min-w-[150px] flex-1 flex-col gap-2 rounded-2xl border border-line bg-panel p-4 ${isMobile ? "" : "h-full"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{cell.label}</span>
              {Icon && <Icon className={`h-4 w-4 ${cell.accent}`} aria-hidden="true" />}
            </div>
            <div className="flex items-end gap-3">
              {cell.ring != null && <MiniRing value={cell.ring} />}
              <div className="min-w-0">
                <div className="text-xl font-bold tabular-nums leading-none">{cell.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{cell.sub}</div>
              </div>
            </div>
            {cell.bar != null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full rounded-full bg-teal"
                  style={{ width: `${Math.round(cell.bar * 100)}%` }}
                />
              </div>
            )}
          </div>
        );
        return cell.to ? (
          <Link key={cell.key} to={cell.to} aria-label="View full progress" className={isMobile ? "shrink-0" : ""}>
            {body}
          </Link>
        ) : (
          <div key={cell.key} className={isMobile ? "shrink-0" : ""}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

function MiniRing({ value, size = 52, stroke = 6, color = "var(--teal)" }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--lineSoft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${pct * C} ${C - pct * C}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums">
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
}