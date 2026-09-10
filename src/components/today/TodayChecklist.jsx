import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Dumbbell, Moon, Repeat2 } from "lucide-react";
import { useRecompHabits } from "@/lib/RecompContext";
import { todayStr } from "@/lib/loggingDateUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SleepCard from "@/components/today/SleepCard";
import HabitsCard from "@/components/today/HabitsCard";

function habitComplete(habit, entry) {
  if (!entry) return false;
  if (habit.kind === "check") return Boolean(entry.done);
  return (entry.value ?? 0) >= (habit.target_value || 1);
}

function StatusItem({ icon: Icon, label, value, complete }) {
  return (
    <span className="min-w-0 rounded-lg bg-panel2/60 px-2.5 py-2 text-left">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${complete ? "text-teal" : "text-muted-foreground"}`} aria-hidden="true" />
        {label}
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{value}</span>
    </span>
  );
}

export default function TodayChecklist({ todayLog, date = todayStr(), sleepSummary, onLog, expand = false }) {
  const { habits, habitEntries } = useRecompHabits();
  const [open, setOpen] = useState(Boolean(expand));
  const today = date;

  useEffect(() => {
    if (!expand) return;
    setOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("habits-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [expand]);

  const habitStatus = useMemo(() => {
    const active = habits.filter((habit) => !habit.archived);
    const byHabit = new Map(
      habitEntries
        .filter((entry) => entry.date === today)
        .map((entry) => [entry.habit_id, entry])
    );
    const complete = active.filter((habit) => habitComplete(habit, byHabit.get(habit.id))).length;
    return { active: active.length, complete };
  }, [habitEntries, habits, today]);

  const sleepLogged = Number.isFinite(todayLog?.sleep_hours);
  const workoutLogged = Boolean(todayLog?.workout_completed);
  const habitsComplete = habitStatus.active > 0 && habitStatus.complete === habitStatus.active;

  return (
    <section id="habits-section" aria-labelledby="today-checklist-heading" className="scroll-mt-24">
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="overflow-hidden border-line bg-panel">
          <CardContent className="p-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`${open ? "Hide" : "Show"} today's checklist`}
              >
                <span className="flex min-h-11 items-center justify-between gap-3">
                  <span>
                    <span id="today-checklist-heading" className="block font-medium">Today&apos;s checklist</span>
                    <span className="block text-xs text-muted-foreground">Daily details when you need them</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                </span>
                <span className="mt-2 grid grid-cols-3 gap-2">
                  <StatusItem icon={Moon} label="Sleep" value={sleepLogged ? `${todayLog.sleep_hours}h logged` : "Not logged"} complete={sleepLogged} />
                  <StatusItem icon={Check} label="Habits" value={habitStatus.active ? `${habitStatus.complete}/${habitStatus.active} done` : "None set"} complete={habitsComplete} />
                  <StatusItem icon={Dumbbell} label="Workout" value={workoutLogged ? "Complete" : "Not logged"} complete={workoutLogged} />
                </span>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-3 border-t border-lineSoft bg-panel2/20 p-3">
                <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-panel p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
                    <Repeat2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Training</div>
                    <div className="text-xs text-muted-foreground">{workoutLogged ? "Workout logged for today" : "Start or repeat a session"}</div>
                  </div>
                  <Link to="/training" className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-teal">
                    {workoutLogged ? "View" : "Train"}
                  </Link>
                </div>
                <SleepCard todayLog={todayLog} summary={sleepSummary} onLog={onLog} />
                <HabitsCard date={date} />
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </section>
  );
}