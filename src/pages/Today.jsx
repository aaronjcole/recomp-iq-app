import { useState, useEffect } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Link, useLocation } from "react-router-dom";
import ProgressRing from "@/components/common/ProgressRing";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import HabitsCard from "@/components/today/HabitsCard";
import QuickMealsCard from "@/components/today/QuickMealsCard";
import TodayProgressCard from "@/components/today/TodayProgressCard";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import StreakBanner from "@/components/today/StreakBanner";
import BestMoveCard from "@/components/today/BestMoveCard";
import PullToRefresh from "@/components/common/PullToRefresh";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { deriveBestMove } from "@/lib/fitness";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Check, ChevronRight, Bot, Sparkles } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { preferences, signal, strategy, trend, quests, todayLog, reload } = useRecomp();
  const [logOpen, setLogOpen] = useState(false);
  const { state } = useLocation();
  useEffect(() => {
    if (!state?.scrollTo) return;
    const el = document.getElementById(state.scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state?.scrollTo]);

  if (!strategy) return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-1">
        <div className="h-4 w-32 rounded bg-panel2" />
        <div className="h-7 w-20 rounded bg-panel2" />
      </div>
      <div className="h-48 rounded-xl bg-panel2" />
      <div className="h-20 rounded-xl bg-panel2" />
      <div className="h-28 rounded-xl bg-panel2" />
      <div className="h-16 rounded-xl bg-panel2" />
      <div className="h-32 rounded-xl bg-panel2" />
      <div className="h-32 rounded-xl bg-panel2" />
    </div>
  );

  const consumedCalories = todayLog?.calories ?? 0;
  const remaining = Math.max(0, strategy.calorie_target - consumedCalories);
  const bestMove = deriveBestMove({ preferences, signal, strategy, todayLog, trend });

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h1 className="text-2xl font-bold">Today</h1>
      </div>

      {/* Daily target streak — nutrition + steps hit consecutively. */}
      <StreakBanner />

      {/* The recomposition signal is the single hero. */}
      <RecompSignalHero />

      {/* Best move: one action strip beneath the signal, not a competing hero. */}
      <BestMoveCard move={bestMove} onLog={() => setLogOpen(true)} compact />

      {/* Daily loop: one canonical logging entry point (QuickLogSheet). */}
      <Card className="bg-panel border-line">
        <CardContent className="p-5 flex items-center gap-5">
          <ProgressRing
            value={consumedCalories}
            max={strategy.calorie_target}
            label={String(Math.round(consumedCalories))}
            sublabel={`of ${strategy.calorie_target}`}
            ariaLabel={`Calories: ${Math.round(consumedCalories)} of ${strategy.calorie_target}`}
          />
          <div className="flex-1 space-y-1">
            <h2 className="text-xs text-muted-foreground">Calories</h2>
            <div className="text-xl font-bold">{remaining} left</div>
            <Button size="sm" className="mt-2 bg-teal text-buttonText hover:opacity-90" onClick={() => setLogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Log today
            </Button>
          </div>
        </CardContent>
      </Card>

      <QuickMealsCard />

      <TodayProgressCard />

      <Link to="/today/autopilot" className="block">
        <Card className="border-teal/30 bg-teal/10">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium">Weekly Autopilot</h2>
                <PremiumBadge />
              </div>
              <p className="text-xs text-muted-foreground">Five weekly signals distilled into one next move</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </CardContent>
        </Card>
      </Link>

      <div id="habits-section"><HabitsCard /></div>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-medium">This week's quests</h2>
          {quests.length === 0 && (
            <p className="text-sm text-muted-foreground">No quests this week — check back after your next check-in.</p>
          )}
          {quests.map((q) => (
            <div key={q.id} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${q.complete ? "bg-teal" : "bg-panel2 border border-line"}`}>
                {q.complete && <Check className="w-3 h-3 text-buttonText" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm ${q.complete ? "text-muted-foreground line-through" : ""}`}>{q.title}</div>
                <div className="text-xs text-muted-foreground">{q.detail}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Link to="/more/coach">
        <Card className="bg-teal/10 border-teal/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Bot className="w-5 h-5 text-teal" />
            <div className="flex-1">
              <h2 className="text-sm font-medium">Get personalized guidance</h2>
              <div className="text-xs text-muted-foreground">Advice drawn from your actual data</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <QuickLogSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
    </PullToRefresh>
  );
}