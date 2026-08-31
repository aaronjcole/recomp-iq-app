import { ArrowLeft, BrainCircuit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LifestyleCoachComingSoon({ onBack }) {
  return (
    <div className="flex flex-col h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center gap-2 pb-3">
        <button
          onClick={onBack}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold leading-none">Lifestyle Coach</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/15 text-teal">
          <BrainCircuit className="h-8 w-8" aria-hidden="true" />
        </div>
        <div className="space-y-2 max-w-xs">
          <Badge variant="outline" className="border-gold/50 text-gold text-label font-mono uppercase tracking-wide">
            Coming soon
          </Badge>
          <h2 className="text-xl font-bold">Lifestyle Coach</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A deeply personalized coach that learns your schedule, diet, and lifestyle — and adjusts your plan accordingly. We're still putting the finishing touches on it.
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-xs">
          Premium members will get full access the moment it launches.
        </p>
      </div>
    </div>
  );
}