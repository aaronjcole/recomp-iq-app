import { useMemo, useState } from "react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Check, Pencil } from "lucide-react";
import ProgressRing from "@/components/common/ProgressRing";
import HabitEditor from "@/components/today/HabitEditor";
import { iconFor } from "@/lib/habitIcons";

function toStr(d) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isDone(habit, entry) {
  if (!entry) return false;
  if (habit.kind === "check") return !!entry.done;
  return (entry.value ?? 0) >= (habit.target_value || 1);
}

function computeStreak(entries, habit) {
  const byDate = new Map();
  for (const e of entries) byDate.set(e.date, e);
  let d = new Date();
  if (!isDone(habit, byDate.get(toStr(d)))) d = addDays(d, -1);
  let streak = 0;
  while (true) {
    const e = byDate.get(toStr(d));
    if (e && isDone(habit, e)) {
      streak++;
      d = addDays(d, -1);
    } else break;
  }
  return streak;
}

export default function HabitsCard() {
  const { habits, habitEntries, upsertHabitEntry } = useRecomp();
  const today = todayStr();
  const [editorOpen, setEditorOpen] = useState(false);

  const active = useMemo(
    () => habits.filter((h) => !h.archived).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [habits]
  );

  const entriesByHabit = useMemo(() => {
    const m = new Map();
    for (const e of habitEntries) {
      if (!m.has(e.habit_id)) m.set(e.habit_id, []);
      m.get(e.habit_id).push(e);
    }
    return m;
  }, [habitEntries]);

  const toggle = (habit) => {
    upsertHabitEntry(habit.id, today, (current) => ({ done: !current?.done }));
  };

  const step = (habit, delta) => {
    upsertHabitEntry(habit.id, today, (current) => {
      const next = Math.max(0, (current?.value ?? 0) + delta);
      return { value: next, done: next >= (habit.target_value || 1) };
    });
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Habits</div>
          <Button variant="ghost" size="icon" className="h-11 min-h-11 w-11 min-w-11 -my-2 -mr-2" onClick={() => setEditorOpen(true)} aria-label="Edit habits">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No habits yet. Tap the edit icon to add one.</p>
        ) : (
          <div className="space-y-0">
            {active.map((h) => {
              const entries = entriesByHabit.get(h.id) ?? [];
              const entry = entries.find((e) => e.date === today);
              const streak = computeStreak(entries, h);
              const Icon = iconFor(h.icon);
              const stepSize = Math.max(1, Math.round((h.target_value || 1) / 10));

              if (h.kind === "check") {
                const done = !!entry?.done;
                return (
                  <div key={h.id} className="flex items-center gap-3 py-2 border-b border-lineSoft last:border-0">
                    <Icon className="w-4 h-4 text-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{h.name}</div>
                      {streak > 0 && (
                        <div className="font-mono text-xs text-muted-foreground">{streak} day streak</div>
                      )}
                    </div>
                    <button
                      onClick={() => toggle(h)}
                      className={`h-11 min-h-11 w-11 min-w-11 rounded-full flex items-center justify-center border transition-colors ${
                        done ? "bg-teal border-teal" : "border-line"
                      }`}
                      aria-label={done ? "Mark incomplete" : "Mark complete"}
                    >
                      {done && <Check className="w-3.5 h-3.5 text-buttonText" />}
                    </button>
                  </div>
                );
              }

              const value = entry?.value ?? 0;
              const target = h.target_value || 1;
              return (
                <div key={h.id} className="flex items-center gap-3 py-2 border-b border-lineSoft last:border-0">
                  <Icon className="w-4 h-4 text-teal shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{h.name}</div>
                    <div className="font-mono text-xs text-muted-foreground tabular-nums">
                      {Math.round(value)}/{target} {h.unit || ""}
                      {streak > 0 ? ` · ${streak}d streak` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 min-h-11 w-11 min-w-11 rounded-full border-line"
                      onClick={() => step(h, -stepSize)}
                      aria-label="Decrease"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <ProgressRing size={36} stroke={4} value={value} max={target} />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 min-h-11 w-11 min-w-11 rounded-full border-line"
                      onClick={() => step(h, stepSize)}
                      aria-label="Increase"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <HabitEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </Card>
  );
}
