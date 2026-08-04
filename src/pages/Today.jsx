import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Link } from "react-router-dom";
import ProgressRing from "@/components/common/ProgressRing";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import HabitsCard from "@/components/today/HabitsCard";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import BestMoveCard from "@/components/today/BestMoveCard";
import PullToRefresh from "@/components/common/PullToRefresh";
import { deriveBestMove } from "@/lib/fitness";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Check, ChevronRight, Bot } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { preferences, signal, strategy, trend, quests, todayLog, reload } = useRecomp();
  const [logOpen, setLogOpen] = useState(false);

  if (!strategy) return null;

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

      <HabitsCard />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-medium">This week's quests</h2>
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
              <h2 className="text-sm font-medium">Ask your AI coach</h2>
              <div className="text-xs text-muted-foreground">Specific guidance from your data</div>
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
