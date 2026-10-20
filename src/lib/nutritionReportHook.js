import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useRecomp } from "@/lib/RecompContext";
import { fetchNutritionReportData } from "./nutritionReportData.js";

export function useNutritionReportData(endDate, days) {
  const { user } = useAuth();
  const { logs, foodLogEntries, loading, historyLoaded } = useRecomp();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: false, requestKey: "" });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const ownerId = user?.id;
  const requestKey = `${ownerId}:${endDate}:${days}`;

  useEffect(() => {
    if (!ownerId) return;
    const onChange = (event) => {
      if (event?.data?.created_by_id && event.data.created_by_id !== ownerId) return;
      refresh(); // Deletes may contain only an id; re-query within owner scope.
    };
    const cleanups = [];
    for (const entity of [base44.entities.DailyLog, base44.entities.FoodLogEntry]) {
      try {
        cleanups.push(entity.subscribe(onChange));
      } catch {
        // Local context changes, focus, and explicit refresh remain available
        // if realtime is unavailable. Never substitute cached global history.
      }
    }
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cleanups.forEach((unsubscribe) => { if (typeof unsubscribe === "function") unsubscribe(); });
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ownerId, refresh]);

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: false, requestKey });
    // Coalesce optimistic + persisted local edits and subscription bursts.
    const timer = setTimeout(async () => {
      if (!ownerId) {
        if (!cancelled) setState({ data: null, loading: false, error: true, requestKey });
        return;
      }
      try {
        const data = await fetchNutritionReportData(base44.entities, { ownerId, endDate, days });
        if (!cancelled) setState({ data, loading: false, error: false, requestKey });
      } catch {
        if (!cancelled) setState({ data: null, loading: false, error: true, requestKey });
      }
    }, 80);
    return () => { cancelled = true; clearTimeout(timer); };
    // These arrays are invalidation signals ONLY, never report data. They also
    // change on reload, including edits/deletes outside the global history cap.
  }, [ownerId, endDate, days, requestKey, revision, logs, foodLogEntries, loading, historyLoaded]);

  // A new date/owner/range must never briefly display the previous request's
  // rows under a new heading before the effect clears its state.
  return state.data && state.requestKey !== requestKey
    ? { data: null, loading: true, error: false, refresh }
    : { ...state, refresh };
}
