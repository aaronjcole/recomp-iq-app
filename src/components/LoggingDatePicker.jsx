import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { useRecomp } from "@/lib/RecompContext";
import {
  addDaysStr,
  formatLongDate,
  formatWeekdayName,
  getCurrentWeekStart,
  todayStr
} from "@/lib/loggingDateUtils";

/**
 * A compact date selector for historical logging. Shows the selected date
 * with prev/next buttons and a "jump to today" link. Next-day and the today
 * jump are disabled when already on today (no future dates allowed).
 * All tap targets are at least 44x44px.
 */
export default function LoggingDatePicker({ weekStrip = false }) {
  const { selectedDate, setSelectedDate, isToday } = useLoggingDate();
  const { logs, foodLogEntries, sessions, historyLoaded } = useRecomp();
  const today = todayStr();
  const selectedDay = new Date(`${selectedDate}T12:00:00`).getDay();
  const weekStart = addDaysStr(selectedDate, selectedDay === 0 ? -6 : 1 - selectedDay);
  const activityDates = new Set([...logs, ...foodLogEntries.filter((entry) => !entry.pending), ...sessions].map((entry) => entry.date));

  return (
    <div className="space-y-1">
    <div
      className="flex items-center justify-between gap-2 rounded-xl border border-line bg-panel p-2"
      role="group"
      aria-label="Select logging date"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-11 min-h-11 w-11 min-w-11 shrink-0"
        onClick={() => setSelectedDate(addDaysStr(selectedDate, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium truncate">{formatLongDate(selectedDate)}</p>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(todayStr())}
            className="mt-0.5 inline-flex min-h-[44px] items-center text-xs font-medium text-teal hover:underline"
          >
            Jump to today
          </button>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-11 min-h-11 w-11 min-w-11 shrink-0"
        onClick={() => setSelectedDate(addDaysStr(selectedDate, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
    {weekStrip && <div role="group" aria-label="Logging week" className="flex gap-1 overflow-x-auto">
      {Array.from({ length: 7 }, (_, index) => {
        const date = addDaysStr(weekStart, index);
        const future = date > today;
        const hasActivity = activityDates.has(date);
        const known = historyLoaded || date >= getCurrentWeekStart();
        const status = future ? "Future date" : hasActivity ? "Activity logged" : known ? "No loaded activity" : "History loading";
        return <button key={date} type="button" disabled={future} aria-pressed={selectedDate === date} aria-current={date === today ? "date" : undefined} aria-label={`${formatLongDate(date)}. ${status}`} onClick={() => setSelectedDate(date)} className={`flex min-h-11 min-w-11 flex-1 shrink-0 flex-col items-center justify-center rounded-lg border py-1 text-xs disabled:opacity-40 ${selectedDate === date ? "border-teal bg-teal/15 text-teal" : "border-transparent text-muted-foreground hover:bg-panel2"}`}>
          <span className="font-mono text-micro uppercase">{formatWeekdayName(date).slice(0, 1)}</span>
          <span className="font-mono tabular-nums">{Number(date.slice(-2))}</span>
          <span aria-hidden="true" className={`mt-0.5 h-1 w-1 rounded-full ${hasActivity ? "bg-teal" : "bg-transparent"}`} />
        </button>;
      })}
    </div>}
    </div>
  );
}
