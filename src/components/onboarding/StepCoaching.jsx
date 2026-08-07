import { Label } from "@/components/ui/label";
import { SelectField, StepHeader } from "./Fields";
import { COACH_TONES } from "@/lib/fitness";
import { SAFETY_FLAGS, toneLabel } from "./constants";
import { Check, AlertTriangle } from "lucide-react";

export default function StepCoaching({ pref, setPref, showErrors }) {
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
        title="Coaching & safety"
        why="Tone and safety shape how the coach talks and how aggressive targets get."
      />
      <div className={showErrors && !pref.tone ? "ring-1 ring-destructive rounded-lg" : ""}>
        <SelectField
          id="tone"
          label="Coach tone"
          value={pref.tone}
          onChange={(v) => setPref("tone", v)}
          options={COACH_TONES.map((t) => ({ value: t, label: toneLabel(t) }))}
        />
      </div>

      <div className="space-y-2">
        <Label>Safety flags (optional)</Label>
        {SAFETY_FLAGS.map((f) => {
          const on = pref.safety_flags.includes(f.id);
          return (
            <label
              key={f.id}
              className="flex items-center gap-3 rounded-lg bg-panel border border-line p-3 cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-teal"
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
