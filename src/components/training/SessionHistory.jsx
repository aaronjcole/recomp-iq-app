import { useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell } from "lucide-react";

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtDay(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.toLocaleDateString("en-US", { month: "short" })} ${monday.getDate()}–${sunday.getDate()}`;
  }
  return `${fmtDay(monday)}–${fmtDay(sunday)}`;
}

const TYPE_LABEL = {
  strength: "Strength",
  cardio: "Cardio",
  mixed: "Mixed",
  mobility: "Mobility",
  sport: "Sport"
};

export default function SessionHistory() {
  const { sessions } = useRecomp();

  const groups = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!s?.date) continue;
      const mon = mondayOf(parseDate(s.date));
      const key = mon.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { mon, items: [] });
      map.get(key).items.push(s);
    }
    return [...map.values()];
  }, [sessions]);

  const thisMon = mondayOf(new Date());
  const lastMon = addDays(thisMon, -7);
  const labelFor = (mon) => {
    if (sameDay(mon, thisMon)) return "This week";
    if (sameDay(mon, lastMon)) return "Last week";
    return fmtRange(mon);
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Session history</div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions logged yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
            {groups.map((g) => (
              <div key={g.mon.toISOString()}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-foreground">{labelFor(g.mon)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{g.items.length} {g.items.length === 1 ? "session" : "sessions"}</span>
                </div>
                <div className="space-y-0">
                  {g.items.map((s) => (
                    <div key={s.id} className="flex items-start gap-2.5 py-2 border-b border-lineSoft last:border-0">
                      <Dumbbell className="w-4 h-4 text-teal mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{s.title}</span>
                          <span className="shrink-0 rounded-full bg-panel2 text-muted-foreground px-1.5 py-0.5 text-[10px] capitalize">
                            {TYPE_LABEL[s.type] ?? s.type}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono tabular-nums">
                          {fmtDay(parseDate(s.date))}
                          {s.duration_minutes ? ` · ${s.duration_minutes}m` : ""}
                          {s.perceived_exertion ? ` · RPE ${s.perceived_exertion}` : ""}
                        </div>
                        {s.muscle_groups?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.muscle_groups.map((mg) => (
                              <span key={mg} className="rounded-full border border-line text-muted-foreground px-1.5 py-0.5 text-[10px]">
                                {mg}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}