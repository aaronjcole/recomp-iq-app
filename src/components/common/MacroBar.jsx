import { cn } from "@/lib/utils";

export default function MacroBar({ label, value, target, unit = "", colorClass = "bg-teal" }) {
  const pct = target > 0 ? Math.min(100, ((value ?? 0) / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(value ?? 0)}
          {unit} / {target}
          {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-panel2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", colorClass)} style={{ width: pct + "%" }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} />
      </div>
    </div>
  );
}