import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { NumField, StepHeader, Why } from "./Fields";

function inRange(v, min, max) {
  if (v === "" || v == null) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
}

const kgToLbs = (kg) => kg / 0.45359237;
const lbsToKg = (lbs) => lbs * 0.45359237;
const cmToIn = (cm) => cm / 2.54;
const inToCm = (inches) => inches * 2.54;

export default function StepAbout({ p, set, units, setUnits, showErrors }) {
  const metric = units === "metric";

  const weightDisplay = (stored) => {
    if (stored === "" || stored == null) return "";
    return metric ? +(lbsToKg(Number(stored)).toFixed(1)) : stored;
  };
  const weightChange = (v, key) => {
    if (v === "") return set(key, "");
    set(key, metric ? +(kgToLbs(Number(v)).toFixed(1)) : v);
  };

  const ft = p.height_in ? Math.floor(Number(p.height_in) / 12) : 5;
  const inch = p.height_in ? Math.round(Number(p.height_in) % 12) : 8;
  const cmDisplay = p.height_in ? Math.round(inToCm(Number(p.height_in))) : "";

  return (
    <div className="space-y-4">
      <StepHeader
        title="About you"
        why="Drives your calorie and macro estimate. Stored in lb/in internally."
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
              set("height_in", e.target.value === "" ? "" : String(Math.round(cmToIn(Number(e.target.value)))))
            }
            className={showErrors && !inRange(p.height_in, 36, 108) ? "ring-1 ring-destructive border-destructive" : ""}
          />
        ) : (
          <div className="flex gap-2">
            <AdaptiveSelect
              value={String(ft)}
              onValueChange={(v) => set("height_in", String(Number(v) * 12 + inch))}
              drawerTitle="Height in feet"
              options={[4, 5, 6, 7].map((f) => ({ value: String(f), label: `${f} ft` }))}
            />
            <AdaptiveSelect
              value={String(inch)}
              onValueChange={(v) => set("height_in", String(ft * 12 + Number(v)))}
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
        {/* Optional, but an out-of-range value still blocks the step, so it
            needs a ring too — otherwise Continue refuses with nothing marked. */}
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

      <div className="space-y-1.5">
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
        <Why>
          A starting waist measurement gives the Recomp Signal a baseline to judge
          fat loss vs. scale noise. Skip if you&apos;d rather log it later.
        </Why>
      </div>
    </div>
  );
}
