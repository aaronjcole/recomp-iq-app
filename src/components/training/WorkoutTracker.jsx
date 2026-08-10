import { useCallback, useEffect, useRef, useState } from "react";
import { useRecompActions, todayStr } from "@/lib/RecompContext";
import { estimateOneRepMax } from "@/lib/fitness";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Plus,
  Timer,
  Trash2,
  X
} from "lucide-react";

const STORAGE_KEY = "recomp_active_workout";
const uid = () => Math.random().toString(36).slice(2, 9);

const TYPE_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "mixed", label: "Mixed" },
  { value: "mobility", label: "Mobility" },
  { value: "sport", label: "Sport" }
];

const MUSCLE_SUGGESTIONS = [
  "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Glutes", "Hamstrings", "Quads", "Calves"
];

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.startTime || !Array.isArray(parsed.exercises)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function WorkoutTracker() {
  const { saveTrainingSession } = useRecompActions();
  const { toast } = useToast();

  const [stored, setStored] = useState(() => readStoredSession());
  const [reviewing, setReviewing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active phase state (synced to localStorage)
  const [activeSession, setActiveSession] = useState(stored);

  // Timer
  const [elapsed, setElapsed] = useState(() => {
    if (!stored?.startTime) return 0;
    return Math.floor((Date.now() - stored.startTime) / 1000);
  });
  const timerRef = useRef(null);

  // Review phase state (hydrated from activeSession when entering review)
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewRpe, setReviewRpe] = useState("");
  const [reviewMuscles, setReviewMuscles] = useState([]);
  const [reviewMuscleInput, setReviewMuscleInput] = useState("");
  const [reviewExercises, setReviewExercises] = useState([]);
  const [reviewType, setReviewType] = useState("strength");
  const [reviewDuration, setReviewDuration] = useState("");
  const [reviewCardio, setReviewCardio] = useState({ distance: "", hr: "" });

  // Idle start state
  const [startType, setStartType] = useState("strength");

  const isActive = !!activeSession && !reviewing;

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (isActive) startTimer();
    else stopTimer();
    return stopTimer;
  }, [isActive, startTimer, stopTimer]);

  // Sync active session changes to localStorage
  const updateSession = useCallback((updater) => {
    setActiveSession((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeSession(next);
      return next;
    });
  }, []);

  const startWorkout = () => {
    const session = {
      startTime: Date.now(),
      type: startType,
      exercises: []
    };
    writeSession(session);
    setElapsed(0);
    setActiveSession(session);
    setStored(session);
  };

  const addExercise = () => {
    updateSession((s) => ({
      ...s,
      exercises: [...s.exercises, { id: uid(), name: "", sets: [{ id: uid(), weight: "", reps: "" }] }]
    }));
  };

  const updateExerciseName = (exerciseId, name) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => e.id === exerciseId ? { ...e, name } : e)
    }));
  };

  const addSet = (exerciseId) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: [...e.sets, { id: uid(), weight: "", reps: "" }] }
          : e
      )
    }));
  };

  const updateSet = (exerciseId, setId, field, value) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.map((st) => st.id === setId ? { ...st, [field]: value } : st) }
          : e
      )
    }));
  };

  const removeSet = (exerciseId, setId) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.filter((st) => st.id !== setId) }
          : e
      )
    }));
  };

  const removeExercise = (exerciseId) => {
    updateSession((s) => ({
      ...s,
      exercises: s.exercises.filter((e) => e.id !== exerciseId)
    }));
  };

  const enterReview = () => {
    if (!activeSession) return;
    const durationMin = Math.round(elapsed / 60);
    setReviewType(activeSession.type);
    setReviewTitle("");
    setReviewRpe("");
    setReviewMuscles([]);
    setReviewMuscleInput("");
    setReviewExercises(
      activeSession.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({
          ...e,
          sets: e.sets.filter((s) => s.weight || s.reps)
        }))
    );
    setReviewDuration(durationMin > 0 ? String(durationMin) : "");
    setReviewCardio({ distance: "", hr: "" });
    stopTimer();
    setReviewing(true);
  };

  const backToWorkout = () => {
    setReviewing(false);
    startTimer();
  };

  const discardWorkout = () => {
    clearSession();
    setActiveSession(null);
    setStored(null);
    setReviewing(false);
    setElapsed(0);
    setDiscardOpen(false);
  };

  const addReviewMuscle = (val) => {
    const v = (val ?? reviewMuscleInput).trim();
    if (!v || reviewMuscles.some((m) => m.toLowerCase() === v.toLowerCase())) {
      setReviewMuscleInput("");
      return;
    }
    setReviewMuscles((g) => [...g, v]);
    setReviewMuscleInput("");
  };

  const addReviewExercise = () => {
    setReviewExercises((ex) => [
      ...ex,
      { id: uid(), name: "", sets: [{ id: uid(), weight: "", reps: "" }] }
    ]);
  };

  const updateReviewExerciseName = (exerciseId, name) => {
    setReviewExercises((ex) => ex.map((e) => e.id === exerciseId ? { ...e, name } : e));
  };

  const removeReviewExercise = (exerciseId) => {
    setReviewExercises((ex) => ex.filter((e) => e.id !== exerciseId));
  };

  const addReviewSet = (exerciseId) => {
    setReviewExercises((ex) =>
      ex.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: [...e.sets, { id: uid(), weight: "", reps: "" }] }
          : e
      )
    );
  };

  const updateReviewSet = (exerciseId, setId, field, value) => {
    setReviewExercises((ex) =>
      ex.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.map((s) => s.id === setId ? { ...s, [field]: value } : s) }
          : e
      )
    );
  };

  const removeReviewSet = (exerciseId, setId) => {
    setReviewExercises((ex) =>
      ex.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.filter((s) => s.id !== setId) }
          : e
      )
    );
  };

  const isStrength = reviewType === "strength" || reviewType === "mixed";

  const saveSession = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const date = todayStr();
      const validExercises = reviewExercises.filter((e) => e.name.trim());
      const sets = validExercises.flatMap((e) =>
        e.sets
          .filter((s) => s.weight || s.reps)
          .map((s, i) => ({
            exercise_name: e.name.trim(),
            weight_lbs: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            set_index: i + 1
          }))
      );
      const strengthEntries = isStrength
        ? validExercises.flatMap((e) => {
            const validSets = e.sets.filter((s) => s.weight && s.reps);
            if (!validSets.length) return [];
            const best = validSets.reduce((a, b) =>
              estimateOneRepMax(Number(a.weight), Number(a.reps)) >= estimateOneRepMax(Number(b.weight), Number(b.reps)) ? a : b
            );
            return [{
              date,
              lift_name: e.name.trim(),
              weight: Number(best.weight),
              reps: Number(best.reps),
              sets: validSets.length,
              estimated_1rm: estimateOneRepMax(Number(best.weight), Number(best.reps))
            }];
          })
        : [];

      const sessionData = {
        date,
        type: reviewType,
        title: reviewTitle.trim() || (reviewType === "cardio" ? "Cardio" : reviewType === "strength" ? "Strength" : reviewType),
        duration_minutes: reviewDuration ? Number(reviewDuration) : null,
        perceived_exertion: reviewRpe ? Number(reviewRpe) : null,
        muscle_groups: reviewMuscles,
        sets,
        cardio_distance_miles: (reviewType === "cardio" || reviewType === "mixed") && reviewCardio.distance ? Number(reviewCardio.distance) : undefined,
        cardio_avg_heart_rate: (reviewType === "cardio" || reviewType === "mixed") && reviewCardio.hr ? Number(reviewCardio.hr) : undefined
      };

      await saveTrainingSession({ session: sessionData, strengthEntries, markDaily: true });
      clearSession();
      setActiveSession(null);
      setStored(null);
      setReviewing(false);
      setElapsed(0);
      toast({ title: "Workout saved", description: `${sessionData.title} logged.` });
    } catch {
      toast({ title: "Couldn't save workout", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Idle ─────────────────────────────────────────────────────────────────
  if (!activeSession) {
    return (
      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-teal" />
            <h2 className="font-medium">Live workout</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Start a timed session and log your sets as you go. Review and edit before saving.
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Type</Label>
              <Select value={startType} onValueChange={setStartType}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-11 flex-1 bg-teal text-buttonText hover:opacity-90 gap-2"
              onClick={startWorkout}
            >
              <Play className="w-4 h-4" />
              Start workout
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Review ───────────────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal" />
              <h2 className="font-medium">Review & save</h2>
            </div>
            <div className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatElapsed(elapsed)} total
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Title (optional)</Label>
              <Input
                className="h-11"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder={reviewType === "cardio" ? "Morning run" : "Push day, leg day…"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={reviewType} onValueChange={setReviewType}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input className="h-11" type="number" inputMode="numeric" min={0} max={1440} value={reviewDuration} onChange={(e) => setReviewDuration(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>RPE (1–10)</Label>
              <Input className="h-11" type="number" inputMode="numeric" min={1} max={10} value={reviewRpe} onChange={(e) => setReviewRpe(e.target.value)} placeholder="How hard was it?" />
            </div>
          </div>

          {(reviewType === "cardio" || reviewType === "mixed") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Distance (mi)</Label>
                <Input className="h-11" type="number" inputMode="decimal" min={0} value={reviewCardio.distance} onChange={(e) => setReviewCardio((c) => ({ ...c, distance: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Avg HR</Label>
                <Input className="h-11" type="number" inputMode="numeric" min={20} max={260} value={reviewCardio.hr} onChange={(e) => setReviewCardio((c) => ({ ...c, hr: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Muscle groups</Label>
            {reviewMuscles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {reviewMuscles.map((m) => (
                  <span key={m} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-panel3 py-1 pl-3 pr-1 text-xs">
                    {m}
                    <button
                      type="button"
                      onClick={() => setReviewMuscles((g) => g.filter((x) => x !== m))}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${m}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {MUSCLE_SUGGESTIONS.filter((s) => !reviewMuscles.some((m) => m.toLowerCase() === s.toLowerCase())).map((s) => (
                <button key={s} type="button" onClick={() => addReviewMuscle(s)} className="min-h-11 rounded-full border border-line px-3 py-1 text-xs text-muted-foreground hover:border-teal/50 hover:text-foreground">
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {reviewExercises.length > 0 && (
            <div className="space-y-2">
              <Label>Exercises</Label>
              {reviewExercises.map((exercise) => (
                <ReviewExercise
                  key={exercise.id}
                  exercise={exercise}
                  onNameChange={(v) => updateReviewExerciseName(exercise.id, v)}
                  onRemove={() => removeReviewExercise(exercise.id)}
                  onAddSet={() => addReviewSet(exercise.id)}
                  onUpdateSet={(setId, field, value) => updateReviewSet(exercise.id, setId, field, value)}
                  onRemoveSet={(setId) => removeReviewSet(exercise.id, setId)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addReviewExercise}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/10 px-3 text-xs font-medium text-teal hover:bg-teal/15"
          >
            <Plus className="w-3.5 h-3.5" /> Add exercise
          </button>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 min-h-11 border-line" onClick={backToWorkout} disabled={saving}>
              Keep going
            </Button>
            <Button
              className="flex-1 min-h-11 bg-teal text-buttonText hover:opacity-90"
              onClick={saveSession}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save workout"}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="w-full text-xs text-muted-foreground hover:text-destructive text-center min-h-11"
            disabled={saving}
          >
            Discard workout
          </button>
        </CardContent>

        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your current session. Nothing will be saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={discardWorkout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    );
  }

  // ─── Active ───────────────────────────────────────────────────────────────
  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-teal" />
            <h2 className="font-medium">Workout in progress</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel2 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {TYPE_OPTIONS.find((o) => o.value === activeSession.type)?.label ?? activeSession.type}
          </span>
        </div>

        <div className="text-center py-2">
          <div className="font-mono text-5xl font-bold tabular-nums tracking-tight text-foreground" aria-live="polite" aria-label={`Elapsed time ${formatElapsed(elapsed)}`}>
            {formatElapsed(elapsed)}
          </div>
        </div>

        <div className="space-y-3">
          {activeSession.exercises.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Add your first exercise to start logging sets.
            </p>
          )}
          {activeSession.exercises.map((exercise) => (
            <ActiveExercise
              key={exercise.id}
              exercise={exercise}
              onNameChange={(v) => updateExerciseName(exercise.id, v)}
              onRemove={() => removeExercise(exercise.id)}
              onAddSet={() => addSet(exercise.id)}
              onUpdateSet={(setId, field, value) => updateSet(exercise.id, setId, field, value)}
              onRemoveSet={(setId) => removeSet(exercise.id, setId)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addExercise}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/10 px-3 text-xs font-medium text-teal hover:bg-teal/15"
        >
          <Plus className="w-3.5 h-3.5" /> Add exercise
        </button>

        <div className="flex gap-2 pt-1 border-t border-lineSoft">
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="min-h-11 px-3 text-xs text-muted-foreground hover:text-destructive"
          >
            Discard
          </button>
          <Button
            className="flex-1 min-h-11 bg-teal text-buttonText hover:opacity-90"
            onClick={enterReview}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Finish workout
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your current session. Nothing will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={discardWorkout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ActiveExercise({ exercise, onNameChange, onRemove, onAddSet, onUpdateSet, onRemoveSet }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-lg border border-lineSoft bg-panel2 overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <Input
          value={exercise.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Exercise name"
          className="h-11 text-sm flex-1"
        />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel3"
          aria-label={collapsed ? "Expand exercise" : "Collapse exercise"}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-red hover:bg-panel3"
          aria-label="Remove exercise"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {!collapsed && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-label text-muted-foreground px-1 mb-0.5">
            <span className="w-6 text-center">#</span>
            <span>Weight (lb)</span>
            <span>Reps</span>
            <span className="w-8" />
          </div>
          {exercise.sets.map((set, idx) => (
            <div key={set.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
              <span className="w-6 text-center font-mono text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={set.weight}
                onChange={(e) => onUpdateSet(set.id, "weight", e.target.value)}
                className="h-11 text-sm text-center"
                placeholder="135"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={set.reps}
                onChange={(e) => onUpdateSet(set.id, "reps", e.target.value)}
                className="h-11 text-sm text-center"
                placeholder="8"
              />
              <button
                type="button"
                onClick={() => onRemoveSet(set.id)}
                className="flex min-h-11 min-w-[2rem] items-center justify-center rounded-lg text-muted-foreground hover:text-red"
                aria-label={`Remove set ${idx + 1}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddSet}
            className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs font-medium text-teal hover:bg-teal/10"
          >
            <Plus className="w-3 h-3" /> Add set
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewExercise({ exercise, onNameChange, onRemove, onAddSet, onUpdateSet, onRemoveSet }) {
  return (
    <div className="rounded-lg border border-lineSoft bg-panel2 overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <Input
          value={exercise.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Exercise name"
          className="h-11 text-sm flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-red hover:bg-panel3"
          aria-label="Remove exercise"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="px-2.5 pb-2.5 space-y-1.5">
        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-label text-muted-foreground px-1 mb-0.5">
          <span className="w-6 text-center">#</span>
          <span>Weight (lb)</span>
          <span>Reps</span>
          <span className="w-8" />
        </div>
        {exercise.sets.map((set, idx) => (
          <div key={set.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
            <span className="w-6 text-center font-mono text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={set.weight}
              onChange={(e) => onUpdateSet(set.id, "weight", e.target.value)}
              className="h-11 text-sm text-center"
              placeholder="135"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={set.reps}
              onChange={(e) => onUpdateSet(set.id, "reps", e.target.value)}
              className="h-11 text-sm text-center"
              placeholder="8"
            />
            <button
              type="button"
              onClick={() => onRemoveSet(set.id)}
              className="flex min-h-11 min-w-[2rem] items-center justify-center rounded-lg text-muted-foreground hover:text-red"
              aria-label={`Remove set ${idx + 1}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAddSet}
          className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs font-medium text-teal hover:bg-teal/10"
        >
          <Plus className="w-3 h-3" /> Add set
        </button>
      </div>
    </div>
  );
}
