import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarRange, ChevronDown, Dumbbell, PlayCircle, RefreshCw, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChildTopBar from "@/components/ChildTopBar";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { useRecompActions, useRecompRef } from "@/lib/RecompContext";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";

const EQUIPMENT_OPTIONS = [
  { value: "bodyweight_home", label: "Bodyweight / home" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "full_gym", label: "Full gym" }
];

const LENGTH_OPTIONS = [
  { value: "4", label: "4 weeks" },
  { value: "5", label: "5 weeks" },
  { value: "6", label: "6 weeks" }
];

function currentWeekStart() {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function errorMessage(error) {
  return error?.response?.data?.error
    ?? error?.data?.error
    ?? error?.message
    ?? "The training block could not be created right now.";
}

function readable(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function repsLowerBound(repsStr) {
  const str = String(repsStr ?? "");
  const match = str.match(/^(\d+)/);
  return match ? Number(match[1]) : 8;
}

export default function AdaptiveTrainingBlock() {
  const { canAccess, isLoading: accessLoading } = usePremiumAccess();
  const allowed = canAccess(PREMIUM_FEATURES.TRAINING_PLANNING);
  const weekStart = useMemo(currentWeekStart, []);
  const navigate = useNavigate();

  const { activeBlock } = useRecompRef();
  const { saveTrainingBlock } = useRecompActions();

  // Derive existing plan from the active block if present
  const existingPlan = useMemo(() => {
    if (!activeBlock?.plan_json) return null;
    try { return JSON.parse(activeBlock.plan_json); } catch { return null; }
  }, [activeBlock]);

  const [equipment, setEquipment] = useState(activeBlock?.equipment ?? "full_gym");
  const [blockLength, setBlockLength] = useState(String(activeBlock?.block_length_weeks ?? "5"));
  const [plan, setPlan] = useState(existingPlan);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // If a block loads after initial render (async context), populate the UI
  useEffect(() => {
    if (activeBlock && !plan) {
      const loaded = existingPlan;
      if (loaded) {
        setPlan(loaded);
        setEquipment(activeBlock.equipment ?? "full_gym");
        setBlockLength(String(activeBlock.block_length_weeks ?? "5"));
      }
    }
  }, [activeBlock, existingPlan, plan]);

  const generate = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const result = await base44.functions.invoke("generateAdaptiveTrainingBlock", {
        weekStart,
        equipment,
        blockLengthWeeks: Number(blockLength)
      });
      const nextPlan = result?.data ?? result;
      if (!nextPlan || !Array.isArray(nextPlan.schedule) || !Array.isArray(nextPlan.weeks)) {
        throw new Error("The training planner returned an incomplete block.");
      }
      setPlan(nextPlan);
      // Persist automatically
      setIsSaving(true);
      await saveTrainingBlock(nextPlan, equipment, Number(blockLength), weekStart);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsGenerating(false);
      setIsSaving(false);
    }
  };

  const handleStartSession = (dayIndex, session) => {
    if (!activeBlock) return;
    const prefill = {
      blockId: activeBlock.id,
      dayIndex,
      sessionId: session.id ?? `day-${dayIndex}`,
      prefill: {
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
      }
    };
    navigate("/training", { state: { planSession: prefill } });
  };

  return (
    <div className="space-y-5">
      <ChildTopBar title="Adaptive training block" fallbackTo="/training" />

      <Card className="border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <PremiumBadge />
          </div>
          <div>
            <h2 className="font-semibold">A block that learns from your log</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a progressive 4–6 week schedule from your training frequency, recent exertion, tracked lifts, and recovery signals.
            </p>
          </div>

          {!accessLoading && !allowed && (
            <div className="space-y-3 rounded-lg border border-lineSoft bg-panel2 p-4">
              <p className="text-sm text-muted-foreground">
                This feature is visible during testing and requires verified Premium access.
              </p>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/more/premium">Review Premium access</Link>
              </Button>
            </div>
          )}

          {allowed && (
            <>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="training-equipment">Equipment</Label>
                  <AdaptiveSelect
                    id="training-equipment"
                    value={equipment}
                    onValueChange={setEquipment}
                    options={EQUIPMENT_OPTIONS}
                    drawerTitle="Choose equipment"
                    drawerDescription="Your plan will only prescribe exercises supported by this setup."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="training-length">Block length</Label>
                  <AdaptiveSelect
                    id="training-length"
                    value={blockLength}
                    onValueChange={setBlockLength}
                    options={LENGTH_OPTIONS}
                    drawerTitle="Choose block length"
                    drawerDescription="Every block ends with a lower-fatigue deload week."
                  />
                </div>
              </div>
              <Button
                className="w-full bg-teal text-buttonText hover:opacity-90"
                onClick={generate}
                disabled={isGenerating || isSaving}
              >
                {isGenerating ? (
                  <><RefreshCw className="animate-spin" aria-hidden="true" /> Building your block…</>
                ) : isSaving ? (
                  <><RefreshCw className="animate-spin" aria-hidden="true" /> Saving…</>
                ) : plan ? (
                  <><RefreshCw aria-hidden="true" /> Rebuild training block</>
                ) : (
                  <><CalendarRange aria-hidden="true" /> Build training block</>
                )}
              </Button>
            </>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <>
          <Card className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{plan.blockLengthWeeks} weeks</Badge>
                <Badge variant="outline">{plan.schedule.length} days / week</Badge>
                <Badge variant="outline" className="capitalize">{readable(plan.split)}</Badge>
                <Badge variant="outline" className="capitalize">{readable(plan.equipment)}</Badge>
              </div>
              <h2 className="font-semibold">Why this block starts here</h2>
              <p className="text-sm text-muted-foreground">{plan.adaptation.summary}</p>
              {plan.trackedLifts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Carried forward from your log: {plan.trackedLifts.join(", ")}.
                </p>
              )}
            </CardContent>
          </Card>

          <section className="space-y-3" aria-labelledby="training-schedule">
            <h2 id="training-schedule" className="font-semibold">Weekly schedule</h2>
            {plan.schedule.map((session, index) => (
              <Card key={`${session.day}-${session.title}`} className="border-line bg-panel">
                <details open={index === 0} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block font-medium">Day {session.day} · {session.title}</span>
                      <span className="block text-xs text-muted-foreground">{session.focus} · about {session.estimatedMinutes} min</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <CardContent className="space-y-3 px-5 pb-5 pt-0">
                    {session.exercises.map((exercise) => (
                      <div key={`${exercise.movement}-${exercise.name}`} className="rounded-lg bg-panel2 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-medium">{exercise.name}</h3>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {exercise.sets} × {exercise.reps}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Target RPE {exercise.targetRpe}</p>
                        {exercise.alternatives.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Swap: {exercise.alternatives.join(" or ")}
                          </p>
                        )}
                      </div>
                    ))}
                    {activeBlock && (
                      <Button
                        variant="outline"
                        className="w-full border-teal/30 text-teal hover:bg-teal/10"
                        onClick={() => handleStartSession(index, session)}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                        Start this session
                      </Button>
                    )}
                  </CardContent>
                </details>
              </Card>
            ))}
          </section>

          <Card className="border-line bg-panel">
            <CardContent className="space-y-4 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-teal" aria-hidden="true" /> Week-by-week progression
              </h2>
              {plan.weeks.map((week) => (
                <div key={week.week} className="border-b border-lineSoft pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">Week {week.week} · <span className="capitalize">{readable(week.phase)}</span></h3>
                    <Badge variant="outline">RPE {week.targetRpe}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{week.instruction}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-line bg-panel2">
            <CardContent className="space-y-3 p-4 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Progression:</strong> {plan.progressionRule}</p>
              <p>{plan.safetyNotice}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
