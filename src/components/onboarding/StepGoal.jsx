import { GOAL_LABELS } from "@/lib/fitness";
import { GOAL_ORDER } from "./constants";
import { StepHeader } from "./Fields";

export default function StepGoal({ p, set, showErrors }) {
  return (
    <div className="space-y-4">
      <StepHeader
        title="What's your main goal?"
        why="Sets your calorie direction. Refinable as data arrives."
      />
      <fieldset className="space-y-2">
        <legend className="sr-only">Goal</legend>
        {GOAL_ORDER.map((g) => {
          const selected = p.goal === g;
          return (
            <label
              key={g}
              className={`block w-full text-left rounded-xl border p-4 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal cursor-pointer ${
                selected ? "border-teal bg-teal/10" : "border-line bg-panel"
              }`}
            >
              <input
                type="radio"
                name="goal"
                className="peer sr-only"
                checked={selected}
                onChange={() => set("goal", g)}
              />
              <div className="font-medium">{GOAL_LABELS[g].label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {GOAL_LABELS[g].blurb}
              </div>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}