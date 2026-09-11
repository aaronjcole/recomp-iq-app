import { useState, useEffect, useMemo } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import TodayTopBar from "@/components/today/TodayTopBar";
import DailySummaryGrid from "@/components/today/DailySummaryGrid";
import TodayChecklist from "@/components/today/TodayChecklist";
import ThisWeekCard from "@/components/today/ThisWeekCard";
import QuickMealsContent from "@/components/today/QuickMealsCard";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import PullToRefresh from "@/components/common/PullToRefresh";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { deriveBestMove, summarizeSleep } from "@/lib/fitness";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { formatLogDayLabel, todayStr } from "@/lib/loggingDateUtils";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { preferences, signal, strategy, trend, quests, logs, reload } = useRecomp();
  const { selectedDate, isToday } = useLoggingDate();
  const isMobile = useIsMobile();
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
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-panel2" />
        <div className="h-28 rounded-2xl bg-panel2" />
        <div className="h-28 rounded-2xl bg-panel2" />
        <div className="h-28 rounded-2xl bg-panel2" />
      </div>
      <div className="h-20 rounded-2xl bg-panel2" />
      <div className="h-32 rounded-2xl bg-panel2" />
    </div>
  );

  const bestMove = deriveBestMove({ preferences, signal, strategy, todayLog: selectedLog, trend });
  const dayLabel = formatLogDayLabel(selectedDate, isToday);

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-5">
        <TodayTopBar />

        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-h1 font-bold tracking-tight">{isToday ? "Today" : "Log"}</h1>
        </div>

        {/* Primary next-move stage: best-move coaching card in panel2 with teal accent ring. */}
        <RecompSignalHero move={bestMove} onLog={() => setLogOpen(true)} />

        {/* Daily fuel & activity summary: 2x2 grid (desktop) / horizontal scroll (mobile). */}
        <DailySummaryGrid log={selectedLog} strategy={strategy} trend={trend} />

        <QuickMealsContent />

        <TodayChecklist
          todayLog={selectedLog}
          date={selectedDate}
          sleepSummary={sleepSummary}
          onLog={() => setLogOpen(true)}
          expand={state?.scrollTo === "habits-section"}
        />

        <ThisWeekCard quests={quests} />

        {/* Quick actions bar (desktop): full-width primary log button. */}
        {!isMobile && (
          <Button
            className="w-full bg-teal text-buttonText hover:opacity-90"
            onClick={() => setLogOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1" /> Log {dayLabel}
          </Button>
        )}

        {/* Primary CTA (mobile): fixed floating action button. */}
        {isMobile && <LogFab onClick={() => setLogOpen(true)} label={dayLabel} />}

        <QuickLogSheet open={logOpen} onOpenChange={setLogOpen} date={selectedDate} />
      </div>
    </PullToRefresh>
  );
}

function LogFab({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Log ${label}`}
      className="fixed bottom-24 right-4 z-40 flex h-14 min-h-14 w-14 items-center justify-center rounded-full bg-teal text-buttonText shadow-lg shadow-teal/30 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-6 w-6" />
    </button>
  );
}