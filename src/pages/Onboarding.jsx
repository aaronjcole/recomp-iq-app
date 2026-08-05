import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, Target } from "lucide-react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { calculateInitialStrategy } from "@/lib/fitness";
import StepWelcome from "@/components/onboarding/StepWelcome";
import StepGoal from "@/components/onboarding/StepGoal";
import StepAbout from "@/components/onboarding/StepAbout";
import StepActivity from "@/components/onboarding/StepActivity";
import StepNutrition from "@/components/onboarding/StepNutrition";
import StepCoaching from "@/components/onboarding/StepCoaching";
import StepReview from "@/components/onboarding/StepReview";

// Keep the legacy key so existing users retain onboarding progress through the rebrand.
const STORAGE_KEY = "recompiq_onboarding_v1";

// Fix 1: STEPS is now an array of objects so each step has a human-readable label.
const STEPS = [
  { label: "Welcome" },
  { label: "Goal" },
  { label: "About you" },
  { label: "Activity & training" },
  { label: "Nutrition & lifestyle" },
  { label: "Coaching" },
  { label: "Review" },
];

// Fix 4: Derive primary_concern from goal. Values mirror the enum used by the backend.
const PRIMARY_CONCERN_MAP = {
  fat_loss: "fat_loss",
  aggressive_fat_loss: "fat_loss",
  strength_retention_cut: "fat_loss",
  fat_loss_biased_recomp: "body_recomp",
  body_recomposition: "body_recomp",
  maintenance: "maintenance",
  lean_bulk: "muscle_gain",
  muscle_gain: "muscle_gain",
  aggressive_gain: "muscle_gain",
};

const DEFAULTS = {
  p: {
    goal: "",
    age: "",
    sex: "male",
    height_in: "68",
    current_weight_lbs: "",
    goal_weight_lbs: "",
    waist_in: "",
    job_activity: "sedentary",
    average_steps: "4000",
    training_days_per_week: "3",
    cardio_days_per_week: "0",
    experience_level: "beginner",
    primary_concern: ""
  },
  pref: {
    tone: "direct",
    diet_style: "",
    preferred_training: "",
    disliked_strategies: [],
    known_barriers: [],
    safety_flags: []
  },
  units: "imperial"
};

const STEP_MESSAGES = [
  "",
  "Pick a goal to continue.",
  "Add your age, height, and current weight.",
  "Complete the activity fields.",
  "Pick a diet style to continue.",
  "Pick a coach tone to continue.",
  ""
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function inRange(value, min, max) {
  if (value === "" || value === null || value === undefined) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export default function Onboarding() {
  const {
    completeOnboarding,
    upsertDailyLog,
    loading,
    loadError,
    profile,
    preferences,
    onboarded,
    reload
  } = useRecomp();
  const navigate = useNavigate();

  const saved = useMemo(() => loadState(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const step = Math.min(
    STEPS.length - 1,
    Math.max(0, Number(searchParams.get("step") ?? saved?.step ?? 0) || 0)
  );
  const [p, setP] = useState(saved?.p ?? DEFAULTS.p);
  const [pref, setPrefRaw] = useState(saved?.pref ?? DEFAULTS.pref);
  const [units, setUnits] = useState(saved?.units ?? DEFAULTS.units);
  const [saving, setSaving] = useState(false);
  const [errorStep, setErrorStep] = useState(null);
  const [saveError, setSaveError] = useState("");
  // Fix 2: showErrors triggers per-field highlight classes in step components.
  const [showErrors, setShowErrors] = useState(false);
  const restoredPartialSetup = useRef(false);

  useEffect(() => {
    if (loading || saved || restoredPartialSetup.current) return;
    restoredPartialSetup.current = true;

    if (profile) {
      setP((current) => ({
        ...current,
        ...profile,
        age: String(profile.age ?? current.age),
        height_in: String(profile.height_in ?? current.height_in),
        current_weight_lbs: String(profile.current_weight_lbs ?? current.current_weight_lbs),
        goal_weight_lbs: String(profile.goal_weight_lbs ?? current.goal_weight_lbs),
        average_steps: String(profile.average_steps ?? current.average_steps),
        training_days_per_week: String(
          profile.training_days_per_week ?? current.training_days_per_week
        ),
        cardio_days_per_week: String(
          profile.cardio_days_per_week ?? current.cardio_days_per_week
        )
      }));
    }
    if (preferences) {
      setPrefRaw((current) => ({
        ...current,
        ...preferences
      }));
    }
  }, [loading, preferences, profile, saved]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ p, pref, units, step }));
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [p, pref, units, step]);

  useEffect(() => {
    if (!loading && onboarded && !saving) navigate("/today", { replace: true });
  }, [loading, navigate, onboarded, saving]);

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const setPref = (k, v) => setPrefRaw((s) => ({ ...s, [k]: v }));

  const validations = [
    true,
    !!p.goal,
    inRange(p.age, 18, 120) &&
      !!p.sex &&
      inRange(p.height_in, 36, 108) &&
      inRange(p.current_weight_lbs, 40, 1200) &&
      (!p.goal_weight_lbs || inRange(p.goal_weight_lbs, 40, 1200)) &&
      (!p.waist_in || inRange(p.waist_in, 10, 150)),
    !!p.job_activity &&
      inRange(p.average_steps, 0, 200000) &&
      inRange(p.training_days_per_week, 0, 7) &&
      inRange(p.cardio_days_per_week, 0, 7) &&
      !!p.experience_level,
    !!pref.diet_style,
    !!pref.tone,
    true
  ];
  const stepValid = validations[step];

  const profilePreview = useMemo(() => {
    if (
      !p.goal ||
      !inRange(p.age, 18, 120) ||
      !inRange(p.height_in, 36, 108) ||
      !inRange(p.current_weight_lbs, 40, 1200)
    ) return null;
    return calculateInitialStrategy({
      sex: p.sex,
      age: Number(p.age),
      height_in: Number(p.height_in),
      current_weight_lbs: Number(p.current_weight_lbs),
      goal_weight_lbs: p.goal_weight_lbs ? Number(p.goal_weight_lbs) : Number(p.current_weight_lbs),
      goal: p.goal,
      job_activity: p.job_activity,
      average_steps: Number(p.average_steps),
      training_days_per_week: Number(p.training_days_per_week),
      cardio_days_per_week: Number(p.cardio_days_per_week)
    }, pref);
  }, [p, pref]);

  const goTo = (n) => {
    setErrorStep(null);
    setShowErrors(false);
    setSearchParams({ step: String(n) });
  };
  const next = () => {
    if (!stepValid) {
      // Fix 2: surface the validation error and arm showErrors so step
      // components can highlight the specific empty/invalid inputs.
      setErrorStep(step);
      setShowErrors(true);
      return;
    }
    goTo(Math.min(STEPS.length - 1, step + 1));
  };
  const back = () => goTo(Math.max(0, step - 1));

  const finish = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Fix 4: derive primary_concern from goal; fall back to any manually
      // stored value in case the goal key is somehow unrecognised.
      const derivedPrimaryConcern = p.goal
        ? (PRIMARY_CONCERN_MAP[p.goal] ?? p.primary_concern ?? "")
        : (p.primary_concern || "");
      const profileData = {
        age: Number(p.age),
        sex: p.sex,
        height_in: Number(p.height_in),
        current_weight_lbs: Number(p.current_weight_lbs),
        goal_weight_lbs: p.goal_weight_lbs ? Number(p.goal_weight_lbs) : undefined,
        goal: p.goal,
        training_days_per_week: Number(p.training_days_per_week),
        cardio_days_per_week: Number(p.cardio_days_per_week),
        job_activity: p.job_activity,
        average_steps: Number(p.average_steps),
        experience_level: p.experience_level,
        primary_concern: derivedPrimaryConcern || undefined
      };
      const prefData = {
        tone: pref.tone,
        safety_flags: pref.safety_flags,
        diet_style: pref.diet_style,
        preferred_training: pref.preferred_training,
        disliked_strategies: pref.disliked_strategies,
        known_barriers: pref.known_barriers
      };
      await completeOnboarding(profileData, prefData);
      if (p.waist_in) {
        try {
          await upsertDailyLog(todayStr(), { waist_in: Number(p.waist_in) });
        } catch (error) {
          console.warn("Plan created, but the baseline waist measurement was not saved.", error);
        }
      }
      localStorage.removeItem(STORAGE_KEY);
      navigate("/today", { replace: true });
    } catch (error) {
      console.error("Unable to complete onboarding", error);
      setSaveError("We couldn't finish building your plan. Your answers are saved; try again to resume safely.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main id="main-content" tabIndex={-1} className="fixed inset-0 flex items-center justify-center bg-bg">
        <div role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-panel2 border-t-teal" />
          <span className="sr-only">Loading your account</span>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg text-foreground px-4 py-8 mx-auto max-w-md flex items-center">
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold">We couldn't check your account</h1>
          <p className="text-sm text-muted-foreground">
            Your existing setup is safe. Retry before starting onboarding again.
          </p>
          <Button onClick={reload} className="bg-teal text-buttonText hover:opacity-90">
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg text-foreground px-4 py-8 mx-auto max-w-md">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center">
          <Target className="w-5 h-5 text-buttonText" />
        </div>
        <span className="font-semibold text-lg">RecompOne</span>
      </div>

      {/* Fix 1: progress bar + step label so users know where they are */}
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-teal" : "bg-panel2"}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {STEPS[step]?.label ?? ""} · Step {step + 1} of {STEPS.length}
        </p>
      </div>

      {step === 0 && <StepWelcome />}
      {/* Fix 2: pass showErrors so step components can highlight invalid fields */}
      {step === 1 && <StepGoal p={p} set={set} showErrors={showErrors} />}
      {step === 2 && <StepAbout p={p} set={set} units={units} setUnits={setUnits} showErrors={showErrors} />}
      {step === 3 && <StepActivity p={p} set={set} showErrors={showErrors} />}
      {step === 4 && <StepNutrition pref={pref} setPref={setPref} showErrors={showErrors} />}
      {step === 5 && <StepCoaching pref={pref} setPref={setPref} showErrors={showErrors} />}
      {step === 6 && (
        <>
          <StepReview
            p={p}
            pref={pref}
            units={units}
            onEdit={goTo}
            profilePreview={profilePreview}
          />
          {/* Fix 4: read-only primary_concern display derived from goal */}
          {p.goal && (
            <div className="mt-4 rounded-xl border border-line bg-panel px-4 py-3 space-y-1">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Primary concern</p>
              <p className="text-sm font-medium">{PRIMARY_CONCERN_MAP[p.goal] ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Automatically set based on your goal.</p>
            </div>
          )}
        </>
      )}

      {errorStep === step && !stepValid && (
        <p className="text-xs text-red mt-3">{STEP_MESSAGES[step]}</p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-red mt-3">
          {saveError}
        </p>
      )}

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="outline" className="flex-1" onClick={back}>
            Back
          </Button>
        )}
        {/* Fix 2: button is always clickable so the error message + field
            highlights can fire; next() still guards forward navigation. */}
        {step < STEPS.length - 1 ? (
          <Button
            className="flex-1 bg-teal text-buttonText hover:opacity-90"
            onClick={next}
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            className="flex-1 bg-teal text-buttonText hover:opacity-90"
            disabled={saving}
            onClick={finish}
          >
            {saving ? "Building plan…" : "Build my plan"}
          </Button>
        )}
      </div>
    </main>
  );
}
