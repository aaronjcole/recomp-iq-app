import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Moon, Plus } from "lucide-react";

function hours(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}h` : "—";
}

function signedHours(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}h`;
}

function guidance(summary) {
  if (summary.loggedNights === 0) {
    return "Log a few nights to reveal how sleep is lining up with your recovery.";
  }
  if (summary.loggedNights < 3) {
    return "Keep logging—three nights will make the first trend more useful.";
  }
  if (summary.averageHours < summary.referenceHours) {
    return "Recent sleep is below the adult reference. Keep today flexible and protect tonight’s wind-down.";
  }
  if (summary.shortNights >= 3) {
    return "Your average is holding, but several short nights may still make recovery feel uneven.";
  }
  return "Recent sleep supports your current recovery rhythm. Consistency is the next win.";
}

export default function SleepCard({ todayLog, summary, onLog }) {
  const lastNightHours = todayLog?.sleep_hours;
  const hasLastNight = typeof lastNightHours === "number" && Number.isFinite(lastNightHours);
  const lastNightQuality = todayLog?.sleep_quality;
  const hasLastNightQuality = typeof lastNightQuality === "number" && Number.isFinite(lastNightQuality);

  return (
    <section aria-labelledby="sleep-recovery-heading">
      <Card className="border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
                <Moon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="sleep-recovery-heading" className="font-medium">Sleep &amp; recovery</h2>
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                    Included
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">A clear trend from the nights you log</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLog} aria-label="Log sleep">
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              {hasLastNight ? "Update" : "Log"}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2" aria-label="Sleep summary">
            <Metric
              value={hasLastNight ? hours(lastNightHours) : "—"}
              label="Last night"
              detail={hasLastNightQuality ? `${lastNightQuality}/5 quality` : "Quality unlogged"}
            />
            <Metric
              value={hours(summary.averageHours)}
              label={`${summary.windowDays}-night avg`}
              detail={`${summary.loggedNights} logged`}
            />
            <Metric
              value={signedHours(summary.balanceHours)}
              label="Sleep balance"
              detail={`vs ${summary.referenceHours}h reference`}
            />
          </div>

          <p className="text-sm text-muted-foreground">{guidance(summary)}</p>
          <p className="text-xs text-muted-foreground">
            Balance totals logged nights only against a general adult reference. It is not a medical or circadian estimate.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ value, label, detail }) {
  return (
    <div className="min-w-0 rounded-xl border border-lineSoft bg-panel2/50 px-3 py-2.5">
      <p className="font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}
