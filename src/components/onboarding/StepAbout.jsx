import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { NumField, StepHeader, Why } from "./Fields";

const kgToLbs = (kg) => kg / 0.45359237;
const lbsToKg = (lbs) => lbs * 0.45359237;
const cmToIn = (cm) => cm / 2.54;
const inToCm = (inches) => inches * 2.54;

export default function StepAbout({ p, set, units, setUnits }) {
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
            className={`px-3 py-1 text-xs font-medium rounded-md capitalize ${
              units === u ? "bg-teal text-buttonText" : "text-muted-foreground"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumField id="age" label="Age" value={p.age} onChange={(v) => set("age", v)} unit="yrs" />
        <div className="space-y-1.5">
          <Label htmlFor="sex">Sex</Label>
          <Select value={p.sex} onValueChange={(v) => set("sex", v)}>
            <SelectTrigger id="sex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unspecified">Unspecified</SelectItem>
            </SelectContent>
          </Select>
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
            value={cmDisplay}
            onChange={(e) =>
              set("height_in", e.target.value === "" ? "" : String(Math.round(cmToIn(Number(e.target.value)))))
            }
          />
        ) : (
          <div className="flex gap-2">
            <Select value={String(ft)} onValueChange={(v) => set("height_in", String(Number(v) * 12 + inch))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 5, 6, 7].map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f} ft
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(inch)} onValueChange={(v) => set("height_in", String(ft * 12 + Number(v)))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {i} in
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumField
          id="cw"
          label="Current weight"
          value={weightDisplay(p.current_weight_lbs)}
          onChange={(v) => weightChange(v, "current_weight_lbs")}
          unit={metric ? "kg" : "lb"}
        />
        <NumField
          id="gw"
          label="Goal weight"
          value={weightDisplay(p.goal_weight_lbs)}
          onChange={(v) => weightChange(v, "goal_weight_lbs")}
          unit={metric ? "kg" : "lb"}
          hint="Optional"
        />
      </div>

      <div className="space-y-1.5">
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
          hint="Optional — seeds your trend"
        />
        <Why>
          A starting waist measurement gives the Recomp Signal a baseline to judge
          fat loss vs. scale noise. Skip if you&apos;d rather log it later.
        </Why>
      </div>
    </div>
  );
}