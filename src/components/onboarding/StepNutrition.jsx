import { Label } from "@/components/ui/label";
import { SelectField, StepHeader, Why, ChipGroup } from "./Fields";
import { DIET_STYLES, PREFERRED_TRAINING, DISLIKED_STRATEGIES, KNOWN_BARRIERS, SAFETY_FLAGS } from "./constants";
import { Check, AlertTriangle } from "lucide-react";

export default function StepNutrition({ pref, setPref, showErrors }) {
  const toggle = (key) => (v) =>
    setPref(key, pref[key].includes(v) ? pref[key].filter((x) => x !== v) : [...pref[key], v]);

  const toggleSafety = (id) =>
    setPref(
      "safety_flags",
      pref.safety_flags.includes(id)
        ? pref.safety_flags.filter((x) => x !== id)
        : [...pref.safety_flags, id]
    );

  return (
    <div className="space-y-4">
      <StepHeader
        title="Preferences"
        why="Shapes your meal suggestions and how the weekly plan adjusts — not the calorie math."
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
        <Why>Avoids these when suggesting meals and workout approaches.</Why>
      </div>
      <div className="space-y-1.5">
        <Label>Known barriers</Label>
        <ChipGroup
          name="Known barriers"
          options={KNOWN_BARRIERS}
          selected={pref.known_barriers}
          onToggle={toggle("known_barriers")}
        />
        <Why>Barriers shape how the adaptive engine adjusts your plan each week.</Why>
      </div>

      <div className="pt-2 border-t border-lineSoft space-y-2">
        <Label>Health considerations <span className="text-muted-foreground font-normal">(optional)</span></Label>
        {SAFETY_FLAGS.map((f) => {
          const on = pref.safety_flags.includes(f.id);
          return (
            <label
              key={f.id}
              className="flex items-center gap-3 rounded-lg bg-panel border border-line p-3 cursor-pointer"
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={on}
                onChange={() => toggleSafety(f.id)}
              />
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  on ? "bg-teal border-teal" : "border-line bg-panel"
                }`}
              >
                {on && <Check className="w-3 h-3 text-buttonText" />}
              </span>
              <span className="text-sm">{f.label}</span>
            </label>
          );
        })}
        {pref.safety_flags.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-questComplete text-gold p-3 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Any aggressive goal will be softened, and we&apos;ll recommend checking with
              a qualified professional before pushing hard.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}