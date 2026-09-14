import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Flame, Snowflake, Trophy, TrendingUp } from "lucide-react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { calculateStreakStats, hitTargets } from "@/lib/fitness/gamification";

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function StreakDetailSheet({ open, onOpenChange }) {
  const { logs, strategy } = useRecomp();

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
  const isPersonalBest = streak > 0 && streak >= stats.longest;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Streak details</SheetTitle>
          <SheetDescription>
            Hit your nutrition and step targets to keep the streak alive.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 pt-2">
          {/* Current streak */}
          <div
            className={`flex items-center gap-4 rounded-2xl border p-4 ${
              recovery
                ? "border-gold/30 bg-gradient-to-br from-gold/10 to-panel"
                : "border-teal/30 bg-gradient-to-br from-teal/10 to-panel"
            }`}
          >
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${
                recovery ? "bg-gold/15 text-gold" : "bg-teal/15 text-teal"
              }`}
            >
              <Flame className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              {recovery ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
                      {stats.lastBroken}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">day streak ended</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Log today to start a new streak.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold tabular-nums text-foreground">{streak}</span>
                    <span className="text-sm font-medium text-muted-foreground">day streak</span>
                    {isPersonalBest && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[0.625rem] font-mono uppercase tracking-wide text-gold">
                        <Trophy className="h-3 w-3" aria-hidden="true" /> Best
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {streak === 0 ? "Log nutrition + steps to start a streak." : "Nutrition + steps targets hit."}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-mono uppercase tracking-wide">Longest</span>
              </div>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{stats.longest}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Snowflake className="h-4 w-4 text-blue" aria-hidden="true" />
                <span className="text-xs font-mono uppercase tracking-wide">Freeze</span>
              </div>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                {stats.freezeUsed ? "Used" : stats.freezeArmed ? "Ready" : "—"}
              </p>
            </div>
          </div>

          {/* Recovery nudge */}
          {recovery && (
            <p className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold">
              Your last streak was {stats.lastBroken} days. Log today to beat it.
            </p>
          )}

          {/* 7-day trail */}
          <div>
            <p className="mb-2 text-xs font-mono uppercase tracking-wide text-muted-foreground">Last 7 days</p>
            <div className="flex justify-between gap-1.5">
              {trail.map((d) => (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-[0.625rem] text-muted-foreground">{d.label}</span>
                  {d.state === "frozen" ? (
                    <Snowflake className="h-4 w-4 text-blue" aria-hidden="true" />
                  ) : (
                    <span
                      className={`h-4 w-4 rounded-full ${
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
        </div>
      </SheetContent>
    </Sheet>
  );
}