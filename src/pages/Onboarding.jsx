import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Target, Sparkles } from "lucide-react";
import { useRecomp } from "@/lib/RecompContext";
import { GOAL_LABELS, JOB_ACTIVITY_LABELS, COACH_TONES, calculateInitialStrategy } from "@/lib/fitness";

const GOAL_ORDER = [
  "fat_loss",
  "aggressive_fat_loss",
  "fat_loss_biased_recomp",
  "body_recomposition",
  "strength_retention_cut",
  "maintenance",
  "lean_bulk",
  "muscle_gain",
  "aggressive_gain"
];

const SAFETY_FLAGS = [
  { id: "medical_condition", label: "Diagnosed medical condition" },
  { id: "eating_disorder_history", label: "History of disordered eating" },
  { id: "pregnancy", label: "Currently pregnant or breastfeeding" },
  { id: "medication", label: "On weight-affecting medication" }
];

export default function Onboarding() {
  const { completeOnboarding } = useRecomp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState({
    goal: "",
    age: "",
    sex: "male",
    height_in: "",
    current_weight_lbs: "",
    goal_weight_lbs: "",
    job_activity: "sedentary",
    average_steps: "4000",
    training_days_per_week: "3",
    cardio_days_per_week: "0",
    experience_level: "beginner",
    primary_concern: ""
  });
  const [tone, setTone] = useState("direct");
  const [safety, setSafety] = useState([]);

  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  const toggleSafety = (id) => setSafety((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const stepValid = [
    !!p.goal,
    !!p.age && !!p.sex && !!p.height_in && !!p.current_weight_lbs,
    !!p.job_activity && !!p.average_steps && !!p.training_days_per_week && !!p.experience_level
  ][step];

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
      const prefData = { tone, safety_flags: safety };
      await completeOnboarding(profileData, prefData);
      navigate("/", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStep((s) => Math.min(2, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen bg-bg text-foreground px-4 py-8 mx-auto max-w-md">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center">
          <Target className="w-5 h-5 text-buttonText" />
        </div>
        <span className="font-semibold text-lg">RecompIQ</span>
      </div>

      <div className="flex gap-1.5 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal" : "bg-panel2"}`} />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">What's your main goal?</h1>
          <p className="text-sm text-muted-foreground">You can refine this later as data comes in.</p>
          {GOAL_ORDER.map((g) => (
            <button
              key={g}
              onClick={() => set("goal", g)}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                p.goal === g ? "border-teal bg-teal/10" : "border-line bg-panel"
              }`}
            >
              <div className="font-medium">{GOAL_LABELS[g].label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{GOAL_LABELS[g].blurb}</div>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Your basics</h1>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="Age" value={p.age} onChange={(v) => set("age", v)} />
            <div className="space-y-1.5">
              <Label>Sex</Label>
              <Select value={p.sex} onValueChange={(v) => set("sex", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumField label="Height (in)" value={p.height_in} onChange={(v) => set("height_in", v)} hint="e.g. 69 = 5'9&quot;" />
            <NumField label="Current weight (lb)" value={p.current_weight_lbs} onChange={(v) => set("current_weight_lbs", v)} />
            <NumField label="Goal weight (lb)" value={p.goal_weight_lbs} onChange={(v) => set("goal_weight_lbs", v)} hint="Optional" />
            <TextField label="Main concern" value={p.primary_concern} onChange={(v) => set("primary_concern", v)} hint="Optional" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Activity & coaching</h1>
          <div className="space-y-1.5">
            <Label>Daily job activity</Label>
            <Select value={p.job_activity} onValueChange={(v) => set("job_activity", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(JOB_ACTIVITY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumField label="Avg daily steps" value={p.average_steps} onChange={(v) => set("average_steps", v)} />
            <NumField label="Lifting days/wk" value={p.training_days_per_week} onChange={(v) => set("training_days_per_week", v)} />
            <NumField label="Cardio days/wk" value={p.cardio_days_per_week} onChange={(v) => set("cardio_days_per_week", v)} />
            <div className="space-y-1.5">
              <Label>Experience</Label>
              <Select value={p.experience_level} onValueChange={(v) => set("experience_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Coach tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COACH_TONES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Safety flags (optional)</Label>
            <p className="text-xs text-muted-foreground -mt-1">If any apply, RecompIQ avoids aggressive targets and recommends professional guidance.</p>
            {SAFETY_FLAGS.map((f) => (
              <label key={f.id} className="flex items-center gap-3 rounded-lg bg-panel border border-line p-3">
                <input type="checkbox" checked={safety.includes(f.id)} onChange={() => toggleSafety(f.id)} className="w-4 h-4 accent-teal" />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>

          {profilePreview && (
            <Card className="bg-panel3 border-line">
              <CardContent className="p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-teal font-medium text-sm">
                  <Sparkles className="w-4 h-4" /> Your starting targets
                </div>
                <div className="text-sm">
                  {profilePreview.calorie_target} kcal · {profilePreview.protein_target_g}g protein · {profilePreview.step_target} steps
                </div>
                <div className="text-xs text-muted-foreground">
                  TDEE estimate {profilePreview.tdee_estimate}. Adjusts weekly from your trends.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <Button variant="outline" className="flex-1" onClick={back}>Back</Button>
        )}
        {step < 2 ? (
          <Button className="flex-1 bg-teal text-buttonText hover:opacity-90" disabled={!stepValid} onClick={next}>
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button className="flex-1 bg-teal text-buttonText hover:opacity-90" disabled={saving || !stepValid} onClick={finish}>
            {saving ? "Building plan…" : "Build my plan"}
          </Button>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, hint }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange, hint }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}