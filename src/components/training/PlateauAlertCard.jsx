import { useMemo, useState } from "react";
import { useRecompRef } from "@/lib/RecompContext";
import { detectPlateaus } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronUp, ChevronDown, BellOff } from "lucide-react";

const MUTE_STORAGE_KEY = "recomp-muted-plateaus";

function loadMuted() {
  try {
    return JSON.parse(localStorage.getItem(MUTE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMuted(obj) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

function formatDate(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function PlateauAlert({ plateau, onMute }) {
  const [expanded, setExpanded] = useState(true);
  const most_recent = plateau.recent_sessions[plateau.recent_sessions.length - 1];

  return (
    <div className="rounded-xl border border-gold/40 bg-questComplete overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold uppercase tracking-wide">
              Plateaued
            </span>
            <span className="font-medium text-sm truncate">{plateau.lift_name}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">
            recent best @ {most_recent.effort_pct}% · {most_recent.weight} lbs × {most_recent.reps}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-line text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Effort</th>
                  <th className="px-3 py-2 text-left font-medium">Weight × Reps</th>
                  <th className="px-3 py-2 text-right font-medium">Est. 1RM</th>
                </tr>
              </thead>
              <tbody>
                {[...plateau.recent_sessions].reverse().map((s, i) => (
                  <tr key={i} className="border-b border-lineSoft last:border-0">
                    <td className="px-3 py-2">{formatDate(s.date)}</td>
                    <td className="px-3 py-2 font-semibold text-gold">{s.effort_pct}%</td>
                    <td className="px-3 py-2">{s.weight} lbs × {s.reps}</td>
                    <td className="px-3 py-2 text-right">→ {Math.round(s.estimated_1rm)} lbs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-foreground">
                Est. 1 Rep Max has not increased in {plateau.recent_sessions.length} workouts.
              </p>
              <p className="text-xs text-muted-foreground">
                Try +1 rep or next weight up if your form is solid.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onMute(plateau.lift_name, plateau.best_ever_1rm)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground min-h-[36px]"
            >
              <BellOff className="w-3.5 h-3.5" />
              Mute
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlateauAlertCard() {
  const { strengthLogs } = useRecompRef();
  const [mutedSnapshot, setMutedSnapshot] = useState(loadMuted);

  const plateaus = useMemo(() => {
    const all = detectPlateaus(strengthLogs || []);
    return all.filter((p) => {
      const mutedAt = mutedSnapshot[p.lift_name];
      return mutedAt == null || p.best_ever_1rm > mutedAt;
    });
  }, [strengthLogs, mutedSnapshot]);

  const handleMute = (liftName, best1rm) => {
    const updated = { ...mutedSnapshot, [liftName]: best1rm };
    saveMuted(updated);
    setMutedSnapshot(updated);
  };

  if (plateaus.length === 0) return null;

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Plateau alerts
        </h2>
        {plateaus.map((p) => (
          <PlateauAlert key={p.lift_name} plateau={p} onMute={handleMute} />
        ))}
      </CardContent>
    </Card>
  );
}
