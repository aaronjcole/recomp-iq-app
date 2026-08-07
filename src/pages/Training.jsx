import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useRecompActions, useRecompRef } from "@/lib/RecompContext";
import StrengthProgressionCard from "@/components/training/StrengthProgressionCard";
import SessionBuilder from "@/components/training/SessionBuilder";
import SessionHistory from "@/components/training/SessionHistory";
import ActiveBlockCard from "@/components/training/ActiveBlockCard";
import PullToRefresh from "@/components/common/PullToRefresh";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, CalendarRange } from "lucide-react";

export default function Training() {
  const { reload } = useRecompActions();
  const { activeBlock } = useRecompRef();
  const location = useLocation();

  // Pull plan-session prefill out of navigation state once per navigation
  const [prefill, setPrefill] = useState(null);
  const prefillKey = useRef(0);
  useEffect(() => {
    if (location.state?.planSession) {
      prefillKey.current += 1;
      setPrefill(location.state.planSession);
      // Clear the state so a back-nav doesn't re-trigger it
      window.history.replaceState({ ...window.history.state, usr: undefined }, "");
    }
  }, [location.state?.planSession]);

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Training</h1>

        {activeBlock ? (
          <ActiveBlockCard block={activeBlock} />
        ) : (
          <Card className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <CalendarRange className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">Adaptive training block</h2>
                    <PremiumBadge />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Build a 4–6 week progression from your schedule, recent sessions, and tracked lifts.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/training/plan">Open training planner <ArrowRight aria-hidden="true" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <StrengthProgressionCard />
        <SessionBuilder key={prefillKey.current} prefill={prefill} />
        <SessionHistory />
      </div>
    </PullToRefresh>
  );
}
