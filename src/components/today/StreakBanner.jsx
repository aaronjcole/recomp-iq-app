import { useMemo } from "react";
import { Flame, Snowflake } from "lucide-react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { calculateStreakStats, hitTargets } from "@/lib/fitness/gamification";

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function StreakBanner({ compact = false }) {
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

  if (compact) {
    return (
      <div
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 text-teal"
        role="status"
        aria-live="polite"
        aria-label={`${streak} day target streak. Nutrition and steps targets hit.`}
      >
        <Flame className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono text-sm font-bold tabular-nums">{streak}</span>
        <span className="text-xs font-medium text-muted-foreground">day streak</span>
        {stats.freezeArmed && <Snowflake className="h-3.5 w-3.5 text-blue" aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border p-4 ${
        recovery
          ? "border-gold/30 bg-gradient-to-br from-gold/10 to-panel"
          : "border-teal/30 bg-gradient-to-br from-teal/10 to-panel"
      }`}
      role="status"
      aria-live="polite"
      aria-label={
        recovery
          ? `Streak ended at ${stats.lastBroken} days. Log today to start a new streak.`
          : `${streak} day target streak`
      }
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
              Log today to start a new streak{stats.longest > 0 ? ` · Best ${stats.longest}` : ""}.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tabular-nums text-foreground">{streak}</span>
              <span className="text-sm font-medium text-muted-foreground">day streak</span>
              {stats.freezeArmed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue/10 px-2 py-0.5 text-[0.625rem] font-mono uppercase tracking-wide text-blue">
                  <Snowflake className="h-3 w-3" aria-hidden="true" /> Freeze ready
                </span>
              )}
              {stats.freezeUsed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue/10 px-2 py-0.5 text-[0.625rem] font-mono uppercase tracking-wide text-blue">
                  <Snowflake className="h-3 w-3" aria-hidden="true" /> Freeze used
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {streak === 0 ? "Log nutrition + steps to start a streak." : "Nutrition + steps targets hit"}
              {stats.longest > 0 ? ` · Best ${stats.longest}` : ""}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
        {trail.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span className="font-mono text-[0.625rem] text-muted-foreground">{d.label}</span>
            {d.state === "frozen" ? (
              <Snowflake className="h-2.5 w-2.5 text-blue" aria-hidden="true" />
            ) : (
              <span
                className={`h-2.5 w-2.5 rounded-full ${
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
  );
}