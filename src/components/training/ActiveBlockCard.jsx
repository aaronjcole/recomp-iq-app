import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function parseCompleted(json) {
  try { return JSON.parse(json ?? "[]"); } catch { return []; }
}

function repsLowerBound(repsStr) {
  const str = String(repsStr ?? "");
  const match = str.match(/^(\d+)/);
  return match ? Number(match[1]) : 8;
}

function parsePlan(json) {
  try { return JSON.parse(json ?? "null"); } catch { return null; }
}

export default function ActiveBlockCard({ block }) {
  const navigate = useNavigate();

  const plan = useMemo(() => parsePlan(block.plan_json), [block.plan_json]);
  const completed = useMemo(() => parseCompleted(block.completed_sessions), [block.completed_sessions]);

  if (!plan) return null;

  const schedule = plan.schedule ?? [];
  const blockWeeks = block.block_length_weeks ?? plan.blockLengthWeeks ?? 4;

  const totalSessions = schedule.length * blockWeeks;
  const completedCount = completed.length;
  const progressPct = totalSessions > 0 ? Math.min(100, Math.round((completedCount / totalSessions) * 100)) : 0;

  // Find the next session to do: first schedule slot not yet completed today's week
  const nextDayIndex = (() => {
    const completedDays = new Set(completed.map((s) => s.day_index));
    for (let i = 0; i < schedule.length; i++) {
      if (!completedDays.has(i)) return i;
    }
    return null;
  })();

  const handleStartSession = (dayIndex, session) => {
    const prefill = {
      title: session.title,
      muscleGroups: [session.focus],
      lifts: session.exercises
        .filter((ex) => ex.movement !== "mobility" && ex.movement !== "cardio")
        .map((ex) => ({
          name: ex.name,
          sets: String(ex.sets),
          reps: String(repsLowerBound(ex.reps)),
          weight: ""
        }))
    };
    navigate("/training", { state: { planSession: { blockId: block.id, dayIndex, sessionId: session.id ?? `day-${dayIndex}`, prefill } } });
  };

  return (
    <Card className="border-line bg-panel">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
            <CalendarRange className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">Active training block</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {blockWeeks}-week block · {plan.schedule?.length ?? 0} days/week · <span className="capitalize">{String(block.equipment ?? "").replaceAll("_", " ")}</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{completedCount} of {totalSessions} sessions done</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full rounded-full bg-teal transition-all"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Session slots for this week */}
        <div className="space-y-2">
          {schedule.map((session, i) => {
            const isDone = completed.some((s) => s.day_index === i);
            const isNext = i === nextDayIndex;
            return (
              <div
                key={`${session.day}-${session.title}`}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  isDone
                    ? "border-teal/20 bg-teal/5"
                    : isNext
                    ? "border-teal/40 bg-panel2"
                    : "border-lineSoft bg-panel2"
                }`}
              >
                <span className="shrink-0 text-teal">
                  {isDone
                    ? <CheckCircle2 className="h-4 w-4" aria-label="Completed" />
                    : <Circle className="h-4 w-4 text-muted-foreground" aria-label="Upcoming" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    Day {session.day} · {session.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{session.focus} · ~{session.estimatedMinutes} min</p>
                </div>
                {!isDone && (
                  <button
                    type="button"
                    onClick={() => handleStartSession(i, session)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-teal/10 px-3 py-2 text-xs font-medium text-teal hover:bg-teal/20"
                    aria-label={`Start ${session.title}`}
                  >
                    <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {isNext ? "Start" : "Log"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <Button asChild variant="outline" className="w-full border-line text-sm">
          <a href="/training/plan">View full block</a>
        </Button>
      </CardContent>
    </Card>
  );
}
