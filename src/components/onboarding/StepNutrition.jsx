import { Label } from "@/components/ui/label";
import { SelectField, StepHeader, Why, ChipGroup } from "./Fields";
import { DIET_STYLES, PREFERRED_TRAINING, DISLIKED_STRATEGIES, KNOWN_BARRIERS } from "./constants";

export default function StepNutrition({ pref, setPref, showErrors }) {
  const toggle = (key) => (v) =>
    setPref(key, pref[key].includes(v) ? pref[key].filter((x) => x !== v) : [...pref[key], v]);

  return (
    <div className="space-y-4">
      <StepHeader
        title="Nutrition & lifestyle"
        why="Personalizes meal suggestions and the coach's framing — not the calorie math."
      />
      <div className={showErrors && !pref.diet_style ? "ring-1 ring-destructive rounded-lg" : ""}>
        <SelectField
          id="diet"
          label="Diet style"
          value={pref.diet_style}
          onChange={(v) => setPref("diet_style", v)}
          options={DIET_STYLES.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <SelectField
        id="train"
        label="Preferred training"
        value={pref.preferred_training}
        onChange={(v) => setPref("preferred_training", v)}
        options={PREFERRED_TRAINING.map((s) => ({ value: s, label: s }))}
      />
      <div className="space-y-1.5">
        <Label>Strategies you dislike</Label>
        <ChipGroup
          name="Disliked strategies"
          options={DISLIKED_STRATEGIES}
          selected={pref.disliked_strategies}
          onToggle={toggle("disliked_strategies")}
        />
        <Why>The coach avoids recommending these and picks alternatives that fit you.</Why>
      </div>
      <div className="space-y-1.5">
        <Label>Known barriers</Label>
        <ChipGroup
          name="Known barriers"
          options={KNOWN_BARRIERS}
          selected={pref.known_barriers}
          onToggle={toggle("known_barriers")}
        />
        <Why>Barriers shape behavior focus and how aggressive the weekly nudges get.</Why>
      </div>
    </div>
  );
}