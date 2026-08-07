import { JOB_ACTIVITY_LABELS } from "@/lib/fitness";
import { SelectField, NumField, StepHeader, Why } from "./Fields";
import { EXPERIENCE_LABELS } from "./constants";

function inRange(v, min, max) {
  if (v === "" || v == null) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
}

export default function StepActivity({ p, set, showErrors }) {
  return (
    <div className="space-y-4">
      <StepHeader
        title="Activity"
        why="Sets your TDEE multiplier and step target."
      />
      <div className={showErrors && !p.job_activity ? "ring-1 ring-destructive rounded-lg" : ""}>
        <SelectField
          id="job"
          label="Daily job activity"
          value={p.job_activity}
          onChange={(v) => set("job_activity", v)}
          options={Object.entries(JOB_ACTIVITY_LABELS).map(([k, label]) => ({ value: k, label }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={showErrors && !inRange(p.average_steps, 0, 200000) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField id="steps" label="Avg daily steps" value={p.average_steps} onChange={(v) => set("average_steps", v)} min={0} max={200000} step={1} />
        </div>
        <div className={showErrors && !inRange(p.training_days_per_week, 0, 7) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField id="lift" label="Lifting days/wk" value={p.training_days_per_week} onChange={(v) => set("training_days_per_week", v)} min={0} max={7} step={1} />
        </div>
        <div className={showErrors && !inRange(p.cardio_days_per_week, 0, 7) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField id="cardio" label="Cardio days/wk" value={p.cardio_days_per_week} onChange={(v) => set("cardio_days_per_week", v)} min={0} max={7} step={1} />
        </div>
        <div className={showErrors && !p.experience_level ? "ring-1 ring-destructive rounded-lg" : ""}>
          <SelectField
            id="exp"
            label="Experience"
            value={p.experience_level}
            onChange={(v) => set("experience_level", v)}
            options={Object.entries(EXPERIENCE_LABELS).map(([k, label]) => ({ value: k, label }))}
          />
        </div>
      </div>
      <Why>
        Job activity drives your calorie burn estimate; training days set the weekly
        lift schedule and recovery pattern.
      </Why>
    </div>
  );
}
