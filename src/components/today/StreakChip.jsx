import { useMemo, useState } from "react";
import { Flame, Snowflake } from "lucide-react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { calculateStreakStats, hitTargets } from "@/lib/fitness/gamification";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Compact, tappable streak chip for the Today top bar. Tapping opens a bottom
 * sheet with the full streak detail — freeze count, longest streak, recovery
 * nudge, and the 7-day trail. Replaces the duplicated full + compact banners
 * that used to both render on Today.
 */
export default function StreakChip() {
  const { logs, strategy } = useRecomp();
  const [open, setOpen] = useState(false);

  const { stats, trail } = useMemo(() => {
    const s = calculateStreakStats(logs, strategy);
    const byDate = new Map();
    for (const l of logs) byDate.set(l.date, l);
    const today = todayStr();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = daysAgoStr(i);
      const log = byDate.get(date);
      const isToday = date === today;
      let state = "empty";
      if (log && hitTargets(log, strategy)) state = "hit";
      else if (log && !hitTargets(log, strategy)) state = isToday ? "pending" : "missed";
      else if (isToday) state = "pending";
      if (state === "missed" && date === s.frozenDate) state = "frozen";
      const dow = new Date(date + "T00:00:00").getDay();
      days.push({ date, state, label: DAY_LABELS[dow], isToday });
    }
    return { stats: s, trail: days };
  }, [logs, strategy]);

  if (!strategy) return null;

  const streak = stats.current;
  const recovery = streak === 0 && stats.lastBroken > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-3 text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${streak} day target streak. Tap for streak details.`}
      >
        <Flame className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono text-sm font-bold tabular-nums">{streak}</span>
        {stats.longest > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wide text-gold">
            Best {stats.longest}
          </span>
        )}
        {stats.freezeArmed && <Snowflake className="h-3.5 w-3.5 text-blue" aria-hidden="true" />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Streak</SheetTitle>
            <SheetDescription>Nutrition + steps targets hit each day.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-8 pt-2">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${
                  recovery ? "bg-gold/15 text-gold" : "bg-teal/15 text-teal"
                }`}
              >
                <Flame className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                {recovery ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-bold tabular-nums">{stats.lastBroken}</span>
                      <span className="text-sm text-muted-foreground">day streak ended</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Log today to start a new streak{stats.longest > 0 ? ` · Best ${stats.longest}` : ""}.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-bold tabular-nums">{streak}</span>
                      <span className="text-sm text-muted-foreground">day streak</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {streak === 0 ? "Log nutrition + steps to start a streak." : "Targets hit"}
                      {stats.longest > 0 ? ` · Best ${stats.longest}` : ""}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {stats.freezeArmed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue/15 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-wide text-blue">
                  <Snowflake className="h-3 w-3" aria-hidden="true" /> Freeze ready
                </span>
              )}
              {stats.freezeUsed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue/15 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-wide text-blue">
                  <Snowflake className="h-3 w-3" aria-hidden="true" /> Freeze used
                </span>
              )}
            </div>

            <div className="flex justify-between gap-1.5">
              {trail.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1">
                  <span className="font-mono text-[0.625rem] text-muted-foreground">{d.label}</span>
                  {d.state === "frozen" ? (
                    <Snowflake className="h-3 w-3 text-blue" aria-hidden="true" />
                  ) : (
                    <span
                      className={`h-3 w-3 rounded-full ${
                        d.state === "hit"
                          ? "bg-teal"
                          : d.state === "missed"
                            ? "bg-red/40"
                            : "bg-panel2 ring-1 ring-line"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}