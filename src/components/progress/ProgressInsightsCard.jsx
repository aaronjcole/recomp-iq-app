import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { useRecomp } from "@/lib/RecompContext";
import { buildProgressInsights } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// What the data shows (observed), how each measure reads against the goal,
// whether those agree, and the likely explanation, labelled as inferred.
// Directions are written out, never shown by color alone.

const MEASURES = [
  ["weight", "Weight"],
  ["waist", "Waist"],
  ["strength", "Strength"],
  ["recovery", "Recovery"],
  ["adherence", "Consistency"]
];

const SIGNAL_TEXT = {
  favorable: "Toward your goal",
  unfavorable: "Against your goal",
  neutral: "Steady"
};

const SIGNAL_DOT = {
  favorable: "bg-green",
  unfavorable: "bg-gold",
  neutral: "bg-teal"
};

function agreementText(insights) {
  if (insights.agreement === "insufficient") return "Not enough body measures yet to compare.";
  const body = MEASURES.slice(0, 3).filter(([key]) => insights.signals[key]);
  if (insights.agreement === "agree") {
    const names = body.map(([, label]) => label.toLowerCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    return `${list.charAt(0).toUpperCase()}${list.slice(1)} point the same way.`;
  }
  const toward = body.filter(([key]) => insights.signals[key] === "favorable").map(([, label]) => label.toLowerCase());
  const against = body.filter(([key]) => insights.signals[key] === "unfavorable").map(([, label]) => label.toLowerCase());
  return `Mixed signals: ${toward.join(" and ")} ${toward.length === 1 ? "is" : "are"} moving toward your goal, ${against.join(" and ")} against it.`;
}

export default function ProgressInsightsCard() {
  const { trend, strengthLogs, profile, strategy, historyLoaded } = useRecomp();
  const goal = profile?.goal ?? strategy?.goal_type;
  const insights = useMemo(
    () => (historyLoaded ? buildProgressInsights({ trend, strengthLogs, goal }) : null),
    [historyLoaded, trend, strengthLogs, goal]
  );

  return (
    <Card className="border-line bg-panel" role="region" aria-labelledby="progress-insights-title">
      <CardContent className="space-y-4 p-5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 id="progress-insights-title" className="font-medium">What your data says</h2>
          </div>
          {insights && <Badge variant="outline" className="capitalize">{insights.confidence} confidence</Badge>}
        </div>

        {!insights ? (
          <p className="text-muted-foreground">Loading your history…</p>
        ) : (
          <>
            {Object.values(insights.signals).some(Boolean) && (
              <section aria-labelledby="insights-signals" className="space-y-1.5">
                <h3 id="insights-signals" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Signals</h3>
                <dl className="space-y-1">
                  {MEASURES.map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3 text-xs">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="flex items-center gap-1.5">
                        {insights.signals[key] && <span className={`h-2 w-2 rounded-full ${SIGNAL_DOT[insights.signals[key]]}`} aria-hidden="true" />}
                        {insights.signals[key] ? SIGNAL_TEXT[insights.signals[key]] : "Not enough data"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs">{agreementText(insights)}</p>
              </section>
            )}

            {insights.observed.length > 0 && (
              <section aria-labelledby="insights-observed" className="space-y-1.5">
                <h3 id="insights-observed" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observed</h3>
                <ul className="space-y-1">
                  {insights.observed.map((fact) => (
                    <li key={fact.measure} className="text-xs">
                      <span className="font-medium">{fact.measure}:</span> <span className="text-muted-foreground">{fact.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {insights.explanation && (
              <section aria-labelledby="insights-explanation" className="space-y-1 rounded-lg bg-panel2 p-3">
                <h3 id="insights-explanation" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Likely explanation <span className="normal-case">(inferred, {insights.confidence} confidence)</span>
                </h3>
                <p>{insights.explanation.text}</p>
                <p className="text-xs text-muted-foreground">{insights.explanation.watch}</p>
              </section>
            )}

            {insights.missing.length > 0 && (
              <section aria-labelledby="insights-missing" className="space-y-1">
                <h3 id="insights-missing" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Not enough data</h3>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {insights.missing.map((item) => (
                    <li key={item.measure}><span className="font-medium text-foreground">{item.measure}:</span> {item.reason}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
