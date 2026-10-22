import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, Target } from "lucide-react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { useAuth } from "@/lib/AuthContext";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  pickPreferenceDraftFields,
  pickProfileDraftFields,
  saveOnboardingDraft
} from "@/lib/onboardingDraft";
import { calculateInitialStrategy, COACH_TONES, EXPERIENCE_LEVELS, GOALS, JOB_ACTIVITIES, SEXES } from "@/lib/fitness";
import { planSettingsRevision } from "@/lib/planSettings";
import { DIET_STYLES } from "@/components/onboarding/constants";
import StepGoal from "@/components/onboarding/StepGoal";
import StepAboutActivity from "@/components/onboarding/StepAboutActivity";
import StepNutrition from "@/components/onboarding/StepNutrition";
import StepReview from "@/components/onboarding/StepReview";

const STEPS = [
  { label: "Goal" },
  { label: "About you" },
  { label: "Preferences" },
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
  "Pick a goal to continue.",
  "Complete the highlighted fields to continue.",
  "Pick a diet style to continue.",
  ""
];

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function inRange(value, min, max) {
  if (value === "" || value === null || value === undefined) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

// The draft is scoped to the signed-in account. Keying the form by user id
// remounts it (and re-reads that account's draft) if the account changes.
export default function Onboarding() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [params] = useSearchParams();
  const redo = params.get("redo") === "1";
  return <OnboardingForm key={`${userId ?? "anonymous"}:${redo}`} userId={userId} redo={redo} />;
}

function OnboardingForm({ userId, redo }) {
  const {
    completeOnboarding,
    upsertDailyLog,
    loading,
    loadError,
    profile,
    preferences,
    strategy,
    onboarded,
    reload
  } = useRecomp();
  const navigate = useNavigate();

  const draftMode = redo ? "redo" : "initial";
  const saved = useMemo(() => loadOnboardingDraft(browserStorage(), userId, draftMode), [userId, draftMode]);
  const [searchParams, setSearchParams] = useSearchParams();
  const step = Math.min(
    STEPS.length - 1,
    Math.max(0, Math.floor(Number(searchParams.get("step") ?? saved?.step ?? 0) || 0))
  );
  const [p, setP] = useState(() => (saved ? { ...DEFAULTS.p, ...saved.p } : DEFAULTS.p));
  const [pref, setPrefRaw] = useState(() => (saved ? { ...DEFAULTS.pref, ...saved.pref } : DEFAULTS.pref));
  const [units, setUnits] = useState(saved?.units ?? DEFAULTS.units);
  const [saving, setSaving] = useState(false);
  const [errorStep, setErrorStep] = useState(null);
  const [saveError, setSaveError] = useState("");
  // Fix 2: showErrors triggers per-field highlight classes in step components.
  const [showErrors, setShowErrors] = useState(false);
  const restoredPartialSetup = useRef(false);
  const savingRef = useRef(false);
  const [hydrated, setHydrated] = useState(Boolean(saved));
  const [keepCustomTargets, setKeepCustomTargets] = useState(saved?.keepCustomTargets ?? true);
  const currentRevision = useMemo(() => planSettingsRevision(profile, preferences, strategy), [profile, preferences, strategy]);
  const baseRevision = useRef(saved?.baseRevision ?? "");
  const isRedo = redo && onboarded;
  const staleDraft = isRedo && hydrated && baseRevision.current && baseRevision.current !== currentRevision;

  useEffect(() => {
    if (loading || loadError || staleDraft || restoredPartialSetup.current) return;
    restoredPartialSetup.current = true;
    if (saved) {
      baseRevision.current ||= currentRevision;
      setHydrated(true);
      return;
    }

    // Only allowlisted form fields are copied from the server records, so
    // record metadata (id, created_by email, created_by_id) never enters form
    // state or the stored draft. Numeric fields become input strings.
    if (profile) {
      setP((current) => ({ ...current, ...pickProfileDraftFields(profile) }));
    }
    if (preferences) {
      setPrefRaw((current) => ({ ...current, ...pickPreferenceDraftFields(preferences) }));
    }
    baseRevision.current = currentRevision;
    setHydrated(true);
  }, [loading, loadError, preferences, profile, saved, staleDraft, currentRevision]);

  useEffect(() => {
    if (!hydrated || loading || loadError || saving || staleDraft) return;
    saveOnboardingDraft(browserStorage(), userId, {
      p, pref, units, step,
      ...(redo ? { keepCustomTargets, baseRevision: baseRevision.current } : {})
    }, draftMode);
  }, [p, pref, units, step, userId, hydrated, loading, loadError, saving, staleDraft, redo, keepCustomTargets, draftMode]);

  useEffect(() => {
    if (!loading && onboarded && !saving && !redo) navigate("/today", { replace: true });
  }, [loading, navigate, onboarded, saving, redo]);

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const setPref = (k, v) => setPrefRaw((s) => ({ ...s, [k]: v }));

  const validations = [
    GOALS.includes(p.goal),
    inRange(p.age, 18, 120) &&
      SEXES.includes(p.sex) &&
      inRange(p.height_in, 36, 108) &&
      inRange(p.current_weight_lbs, 40, 1200) &&
      (!p.goal_weight_lbs || inRange(p.goal_weight_lbs, 40, 1200)) &&
      (isRedo || !p.waist_in || inRange(p.waist_in, 10, 150)) &&
      JOB_ACTIVITIES.includes(p.job_activity) &&
      inRange(p.average_steps, 0, 200000) &&
      inRange(p.training_days_per_week, 0, 7) &&
      inRange(p.cardio_days_per_week, 0, 7) &&
      EXPERIENCE_LEVELS.includes(p.experience_level),
    DIET_STYLES.includes(pref.diet_style) && COACH_TONES.includes(pref.tone),
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
    const calculated = calculateInitialStrategy({
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
    if (isRedo && keepCustomTargets && strategy?.manual_override) {
      return { ...calculated, calorie_target: strategy.calorie_target, protein_target_g: strategy.protein_target_g, step_target: strategy.step_target };
    }
    return calculated;
  }, [p, pref, isRedo, keepCustomTargets, strategy]);

  const goTo = (n) => {
    if (savingRef.current) return;
    setErrorStep(null);
    setShowErrors(false);
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      params.set("step", String(n));
      return params;
    });
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
    if (savingRef.current || !hydrated || staleDraft) return;
    const invalidStep = validations.findIndex((valid) => !valid);
    if (invalidStep !== -1) {
      goTo(invalidStep);
      setErrorStep(invalidStep);
      setShowErrors(true);
      return;
    }
    savingRef.current = true;
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
        goal_weight_lbs: p.goal_weight_lbs ? Number(p.goal_weight_lbs) : isRedo ? null : undefined,
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
      await completeOnboarding(profileData, prefData, { keepCustomTargets });
      if (!isRedo && p.waist_in) {
        try {
          await upsertDailyLog(todayStr(), { waist_in: Number(p.waist_in) });
        } catch (error) {
          console.warn("Plan created, but the baseline waist measurement was not saved.", error);
        }
      }
      clearOnboardingDraft(browserStorage(), userId, draftMode);
      navigate("/today", { replace: true });
    } catch (error) {
      console.error("Unable to complete onboarding", error);
      setSaveError(isRedo ? error.message || "We couldn't update your plan. Your draft is saved; try again." : "We couldn't finish building your plan. Your answers are saved; try again to resume safely.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const cancelRedo = () => {
    if (savingRef.current) return;
    clearOnboardingDraft(browserStorage(), userId, draftMode);
    navigate("/more/profile", { replace: true });
  };

  const useLatestSettings = () => {
    setP({ ...DEFAULTS.p, ...pickProfileDraftFields(profile), waist_in: "" });
    setPrefRaw({ ...DEFAULTS.pref, ...pickPreferenceDraftFields(preferences) });
    setKeepCustomTargets(true);
    baseRevision.current = currentRevision;
    setHydrated(true);
    restoredPartialSetup.current = true;
    clearOnboardingDraft(browserStorage(), userId, draftMode);
    goTo(0);
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

  if (staleDraft && !saving) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg text-foreground px-4 py-8 mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Your saved settings changed</h1>
        {saveError && <p role="alert" className="text-sm text-red">{saveError}</p>}
        <p className="text-sm text-muted-foreground">Your unfinished setup uses older answers. Start with your latest saved settings to avoid replacing a newer change.</p>
        <Button onClick={useLatestSettings} className="w-full min-h-11 bg-teal text-buttonText">Use latest settings</Button>
        <Button variant="outline" onClick={cancelRedo} className="w-full min-h-11">Cancel setup</Button>
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

      <div className="flex flex-col gap-2 mb-6">
        {isRedo && <div className="mb-4 space-y-2">
          <h1 className="text-xl font-semibold">Redo onboarding</h1>
          <p className="text-sm text-muted-foreground">Review your current answers and update your plan. Changes apply when you save. Your Premium access and logged history are kept.</p>
          <Button variant="outline" className="min-h-11" disabled={saving} onClick={cancelRedo}>Cancel setup</Button>
        </div>}
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

      {step === 0 && <StepGoal p={p} set={set} showErrors={showErrors} />}
      {step === 1 && <StepAboutActivity p={p} set={set} units={units} setUnits={setUnits} showErrors={showErrors} showBaseline={!isRedo} />}
      {step === 2 && <StepNutrition pref={pref} setPref={setPref} showErrors={showErrors} />}
      {step === 3 && (
        <>
        {isRedo && strategy?.manual_override && <label className="mb-4 flex min-h-11 items-start gap-3 rounded-xl border border-line bg-panel p-4 text-sm">
          <input type="checkbox" aria-label="Keep my custom targets" className="mt-1 accent-teal" checked={keepCustomTargets} disabled={saving} onChange={(event) => setKeepCustomTargets(event.target.checked)} />
          <span><span className="block font-medium">Keep my custom targets</span><span className="text-muted-foreground">Uncheck to replace your custom numbers with the recalculated adaptive plan.</span></span>
        </label>}
        <StepReview
          p={p}
          pref={pref}
          units={units}
          onEdit={goTo}
          profilePreview={profilePreview}
          showBaseline={!isRedo}
          manualTargets={isRedo && keepCustomTargets && Boolean(strategy?.manual_override)}
        />
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
          <Button variant="outline" className="flex-1" onClick={back} disabled={saving}>
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
            disabled={saving || !hydrated}
            onClick={finish}
          >
            {saving ? "Saving plan…" : isRedo ? "Save updated plan" : "Build my plan"}
          </Button>
        )}
      </div>
    </main>
  );
}
