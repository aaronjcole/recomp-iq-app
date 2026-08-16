import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { NumField, SelectField, StepHeader, Why } from "./Fields";
import { EXPERIENCE_LABELS } from "./constants";
import { JOB_ACTIVITY_LABELS } from "@/lib/fitness";
import {
  cmToStoredInches,
  feetInchesToStored,
  splitFeetInches,
  storedInchesToCm
} from "@/lib/heightConversion";

function inRange(v, min, max) {
  if (v === "" || v == null) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
}

const kgToLbs = (kg) => kg / 0.45359237;
const lbsToKg = (lbs) => lbs * 0.45359237;
const cmToIn = (cm) => cm / 2.54;
const inToCm = (inches) => inches * 2.54;

export default function StepAboutActivity({ p, set, units, setUnits, showErrors }) {
  const metric = units === "metric";

  const weightDisplay = (stored) => {
    if (stored === "" || stored == null) return "";
    return metric ? +(lbsToKg(Number(stored)).toFixed(1)) : stored;
  };
  const weightChange = (v, key) => {
    if (v === "") return set(key, "");
    set(key, metric ? +(kgToLbs(Number(v)).toFixed(1)) : v);
  };

  const { ft, inch } = splitFeetInches(p.height_in || 68);
  const cmDisplay = p.height_in ? storedInchesToCm(p.height_in) : "";

  return (
    <div className="space-y-4">
      <StepHeader
        title="About you"
        why="Drives your calorie estimate and weekly step target."
      />

      <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
        {["imperial", "metric"].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnits(u)}
            className={`min-h-11 px-3 py-2 text-xs font-medium rounded-md capitalize ${
              units === u ? "bg-teal text-buttonText" : "text-muted-foreground"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={showErrors && !inRange(p.age, 18, 120) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField id="age" label="Age" value={p.age} onChange={(v) => set("age", v)} unit="yrs" min={18} max={120} step={1} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sex">Sex</Label>
          <div className={showErrors && !p.sex ? "ring-1 ring-destructive rounded-lg" : ""}>
            <AdaptiveSelect
              id="sex"
              value={p.sex}
              onValueChange={(v) => set("sex", v)}
              drawerTitle="Sex"
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "unspecified", label: "Unspecified" }
              ]}
            />
          </div>
          {p.sex === "unspecified" && (
            <Why>We average the Mifflin-St Jeor constants; targets stay slightly less precise.</Why>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Height</Label>
        {metric ? (
          <Input
            type="number"
            inputMode="decimal"
            min={92}
            max={274}
            value={cmDisplay}
            onChange={(e) =>
              set(
                "height_in",
                e.target.value === "" ? "" : String(cmToStoredInches(e.target.value))
              )
            }
            className={showErrors && !inRange(p.height_in, 36, 108) ? "ring-1 ring-destructive border-destructive" : ""}
          />
        ) : (
          <div className="flex gap-2">
            <AdaptiveSelect
              value={String(ft)}
              onValueChange={(v) => set("height_in", String(feetInchesToStored(v, inch)))}
              drawerTitle="Height in feet"
              options={[4, 5, 6, 7].map((f) => ({ value: String(f), label: `${f} ft` }))}
            />
            <AdaptiveSelect
              value={String(inch)}
              onValueChange={(v) => set("height_in", String(feetInchesToStored(ft, v)))}
              drawerTitle="Additional inches"
              options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: `${i} in` }))}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={showErrors && !inRange(p.current_weight_lbs, 40, 1200) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField
            id="cw"
            label="Current weight"
            value={weightDisplay(p.current_weight_lbs)}
            onChange={(v) => weightChange(v, "current_weight_lbs")}
            unit={metric ? "kg" : "lb"}
            min={metric ? 18 : 40}
            max={metric ? 544 : 1200}
          />
        </div>
        <div className={showErrors && p.goal_weight_lbs && !inRange(p.goal_weight_lbs, 40, 1200) ? "ring-1 ring-destructive rounded-lg" : ""}>
          <NumField
            id="gw"
            label="Goal weight"
            value={weightDisplay(p.goal_weight_lbs)}
            onChange={(v) => weightChange(v, "goal_weight_lbs")}
            unit={metric ? "kg" : "lb"}
            min={metric ? 18 : 40}
            max={metric ? 544 : 1200}
            hint="Optional"
          />
        </div>
      </div>

      <div className={showErrors && p.waist_in && !inRange(p.waist_in, 10, 150) ? "ring-1 ring-destructive rounded-lg" : ""}>
        <NumField
          id="waist"
          label="Baseline waist"
          value={
            metric
              ? p.waist_in
                ? +(inToCm(Number(p.waist_in)).toFixed(1))
                : ""
              : p.waist_in ?? ""
          }
          onChange={(v) =>
            set("waist_in", v === "" ? "" : metric ? String(+(cmToIn(Number(v)).toFixed(1))) : v)
          }
          unit={metric ? "cm" : "in"}
          min={metric ? 25 : 10}
          max={metric ? 381 : 150}
          hint="Optional — seeds your trend"
        />
      </div>

      <div className="pt-2 border-t border-lineSoft">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">Activity</p>
        <div className="space-y-4">
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
        </div>
      </div>
    </div>
  );
}
