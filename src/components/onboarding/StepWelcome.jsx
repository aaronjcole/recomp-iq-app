import { Target, TrendingUp, Shield } from "lucide-react";
import { StepHeader } from "./Fields";

export default function StepWelcome() {
  return (
    <div className="space-y-4">
      <StepHeader
        title="Welcome to RecompIQ"
        why="An adaptive recomposition companion — not a crash diet."
      />
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          RecompIQ builds your plan from{" "}
          <span className="text-foreground font-medium">your own data</span> —
          weight trend, waist, steps, training, and adherence — then adjusts it
          weekly.
        </p>
        <p>
          During recomposition the scale can stay flat while you&apos;re still
          progressing. We track the signals that actually move, so you&apos;re
          not misled by daily noise.
        </p>
        <ul className="space-y-2 pt-1">
          <li className="flex gap-2">
            <TrendingUp className="w-4 h-4 text-teal shrink-0 mt-0.5" />
            <span>The weekly review decides the next step — not a single weigh-in.</span>
          </li>
          <li className="flex gap-2">
            <Shield className="w-4 h-4 text-teal shrink-0 mt-0.5" />
            <span>Safety flags soften aggressive goals and prompt professional guidance.</span>
          </li>
          <li className="flex gap-2">
            <Target className="w-4 h-4 text-teal shrink-0 mt-0.5" />
            <span>Your targets are an estimate that sharpens as logs come in.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}