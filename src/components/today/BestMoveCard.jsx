import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronDown, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CONFIDENCE_CLASS = {
  "High confidence": "border-teal/40 bg-teal/10 text-teal",
  "Building confidence": "border-gold/40 bg-gold/10 text-gold",
  "Early read": "border-line bg-panel2 text-muted-foreground"
};

export default function BestMoveCard({ move, onLog, embedded = false }) {
  if (!move) return null;

  const action = move.action;
  const actionContent = (
    <>
      {action.label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </>
  );
  const actionClass = `min-h-11 bg-teal text-buttonText hover:opacity-90 ${embedded ? "shrink-0" : "w-full"}`;
  const actionButton =
    action.type === "log" ? (
      <Button type="button" onClick={onLog} className={actionClass}>
        {actionContent}
      </Button>
    ) : (
      <Button asChild className={actionClass}>
        <Link to={action.to}>{actionContent}</Link>
      </Button>
    );

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 font-mono text-label uppercase tracking-wider text-teal">
        <Target className="h-4 w-4" aria-hidden="true" />
        Today&apos;s best move
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-label uppercase tracking-wide ${CONFIDENCE_CLASS[move.confidence.label]}`}>
        {move.confidence.label}
      </span>
    </div>
  );

  const details = (
    <details className="group border-t border-line/80 bg-panel/55">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Why this move
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 px-5 pb-5">
        <div className="space-y-2" aria-label="Evidence used">
          {move.evidence.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="text-right font-medium">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-lineSoft pt-4">
          <div className="font-mono text-label uppercase tracking-wider text-muted-foreground">Why not the alternatives</div>
          {move.alternatives.map((alternative) => (
            <div key={alternative.label} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
              <p><span className="font-medium">{alternative.label}:</span> <span className="text-muted-foreground">{alternative.reason}</span></p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-panel2 p-3 text-sm">
          <div className="mb-1 font-medium">What would change this call</div>
          <p className="text-muted-foreground">{move.whatChanges}</p>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          <span>{move.guardrail}</span>
        </div>
      </div>
    </details>
  );

  if (embedded) {
    return (
      <div className="-mx-5 -mb-5 overflow-hidden border-t border-teal/30 bg-gradient-to-br from-teal/15 via-panel to-panel">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-label uppercase tracking-wider text-teal">
              <Target className="h-4 w-4" aria-hidden="true" />
              Today&apos;s best move
            </div>
            <h3 className="mt-1 text-base font-bold leading-tight">{move.title}</h3>
          </div>
          {actionButton}
        </div>
        {details}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-teal/40 bg-gradient-to-br from-teal/15 via-panel to-panel shadow-sm">
      <CardContent className="p-0">
        <div className="space-y-4 p-5">
          {header}

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold leading-tight">{move.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{move.summary}</p>
          </div>

          {actionButton}
        </div>
        {details}
      </CardContent>
    </Card>
  );
}
