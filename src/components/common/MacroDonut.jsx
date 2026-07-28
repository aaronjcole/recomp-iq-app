const KCAL = { protein: 4, carbs: 4, fat: 9 };

export default function MacroDonut({ protein = 0, carbs = 0, fat = 0 }) {
  const segs = [
    { label: "Protein", grams: protein, cals: protein * KCAL.protein, color: "var(--teal)" },
    { label: "Carbs", grams: carbs, cals: carbs * KCAL.carbs, color: "var(--blue)" },
    { label: "Fat", grams: fat, cals: fat * KCAL.fat, color: "var(--gold)" }
  ];
  const total = segs.reduce((s, m) => s + m.cals, 0);

  const size = 128;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const C = 2 * Math.PI * r;

  let cum = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--lineSoft)" strokeWidth={stroke} />
          {total > 0 &&
            segs.map((m, i) => {
              const len = (m.cals / total) * C;
              const offset = -cum;
              cum += len;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cx}
                  r={r}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-lg font-bold tabular-nums leading-none">{total > 0 ? Math.round(total) : "—"}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">kcal</div>
        </div>
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        {segs.map((m) => (
          <div key={m.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: m.color }} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex-1">{m.label}</span>
            <span className="font-mono text-xs tabular-nums">{Math.round(m.grams)}g</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-9 text-right">
              {total > 0 ? Math.round((m.cals / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}