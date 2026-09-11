import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { addDaysStr, formatShortDate, todayStr } from "@/lib/loggingDateUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import BrandMark from "@/components/BrandMark";
import StreakChip from "@/components/today/StreakChip";

/**
 * Sticky top bar for the Today screen. Mobile shows brand mark + date stepper
 * + streak chip; desktop shows streak chip + date stepper + profile icon. The
 * date stepper is a compact prev/next control bound to the shared logging date.
 */
export default function TodayTopBar() {
  const { selectedDate, setSelectedDate, isToday } = useLoggingDate();
  const isMobile = useIsMobile();

  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 -mx-1 flex items-center gap-2 rounded-2xl border border-line bg-panel/80 px-2 py-1.5 backdrop-blur lg:static lg:top-auto">
      {isMobile ? (
        <Link to="/today" aria-label="RecompOne home" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
          <BrandMark className="h-7 w-7" />
        </Link>
      ) : (
        <div className="shrink-0">
          <StreakChip />
        </div>
      )}

      <div className="flex flex-1 items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setSelectedDate(addDaysStr(selectedDate, -1))}
          aria-label="Previous day"
          className="flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">
            {isToday ? "Today" : formatShortDate(selectedDate)}
          </p>
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr())}
              className="mt-0.5 inline-flex min-h-[28px] items-center text-xs font-medium text-teal hover:underline"
            >
              Jump to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelectedDate(addDaysStr(selectedDate, 1))}
          disabled={isToday}
          aria-label="Next day"
          className="flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isMobile ? (
        <div className="shrink-0">
          <StreakChip />
        </div>
      ) : (
        <Link
          to="/more/profile"
          aria-label="Profile"
          className="flex h-11 min-h-11 w-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-line bg-panel2 text-foreground hover:bg-panel3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <User className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}