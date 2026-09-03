import { useMemo } from "react";
import { Flame } from "lucide-react";
import { useRecomp } from "@/lib/RecompContext";
import { todayStr } from "@/lib/RecompContext";

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// A day counts when calories are within ±15% of target, protein is at least
// 90% of target, and steps meet the step target (when one is set).
function hitTargets(log, strategy) {
  if (!log || !strategy) return false;
  const cal = log.calories;
  const protein = log.protein_g;
  const steps = log.steps;
  if (cal == null || protein == null) return false;

  const calTarget = strategy.calorie_target;
  const proteinTarget = strategy.protein_target_g;
  const stepTarget = strategy.step_target;

  const calOk = calTarget > 0 && cal >= calTarget * 0.85 && cal <= calTarget * 1.15;
  const proteinOk = proteinTarget > 0 && protein >= proteinTarget * 0.9;
  const stepsOk = stepTarget > 0 ? steps != null && steps >= stepTarget : true;

  return calOk && proteinOk && stepsOk;
}

// Consecutive target-hitting days ending today (or yesterday if today is not
// logged yet). A logged-but-missed today resets the streak to zero.
function calculateStreak(logs, strategy) {
  if (!strategy) return 0;
  const byDate = new Map();
  for (const l of logs) byDate.set(l.date, l);

  const today = todayStr();
  const todayLog = byDate.get(today);

  if (todayLog && hitTargets(todayLog, strategy)) {
    let streak = 1;
    for (let i = 1; i < 400; i++) {
      const log = byDate.get(daysAgoStr(i));
      if (log && hitTargets(log, strategy)) streak++;
      else break;
    }
    return streak;
  }
  if (todayLog && !hitTargets(todayLog, strategy)) return 0;

  let streak = 0;
  for (let i = 1; i < 400; i++) {
    const log = byDate.get(daysAgoStr(i));
    if (log && hitTargets(log, strategy)) streak++;
    else break;
  }
  return streak;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function StreakBanner({ compact = false }) {
  const { logs, strategy } = useRecomp();

  const { streak, trail } = useMemo(() => {
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
      const dow = new Date(date + "T00:00:00").getDay();
      days.push({ date, state, label: DAY_LABELS[dow], isToday });
    }
    return { streak: calculateStreak(logs, strategy), trail: days };
  }, [logs, strategy]);

  if (!strategy) return null;

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
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-4 rounded-2xl border border-teal/30 bg-gradient-to-br from-teal/10 to-panel p-4"
      role="status"
      aria-live="polite"
      aria-label={`${streak} day target streak`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
        <Flame className="h-7 w-7" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tabular-nums text-foreground">{streak}</span>
          <span className="text-sm font-medium text-muted-foreground">day streak</span>
        </div>
        <p className="text-xs text-muted-foreground">Nutrition + steps targets hit</p>
      </div>

      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
        {trail.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1">
            <span className="font-mono text-[0.625rem] text-muted-foreground">{d.label}</span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                d.state === "hit"
                  ? "bg-teal"
                  : d.state === "missed"
                    ? "bg-red/40"
                    : "bg-panel2 ring-1 ring-line"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
