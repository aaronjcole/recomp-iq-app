import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo
} from "react";
import { useSearchParams } from "react-router-dom";
import { todayStr, sanitizeDateParam } from "@/lib/loggingDateUtils";

const LoggingDateCtx = createContext(null);

/**
 * Provides a shared, URL-aware selected date for historical logging.
 * The date is stored in the `?date=YYYY-MM-DD` query param so it survives
 * page reloads and can be shared between the Today and Nutrition tabs.
 */
export function LoggingDateProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDate = searchParams.get("date");
  const [selectedDate, setSelectedDate] = useState(() => sanitizeDateParam(urlDate));

  // Sync internal state when the URL changes (back/forward navigation, external
  // link, etc.). We intentionally do NOT write back to the URL here — only the
  // user's own date-selection writes to the URL.
  useEffect(() => {
    const sanitized = sanitizeDateParam(urlDate);
    setSelectedDate((current) => (current === sanitized ? current : sanitized));
  }, [urlDate]);

  const setDate = useCallback(
    (date) => {
      const sanitized = sanitizeDateParam(date);
      setSelectedDate(sanitized);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (sanitized === todayStr()) {
            next.delete("date");
          } else {
            next.set("date", sanitized);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const isToday = selectedDate === todayStr();

  const value = useMemo(
    () => ({ selectedDate, setSelectedDate: setDate, isToday }),
    [selectedDate, setDate, isToday]
  );

  return <LoggingDateCtx.Provider value={value}>{children}</LoggingDateCtx.Provider>;
}

export function useLoggingDate() {
  const ctx = useContext(LoggingDateCtx);
  if (!ctx) throw new Error("useLoggingDate must be used within LoggingDateProvider");
  return ctx;
}