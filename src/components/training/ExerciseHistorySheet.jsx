import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { liftSessions, nextSessionSuggestion, weeklyVolume } from "@/lib/fitness";
import { todayStr } from "@/lib/loggingDateUtils";

const NUMBER = new Intl.NumberFormat("en-US");

function fmtDate(key) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function load(weight, reps) {
  return weight > 0 ? `${weight} lb × ${reps}` : `${reps} reps`;
}

/**
 * Every session of one exercise with personal records marked, weekly volume,
 * and the next-session suggestion the live workout shows.
 */
export default function ExerciseHistorySheet({ lift, strengthLogs, sessions, recovery, onOpenChange }) {
  const history = useMemo(() => (lift ? liftSessions(strengthLogs, lift.key) : []), [lift, strengthLogs]);
  const volume = useMemo(() => (lift ? weeklyVolume(sessions, lift.key) : []), [lift, sessions]);
  const suggestion = useMemo(
    () => (lift ? nextSessionSuggestion(strengthLogs, lift.key, { recovery, today: todayStr() }) : null),
    [lift, strengthLogs, recovery]
  );
  const best = history.length ? Math.max(...history.map((row) => row.estimated_1rm)) : null;
  const maxVolume = volume.length ? Math.max(...volume.map((week) => week.volume)) : 0;

  return (
    <Sheet open={Boolean(lift)} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[90svh] max-w-md space-y-4 overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>{lift?.name}</SheetTitle>
          <SheetDescription>
            {history.length} {history.length === 1 ? "session" : "sessions"}
            {best !== null ? ` · best e1RM ${NUMBER.format(Math.round(best))} lb` : ""}
          </SheetDescription>
        </SheetHeader>

        {suggestion && (
          <section aria-labelledby="exercise-next" className="rounded-lg bg-panel2 p-3 text-sm">
            <h3 id="exercise-next" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next session</h3>
            <p className="mt-1 font-medium">{load(suggestion.weight, suggestion.reps)}</p>
            <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
          </section>
        )}

        {volume.length > 0 && (
          <section aria-labelledby="exercise-volume" className="space-y-1.5">
            <h3 id="exercise-volume" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Weekly volume (weight × reps)</h3>
            <ul className="space-y-1">
              {volume.map((week) => (
                <li key={week.week} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Week of {fmtDate(week.week).replace(/, \d{4}$/, "")}</span>
                  <span className="h-2 rounded-full bg-teal/70" style={{ width: `${Math.max(4, (week.volume / maxVolume) * 100)}%` }} aria-hidden="true" />
                  <span className="font-mono tabular-nums">{NUMBER.format(week.volume)} lb</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="exercise-sessions" className="space-y-1">
          <h3 id="exercise-sessions" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessions</h3>
          <ol className="divide-y divide-lineSoft">
            {[...history].reverse().map((row) => (
              <li key={row.id ?? `${row.date}-${row.estimated_1rm}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{fmtDate(row.date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {load(Number(row.weight) || 0, row.reps)} · {row.sets} {row.sets === 1 ? "set" : "sets"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.is_pr && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold">
                      <Trophy className="h-3 w-3" aria-hidden="true" /> PR
                    </span>
                  )}
                  <span className="font-mono text-xs tabular-nums">e1RM {NUMBER.format(Math.round(row.estimated_1rm))}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </SheetContent>
    </Sheet>
  );
}
