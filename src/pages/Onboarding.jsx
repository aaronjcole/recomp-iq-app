import { useState, useMemo, useEffect } from "react";
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

const STORAGE_KEY = "recompiq_onboarding_v1";
const STEPS = 7;

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
    safety_flags: [],
    notification_preferences: {
      weigh_in_reminder: true,
      weigh_in_time: "07:00",
      weekly_checkin_day: "Monday",
      checkin_reminder: true
    }
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

export default function Onboarding() {
  const { completeOnboarding, upsertDailyLog } = useRecomp();
  const navigate = useNavigate();

  const saved = useMemo(() => loadState(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const step = Math.min(
    STEPS - 1,
    Math.max(0, Number(searchParams.get("step") ?? saved?.step ?? 0) || 0)
  );
  const [p, setP] = useState(saved?.p ?? DEFAULTS.p);
  const [pref, setPrefRaw] = useState(saved?.pref ?? DEFAULTS.pref);
  const [units, setUnits] = useState(saved?.units ?? DEFAULTS.units);
  const [saving, setSaving] = useState(false);
  const [errorStep, setErrorStep] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ p, pref, units, step }));
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [p, pref, units, step]);

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const setPref = (k, v) => setPrefRaw((s) => ({ ...s, [k]: v }));

  const validations = [
    true,
    !!p.goal,
    !!p.age && !!p.sex && !!p.height_in && !!p.current_weight_lbs,
    !!p.job_activity && !!p.average_steps && !!p.training_days_per_week && !!p.experience_level,
    !!pref.diet_style,
    !!pref.tone,
    true
  ];
  const stepValid = validations[step];

  const profilePreview = useMemo(() => {
    if (!p.goal || !p.age || !p.height_in || !p.current_weight_lbs) return null;
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
    });
  }, [p]);

  const goTo = (n) => {
    setErrorStep(null);
    setSearchParams({ step: String(n) });
  };
  const next = () => {
    if (!stepValid) {
      setErrorStep(step);
      return;
    }
    goTo(Math.min(STEPS - 1, step + 1));
  };
  const back = () => goTo(Math.max(0, step - 1));

  const finish = async () => {
    setSaving(true);
    try {
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
        primary_concern: p.primary_concern || undefined
      };
      const prefData = {
        tone: pref.tone,
        safety_flags: pref.safety_flags,
        diet_style: pref.diet_style,
        preferred_training: pref.preferred_training,
        disliked_strategies: pref.disliked_strategies,
        known_barriers: pref.known_barriers,
        notification_preferences: pref.notification_preferences
      };
      // Seed baseline waist before onboarding completes so the Recomp Signal
      // has a starting point (done first to avoid a gate-triggered unmount race).
      if (p.waist_in) {
        await upsertDailyLog(todayStr(), { waist_in: Number(p.waist_in) });
      }
      await completeOnboarding(profileData, prefData);
      localStorage.removeItem(STORAGE_KEY);
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-foreground px-4 py-8 mx-auto max-w-md">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center">
          <Target className="w-5 h-5 text-buttonText" />
        </div>
        <span className="font-semibold text-lg">RecompIQ</span>
      </div>

      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal" : "bg-panel2"}`}
          />
        ))}
      </div>

      {step === 0 && <StepWelcome />}
      {step === 1 && <StepGoal p={p} set={set} />}
      {step === 2 && <StepAbout p={p} set={set} units={units} setUnits={setUnits} />}
      {step === 3 && <StepActivity p={p} set={set} />}
      {step === 4 && <StepNutrition pref={pref} setPref={setPref} />}
      {step === 5 && <StepCoaching pref={pref} setPref={setPref} />}
      {step === 6 && (
        <StepReview
          p={p}
          pref={pref}
          units={units}
          onEdit={goTo}
          profilePreview={profilePreview}
        />
      )}

      {errorStep === step && !stepValid && (
        <p className="text-xs text-red mt-3">{STEP_MESSAGES[step]}</p>
      )}

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="outline" className="flex-1" onClick={back}>
            Back
          </Button>
        )}
        {step < STEPS - 1 ? (
          <Button
            className="flex-1 bg-teal text-buttonText hover:opacity-90"
            disabled={!stepValid}
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
    </div>
  );
}