import { useState, useEffect, useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { useLocation } from "react-router-dom";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import StreakBanner from "@/components/today/StreakBanner";
import TodayMacroCard from "@/components/today/TodayMacroCard";
import TodayProgressCard from "@/components/today/TodayProgressCard";
import TodayChecklist from "@/components/today/TodayChecklist";
import ThisWeekCard from "@/components/today/ThisWeekCard";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import PullToRefresh from "@/components/common/PullToRefresh";
import LoggingDatePicker from "@/components/LoggingDatePicker";
import { deriveBestMove, summarizeSleep } from "@/lib/fitness";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { todayStr } from "@/lib/loggingDateUtils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { preferences, signal, strategy, trend, quests, logs, reload } = useRecomp();
  const { selectedDate, isToday } = useLoggingDate();
  const [logOpen, setLogOpen] = useState(false);
  const { state } = useLocation();

  useEffect(() => {
    if (!state?.scrollTo) return;
    const el = document.getElementById(state.scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state?.scrollTo]);

  const selectedLog = useMemo(
    () => logs.find((l) => l.date === selectedDate) ?? null,
    [logs, selectedDate]
  );
  const sleepReferenceDate = isToday ? todayStr() : selectedDate;
  const sleepSummary = useMemo(
    () => summarizeSleep(logs, { referenceDate: sleepReferenceDate }),
    [logs, sleepReferenceDate]
  );

  if (!strategy) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 rounded-2xl bg-panel2" />
      <div className="h-48 rounded-2xl bg-panel2" />
      <div className="h-28 rounded-2xl bg-panel2" />
      <div className="h-28 rounded-2xl bg-panel2" />
      <div className="h-20 rounded-2xl bg-panel2" />
      <div className="h-32 rounded-2xl bg-panel2" />
    </div>
  );

  const bestMove = deriveBestMove({ preferences, signal, strategy, todayLog: selectedLog, trend });

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-h1 font-bold tracking-tight">{isToday ? "Today" : "Log"}</h1>
        </div>

        <LoggingDatePicker />

        <StreakBanner />

        <RecompSignalHero move={bestMove} onLog={() => setLogOpen(true)} />

        <TodayMacroCard
          calorieTarget={strategy.calorie_target}
          calories={selectedLog?.calories ?? 0}
          protein={selectedLog?.protein_g ?? 0}
          carbs={selectedLog?.carbs_g ?? 0}
          fat={selectedLog?.fat_g ?? 0}
          onLog={() => setLogOpen(true)}
        />

        <TodayProgressCard />

        <TodayChecklist
          todayLog={selectedLog}
          date={selectedDate}
          sleepSummary={sleepSummary}
          onLog={() => setLogOpen(true)}
          expand={state?.scrollTo === "habits-section"}
        />

        <ThisWeekCard quests={quests} />

        <QuickLogSheet open={logOpen} onOpenChange={setLogOpen} date={selectedDate} />
      </div>
    </PullToRefresh>
  );
}