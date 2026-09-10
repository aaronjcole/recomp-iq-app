import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import {
  addDaysStr,
  formatLongDate,
  todayStr
} from "@/lib/loggingDateUtils";

/**
 * A compact date selector for historical logging. Shows the selected date
 * with prev/next buttons and a "jump to today" link. Next-day and the today
 * jump are disabled when already on today (no future dates allowed).
 * All tap targets are at least 44x44px.
 */
export default function LoggingDatePicker() {
  const { selectedDate, setSelectedDate, isToday } = useLoggingDate();

  return (
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
  );
}