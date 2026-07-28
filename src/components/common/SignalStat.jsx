const STATUS_COLOR = {
  good: "var(--green)",
  watch: "var(--gold)",
  bad: "var(--red)",
  neutral: "var(--teal)"
};

export default function SignalStat({ label, value, unit, status = "neutral" }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.neutral;
  return (
    <div className="rounded-lg bg-panel border border-line px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-none tabular-nums">{value}</span>
        {unit && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}