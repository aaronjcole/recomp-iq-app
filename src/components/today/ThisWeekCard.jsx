import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import PremiumBadge from "@/components/premium/PremiumBadge";

export default function ThisWeekCard({ quests }) {
  const [open, setOpen] = useState(false);
  const remaining = quests.filter((quest) => !quest.complete).length;

  return (
    <section aria-labelledby="this-week-heading">
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card className="overflow-hidden border-line bg-panel">
          <CardContent className="p-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-h-16 w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`${open ? "Hide" : "Show"} this week`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <span id="this-week-heading" role="heading" aria-level={2} className="block font-medium">This week</span>
                  <span className="block text-xs text-muted-foreground">
                    Weekly Autopilot · {remaining ? `${remaining} quest${remaining === 1 ? "" : "s"} remaining` : "quests complete"}
                  </span>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-3 border-t border-lineSoft p-3">
                <Link to="/today/autopilot" className="flex min-h-14 items-center gap-3 rounded-xl border border-teal/30 bg-teal/5 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium">Weekly Autopilot</h3>
                      <PremiumBadge />
                    </div>
                    <p className="text-xs text-muted-foreground">Five weekly signals distilled into one next move</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>

                <div className="rounded-xl border border-line bg-panel p-3">
                  <h3 className="mb-2 text-sm font-medium">This week&apos;s quests</h3>
                  {quests.length === 0 && (
                    <p className="text-sm text-muted-foreground">No quests this week—check back after your next check-in.</p>
                  )}
                  {quests.map((quest) => (
                    <div key={quest.id} className="flex min-h-11 items-center gap-3 border-b border-lineSoft last:border-0">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${quest.complete ? "bg-teal" : "border border-line bg-panel2"}`}>
                        {quest.complete && <Check className="h-3 w-3 text-buttonText" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1 py-2">
                        <div className={`text-sm ${quest.complete ? "text-muted-foreground line-through" : ""}`}>{quest.title}</div>
                        <div className="text-xs text-muted-foreground">{quest.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </section>
  );
}
