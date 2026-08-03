import { useMemo, useState } from "react";
import { useRecompRef, useRecompActions } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, Trash2 } from "lucide-react";

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

const TYPE_LABEL = {
  strength: "Strength",
  cardio: "Cardio",
  mixed: "Mixed",
  mobility: "Mobility",
  sport: "Sport"
};

function summarizeSets(sets) {
  const map = new Map();
  for (const s of sets || []) {
    if (!s?.exercise_name) continue;
    const e = map.get(s.exercise_name) || { name: s.exercise_name, weight: s.weight_lbs, reps: s.reps, sets: 0 };
    e.sets += 1;
    map.set(s.exercise_name, e);
  }
  return [...map.values()];
}

export default function SessionHistory() {
  const { sessions } = useRecompRef();
  const { deleteSession } = useRecompActions();
  const [confirmId, setConfirmId] = useState(null);

  const days = useMemo(() => {
    const map = new Map();
    for (const s of sessions) {
      if (!s?.date) continue;
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date).push(s);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sessions]);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Training history</div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions logged yet.</p>
        ) : (
          <div className="space-y-5">
            {days.map(([dateStr, items]) => (
              <div key={dateStr}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-foreground">{dayLabel(parseDate(dateStr))}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{items.length} {items.length === 1 ? "session" : "sessions"}</span>
                </div>
                <div className="space-y-2">
                  {items.map((s) => {
                    const lifts = summarizeSets(s.sets);
                    const meta = [
                      s.duration_minutes ? `${s.duration_minutes}m` : null,
                      s.perceived_exertion ? `RPE ${s.perceived_exertion}` : null,
                      s.cardio_distance_miles || s.cardio_avg_heart_rate
                        ? [s.cardio_distance_miles ? `${s.cardio_distance_miles}mi` : null, s.cardio_avg_heart_rate ? `${s.cardio_avg_heart_rate}bpm` : null].filter(Boolean).join(" · ")
                        : null
                    ].filter(Boolean).join(" · ");
                    return (
                      <div key={s.id} className="rounded-lg border border-lineSoft p-3">
                        <div className="flex items-start gap-2.5">
                          <Dumbbell className="w-4 h-4 text-teal mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{s.title}</span>
                              <span className="shrink-0 rounded-full bg-panel2 text-muted-foreground px-1.5 py-0.5 text-[10px]">{TYPE_LABEL[s.type] ?? s.type}</span>
                            </div>
                            {meta && <div className="text-xs text-muted-foreground font-mono tabular-nums">{meta}</div>}
                            {s.muscle_groups?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {s.muscle_groups.map((mg) => (
                                  <span key={mg} className="rounded-full border border-line text-muted-foreground px-1.5 py-0.5 text-[10px]">{mg}</span>
                                ))}
                              </div>
                            )}
                            {lifts.length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {lifts.map((l) => (
                                  <div key={l.name} className="text-xs font-mono tabular-nums text-foreground">
                                    {l.name} — {l.weight} lb × {l.reps}{l.sets > 1 ? ` (${l.sets} sets)` : ""}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {confirmId === s.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => deleteSession(s.id)} className="text-xs text-red font-medium px-2 py-1 min-h-[36px]">Delete</button>
                              <button onClick={() => setConfirmId(null)} className="text-xs text-muted-foreground px-1 py-1 min-h-[36px]">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmId(s.id)} className="text-muted-foreground hover:text-red shrink-0 p-1 min-w-[36px] min-h-[36px] flex items-center justify-center">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
