import { Target } from "lucide-react";

export default function AppSplash() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg text-foreground">
      <div className="relative flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-teal flex items-center justify-center">
          <Target className="w-8 h-8 text-buttonText" />
        </div>
        <div className="absolute w-16 h-16 rounded-2xl border-2 border-teal/40 animate-ping" />
      </div>
      <div className="mt-5 font-semibold text-lg tracking-tight">RecompIQ</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">adaptive recomposition</div>
    </div>
  );
}