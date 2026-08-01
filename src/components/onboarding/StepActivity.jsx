import { JOB_ACTIVITY_LABELS } from "@/lib/fitness";
import { SelectField, NumField, StepHeader, Why } from "./Fields";
import { EXPERIENCE_LABELS } from "./constants";

export default function StepActivity({ p, set }) {
  return (
    <div className="space-y-4">
      <StepHeader
        title="Activity"
        why="Sets your TDEE multiplier and step target."
      />
      <SelectField
        id="job"
        label="Daily job activity"
        value={p.job_activity}
        onChange={(v) => set("job_activity", v)}
        options={Object.entries(JOB_ACTIVITY_LABELS).map(([k, label]) => ({ value: k, label }))}
      />
      <div className="grid grid-cols-2 gap-4">
        <NumField id="steps" label="Avg daily steps" value={p.average_steps} onChange={(v) => set("average_steps", v)} min={0} max={200000} step={1} />
        <NumField id="lift" label="Lifting days/wk" value={p.training_days_per_week} onChange={(v) => set("training_days_per_week", v)} min={0} max={7} step={1} />
        <NumField id="cardio" label="Cardio days/wk" value={p.cardio_days_per_week} onChange={(v) => set("cardio_days_per_week", v)} min={0} max={7} step={1} />
        <SelectField
          id="exp"
          label="Experience"
          value={p.experience_level}
          onChange={(v) => set("experience_level", v)}
          options={Object.entries(EXPERIENCE_LABELS).map(([k, label]) => ({ value: k, label }))}
        />
      </div>
      <Why>
        Job activity drives your calorie burn estimate; training days set the weekly
        lift schedule and recovery pattern.
      </Why>
    </div>
  );
}
