import { Target, Flame, Dumbbell, Footprints, CheckCircle2, Sparkles } from "lucide-react";

export default function DeviceMockup() {
  return (
    <div className="relative mx-auto w-[260px] rounded-[2.2rem] border-[6px] border-foreground/15 bg-panel p-3 shadow-2xl">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full bg-foreground/15" />
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Tuesday</div>
            <div className="text-sm font-semibold">Today</div>
          </div>
          <div className="h-8 w-8 rounded-full bg-teal/15 flex items-center justify-center">
            <Target className="w-4 h-4 text-teal" />
          </div>
        </div>

        <div className="rounded-xl border border-lineSoft bg-bg p-3 flex items-center gap-3">
          <div className="relative w-12 h-12">
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--panel2)" strokeWidth="4" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--teal)" strokeWidth="4" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="22" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-bold text-teal">76</div>
          </div>
          <div className="flex-1">
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Recomp signal</div>
            <div className="text-xs font-medium">Lean tissue trend ↗</div>
          </div>
        </div>

        <div className="rounded-xl border border-lineSoft bg-bg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-orange" />
            <div className="flex-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
              <div className="h-full bg-orange rounded-full" style={{ width: "68%" }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums">1684/2450</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-teal" />
            <div className="flex-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
              <div className="h-full bg-teal rounded-full" style={{ width: "82%" }} />
            </div>
            <span className="font-mono text-[9px] tabular-nums">164/200g</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {["Hit 8k steps", "Train Push", "Sleep 7h"].map((q) => (
            <span key={q} className="inline-flex items-center gap-1 rounded-full bg-teal/10 text-teal px-2 py-1 text-[9px] font-medium">
              <CheckCircle2 className="w-3 h-3" /> {q}
            </span>
          ))}
        </div>

        <div className="rounded-xl border border-lineSoft bg-bg p-3 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-teal mt-0.5 shrink-0" />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Protein is on track — you're primed for the session. Keep carbs steady.
          </p>
        </div>

        <div className="flex justify-between pt-1 border-t border-lineSoft">
          {[Target, Flame, Dumbbell, Footprints].map((Ico, i) => (
            <Ico key={i} className={`w-4 h-4 ${i === 0 ? "text-teal" : "text-muted-foreground"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}