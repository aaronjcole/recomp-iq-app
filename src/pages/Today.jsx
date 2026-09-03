import { useState, useEffect } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Link, useLocation } from "react-router-dom";
import TodayMacroCard from "@/components/today/TodayMacroCard";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import HabitsCard from "@/components/today/HabitsCard";
import QuickMealsCard from "@/components/today/QuickMealsCard";
import TodayProgressCard from "@/components/today/TodayProgressCard";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import StreakBanner from "@/components/today/StreakBanner";
import PullToRefresh from "@/components/common/PullToRefresh";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { deriveBestMove } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronRight, Bot, Sparkles } from "lucide-react";

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

  const bestMove = deriveBestMove({ preferences, signal, strategy, todayLog, trend });
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-3xl font-bold tracking-tight">Today</h1>
          <p className="text-xs text-muted-foreground">{dateStr}</p>
        </div>
        <StreakBanner compact />
      </div>

      {/* One actionable hero: signal, reasoning, and today's best move. */}
      <RecompSignalHero move={bestMove} onLog={() => setLogOpen(true)} />

      <TodayMacroCard
        calorieTarget={strategy.calorie_target}
        protein={todayLog?.protein_g ?? 0}
        carbs={todayLog?.carbs_g ?? 0}
        fat={todayLog?.fat_g ?? 0}
        onLog={() => setLogOpen(true)}
      />

      <QuickMealsCard />

      <TodayProgressCard />

      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground px-1 pt-2">This week</p>

      <Link to="/today/autopilot" className="block">
        <Card className="border-teal/30 bg-gradient-to-br from-teal/15 to-teal/5">
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
        <Card className="bg-panel border-line">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
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
