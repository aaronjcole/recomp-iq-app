import { useState, useEffect, useMemo } from "react";
import { todayStr, useRecomp } from "@/lib/RecompContext";
import { useLocation } from "react-router-dom";
import TodayMacroCard from "@/components/today/TodayMacroCard";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import TodayProgressCard from "@/components/today/TodayProgressCard";
import TodayChecklist from "@/components/today/TodayChecklist";
import ThisWeekCard from "@/components/today/ThisWeekCard";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import StreakBanner from "@/components/today/StreakBanner";
import PullToRefresh from "@/components/common/PullToRefresh";
import { deriveBestMove, summarizeSleep } from "@/lib/fitness";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { preferences, signal, strategy, trend, quests, logs, todayLog, reload } = useRecomp();
  const [logOpen, setLogOpen] = useState(false);
  const { state } = useLocation();
  useEffect(() => {
    if (!state?.scrollTo) return;
    const el = document.getElementById(state.scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state?.scrollTo]);
  const sleepReferenceDate = todayStr();
  const sleepSummary = useMemo(
    () => summarizeSleep(logs, { referenceDate: sleepReferenceDate }),
    [logs, sleepReferenceDate]
  );

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
        calories={todayLog?.calories ?? 0}
        protein={todayLog?.protein_g ?? 0}
        carbs={todayLog?.carbs_g ?? 0}
        fat={todayLog?.fat_g ?? 0}
        onLog={() => setLogOpen(true)}
      />

      <TodayChecklist
        todayLog={todayLog}
        sleepSummary={sleepSummary}
        onLog={() => setLogOpen(true)}
        expand={state?.scrollTo === "habits-section"}
      />

      <ThisWeekCard quests={quests} />

      <TodayProgressCard />

      <QuickLogSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
    </PullToRefresh>
  );
}
