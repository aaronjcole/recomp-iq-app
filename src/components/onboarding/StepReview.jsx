import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Pencil } from "lucide-react";
import { GOAL_LABELS, JOB_ACTIVITY_LABELS } from "@/lib/fitness";
import { StepHeader } from "./Fields";
import { SAFETY_FLAGS } from "./constants";
import { splitFeetInches, storedInchesToCm } from "@/lib/heightConversion";

const lbsToKg = (lbs) => lbs * 0.45359237;
const inToCm = (inches) => inches * 2.54;

function ReviewSection({ step, title, rows, onEdit }) {
  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-label uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(step)}
            className="text-teal h-7 px-2 text-xs"
          >
            <Pencil className="w-3 h-3 mr-1" /> Edit
          </Button>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium text-right">{r.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function StepReview({ p, pref, units, onEdit, profilePreview }) {
  const metric = units === "metric";
  const { ft, inch } = splitFeetInches(p.height_in);
  const w = (lbs) =>
    lbs ? (metric ? `${+(lbsToKg(Number(lbs))).toFixed(1)} kg` : `${lbs} lb`) : "—";
  const heightStr = metric
    ? `${storedInchesToCm(p.height_in)} cm`
    : `${ft}'${inch}"`;
  const sexLabel = p.sex.charAt(0).toUpperCase() + p.sex.slice(1);
  const safetyLabel = (id) => SAFETY_FLAGS.find((f) => f.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      <StepHeader
        title="Review your plan"
        why="Confirm the details, then we'll build your starting targets."
      />
      <ReviewSection
        step={0}
        title="Goal"
        onEdit={onEdit}
        rows={[{ label: "Goal", value: GOAL_LABELS[p.goal]?.label ?? "—" }]}
      />
      <ReviewSection
        step={1}
        title="About you"
        onEdit={onEdit}
        rows={[
          { label: "Age", value: p.age ? `${p.age} yrs` : "—" },
          { label: "Sex", value: sexLabel },
          { label: "Height", value: heightStr },
          { label: "Current weight", value: w(p.current_weight_lbs) },
          { label: "Goal weight", value: p.goal_weight_lbs ? w(p.goal_weight_lbs) : "Optional" },
          {
            label: "Baseline waist",
            value: p.waist_in
              ? metric
                ? `${+(inToCm(Number(p.waist_in))).toFixed(1)} cm`
                : `${p.waist_in} in`
              : "Skipped"
          }
        ]}
      />
      <ReviewSection
        step={1}
        title="Activity"
        onEdit={onEdit}
        rows={[
          { label: "Job activity", value: JOB_ACTIVITY_LABELS[p.job_activity] },
          { label: "Avg steps", value: p.average_steps },
          { label: "Lifting", value: `${p.training_days_per_week} days/wk` },
          { label: "Cardio", value: `${p.cardio_days_per_week} days/wk` },
          {
            label: "Experience",
            value: p.experience_level.charAt(0).toUpperCase() + p.experience_level.slice(1)
          }
        ]}
      />
      <ReviewSection
        step={2}
        title="Preferences"
        onEdit={onEdit}
        rows={[
          { label: "Diet style", value: pref.diet_style || "—" },
          { label: "Preferred training", value: pref.preferred_training || "—" },
          {
            label: "Disliked strategies",
            value: pref.disliked_strategies.length ? pref.disliked_strategies.join(", ") : "None"
          },
          {
            label: "Known barriers",
            value: pref.known_barriers.length ? pref.known_barriers.join(", ") : "None"
          },
          {
            label: "Health flags",
            value: pref.safety_flags.length
              ? pref.safety_flags.map(safetyLabel).join(", ")
              : "None"
          }
        ]}
      />
      {profilePreview && (
        <Card className="bg-panel3 border-line">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-teal font-medium text-sm">
              <Sparkles className="w-4 h-4" /> Starting targets
            </div>
            <div className="text-sm">
              {profilePreview.calorie_target} kcal · {profilePreview.protein_target_g}g protein ·{" "}
              {profilePreview.step_target} steps
            </div>
            <div className="text-xs text-muted-foreground">
              TDEE estimate {profilePreview.tdee_estimate}. Adjusts weekly from your trends.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
