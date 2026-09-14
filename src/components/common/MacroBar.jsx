import { cn } from "@/lib/utils";

export default function MacroBar({ label, value, target, unit = "", colorClass = "bg-teal" }) {
  const v = value ?? 0;
  const isOver = target > 0 && v > target;
  const rawPct = target > 0 ? (v / target) * 100 : 0;
  // Visual width caps at 100% so the bar never overflows, but the real
  // percentage is shown in text and aria-valuenow so "over by Xg" is clear.
  const visualPct = Math.min(100, rawPct);
  const overBy = isOver ? Math.round((v - target) * 10) / 10 : 0;
  const activeColor = isOver ? "bg-gold" : colorClass;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className={cn("font-mono tabular-nums", isOver ? "text-gold" : "text-muted-foreground")}>
          {Math.round(v)}{unit} / {target}{unit}
          {isOver && <span className="ml-1">· +{overBy}{unit}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-panel2 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", activeColor)}
          style={{ width: visualPct + "%" }}
          role="progressbar"
          aria-valuenow={Math.round(rawPct)}
          aria-valuemin={0}
          aria-valuemax={isOver ? Math.round(rawPct) : 100}
        />
      </div>
    </div>
  );
}