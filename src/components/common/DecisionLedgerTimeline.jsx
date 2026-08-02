import { useRecomp } from "@/lib/RecompContext";

const FIELDS = [
  { key: "calorie_target", label: "Calories", unit: "kcal" },
  { key: "protein_target_g", label: "Protein", unit: "g" },
  { key: "fat_target_g", label: "Fat", unit: "g" },
  { key: "carb_target_g", label: "Carbs", unit: "g" },
  { key: "step_target", label: "Steps", unit: "" },
  { key: "lifting_days_target", label: "Lift days", unit: "" },
  { key: "cardio_days_target", label: "Cardio days", unit: "" }
];

function fmt(v) {
  if (v === null || v === undefined) return "—";
  return typeof v === "number" ? v.toLocaleString("en-US") : String(v);
}

function fmtDate(date) {
  const dt = new Date(date + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

function buildDeltas(entry) {
  const prev = entry.previous_targets || {};
  const next = entry.new_targets || {};
  const deltas = [];
  for (const f of FIELDS) {
    const a = prev[f.key];
    const b = next[f.key];
    if (a !== b && (a !== undefined || b !== undefined)) {
      deltas.push({ label: f.label, before: fmt(a), after: fmt(b), unit: f.unit });
    }
  }
  const focusChanged = prev.behavior_focus !== next.behavior_focus && (prev.behavior_focus !== undefined || next.behavior_focus !== undefined);
  const held = deltas.length === 0 && !focusChanged;
  return { deltas, focusChanged, focusBefore: prev.behavior_focus, focusAfter: next.behavior_focus, held, currentValue: next.calorie_target };
}

function Chip({ children, color = "var(--teal)" }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-none"
      style={{ borderColor: color, color }}
    >
      {children}
    </span>
  );
}

export default function DecisionLedgerTimeline() {
  const { decisionLedger } = useRecomp();
  const entries = [...(decisionLedger || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-5 text-sm text-muted-foreground">
        No plan changes yet — run a weekly check-in from More.
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const { deltas, focusChanged, focusBefore, focusAfter, held, currentValue } = buildDeltas(entry);
        const dotColor = held ? "var(--green)" : "var(--teal)";
        const isLast = i === entries.length - 1;
        return (
          <li key={entry.id} className="relative pl-7 pb-5 last:pb-0">
            {!isLast && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-lineSoft" />}
            <span
              className="absolute left-0 top-1 w-[11px] h-[11px] rounded-full border-2 border-bg"
              style={{ background: dotColor }}
            />
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{fmtDate(entry.date)}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {deltas.map((d) => (
                <Chip key={d.label}>
                  <span className="font-mono text-xs uppercase tracking-wider">{d.label}</span>
                  <span className="tabular-nums">{d.before} → {d.after}</span>
                  {d.unit && <span className="text-xs opacity-80">{d.unit}</span>}
                </Chip>
              ))}
              {focusChanged && (
                <Chip>
                  <span className="font-mono text-xs uppercase tracking-wider">Focus</span>
                  <span>{fmt(focusBefore)} → {fmt(focusAfter)}</span>
                </Chip>
              )}
              {held && (
                <>
                  <Chip color="var(--green)">
                    <span className="font-mono text-xs uppercase tracking-wider">Held</span>
                  </Chip>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-mono text-xs uppercase tracking-wider">Calories</span>
                    <span className="tabular-nums">{fmt(currentValue)}</span>
                    <span className="text-xs">kcal</span>
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-snug mt-1.5">{entry.reason}</p>
          </li>
        );
      })}
    </ol>
  );
}
