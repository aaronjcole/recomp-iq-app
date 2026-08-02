import { Activity, CheckCircle2, ChevronDown, ShieldCheck, Target } from "lucide-react";

const EVIDENCE = [
  { label: "Weight trend", value: "−0.4 lb/wk" },
  { label: "Waist trend", value: "Down" },
  { label: "Adherence", value: "87%" }
];

export default function DeviceMockup() {
  return (
    <div
      className="relative mx-auto w-[280px] rounded-[2.35rem] border-[6px] border-foreground/15 bg-panel p-3 shadow-2xl"
      aria-label="Illustrative RecompOne recommendation showing one best move and its supporting evidence"
    >
      <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-foreground/15" />

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Tuesday</div>
            <div className="text-sm font-semibold">Today</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/15">
            <Target className="h-4 w-4 text-teal" aria-hidden="true" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-teal/40 bg-gradient-to-br from-teal/15 via-bg to-bg">
          <div className="space-y-3 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-teal">
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                Best move
              </span>
              <span className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 font-mono text-xs text-teal">
                Strong signal
              </span>
            </div>

            <div>
              <div className="text-base font-bold leading-tight">Hold targets steady</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Recent progress and adherence support staying the course today.
              </p>
            </div>

            <div className="rounded-xl bg-teal px-3 py-2 text-center text-xs font-semibold text-buttonText">
              Continue today&apos;s plan
            </div>
          </div>

          <div className="border-t border-lineSoft bg-panel/70 px-3.5 py-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              Why this move
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="mt-2.5 space-y-1.5">
              {EVIDENCE.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex items-start gap-1.5 border-t border-lineSoft pt-2.5 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" aria-hidden="true" />
              <span>More cardio was not chosen; the current trend is on pace.</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-lineSoft bg-bg p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Illustrative data. Recommendations use recent patterns, not one noisy day.
          </p>
        </div>

        <div className="flex justify-between border-t border-lineSoft pt-2">
          {[Target, Activity, CheckCircle2].map((Icon, index) => (
            <Icon
              key={index}
              className={`h-4 w-4 ${index === 0 ? "text-teal" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
