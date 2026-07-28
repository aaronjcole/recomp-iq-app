import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  analyzeTrends,
  calculateSignalStrength,
  buildWeeklyQuests,
  getBossBattle,
  explainRecompSignal,
  getRecompLevel,
  recalculateTargets,
  runWeeklyCheckIn,
  estimateOneRepMax
} from "@/lib/fitness";

const Ctx = createContext(null);
export const useRecomp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRecomp must be used within RecompProvider");
  return c;
};

export function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function pct(v) {
  return v === null || v === undefined ? "—" : Math.round(v * 100) + "%";
}

function buildSummary(trend, adj) {
  const w = trend.avg_weight_current_7_day ?? "—";
  const change = trend.weight_change_lbs !== null ? ` (${trend.weight_change_lbs > 0 ? "+" : ""}${trend.weight_change_lbs} lb vs last week)` : "";
  return [
    `7-day avg weight: ${w} lb${change}.`,
    `Adherence — calories ${pct(trend.calorie_adherence)}, protein ${pct(trend.protein_adherence)}, steps ${pct(trend.step_adherence)}, workouts ${pct(trend.workout_adherence)}.`,
    `Recommendation: ${adj.decision.replace(/_/g, " ")} — ${adj.reason}`
  ].join(" ");
}

export function RecompProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [strengthLogs, setStrengthLogs] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [foods, setFoods] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [decisionLedger, setDecisionLedger] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        base44.entities.UserProfile.list("-created_date", 1),
        base44.entities.UserPreferences.list("-created_date", 1),
        base44.entities.CurrentStrategy.list("-created_date", 1),
        base44.entities.DailyLog.list("date", 500),
        base44.entities.ExerciseSession.list("-date", 200),
        base44.entities.StrengthLog.list("-date", 500),
        base44.entities.WeeklyCheckIn.list("-created_date", 100),
        base44.entities.FoodItem.list("-created_date", 200),
        base44.entities.Recipe.list("-created_date", 100),
        base44.entities.DecisionLedger.list("-date", 100)
      ]);
      const v = (i, fallback = []) => (results[i].status === "fulfilled" ? results[i].value : fallback);
      setProfile(v(0)[0] ?? null);
      setPreferences(v(1)[0] ?? null);
      setStrategy(v(2)[0] ?? null);
      setLogs(v(3) ?? []);
      setSessions(v(4) ?? []);
      setStrengthLogs(v(5) ?? []);
      setCheckIns(v(6) ?? []);
      setFoods(v(7) ?? []);
      setRecipes(v(8) ?? []);
      setDecisionLedger(v(9) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const trend = useMemo(() => (strategy ? analyzeTrends(logs, strategy) : null), [logs, strategy]);
  const signal = useMemo(() => (trend ? calculateSignalStrength(trend) : null), [trend]);
  const recompLevel = useMemo(() => (signal ? getRecompLevel(signal.score) : null), [signal]);
  const quests = useMemo(() => (strategy ? buildWeeklyQuests(logs, strategy) : []), [logs, strategy]);
  const boss = useMemo(() => (trend ? getBossBattle(trend) : null), [trend]);
  const recompSignal = useMemo(() => (trend ? explainRecompSignal(trend) : null), [trend]);
  const todayLog = useMemo(() => logs.find((l) => l.date === todayStr()) ?? null, [logs]);
  const onboarded = !!profile;

  const completeOnboarding = useCallback(async (profileData, prefData) => {
    const createdProfile = await base44.entities.UserProfile.create(profileData);
    const createdPrefs = await base44.entities.UserPreferences.create(prefData);
    const strat = recalculateTargets(profileData);
    const createdStrategy = await base44.entities.CurrentStrategy.create({ ...strat, goal_type: profileData.goal });
    setProfile(createdProfile);
    setPreferences(createdPrefs);
    setStrategy(createdStrategy);
  }, []);

  const updateProfile = useCallback(async (id, data) => {
    const updated = await base44.entities.UserProfile.update(id, data);
    setProfile(updated);
    return updated;
  }, []);

  const updatePreferences = useCallback(async (id, data) => {
    const updated = await base44.entities.UserPreferences.update(id, data);
    setPreferences(updated);
    return updated;
  }, []);

  const updateStrategy = useCallback(
    async (id, data, reason) => {
      const prev = strategy
        ? {
            calorie_target: strategy.calorie_target,
            protein_target_g: strategy.protein_target_g,
            fat_target_g: strategy.fat_target_g,
            carb_target_g: strategy.carb_target_g,
            step_target: strategy.step_target
          }
        : {};
      const updated = await base44.entities.CurrentStrategy.update(id, data);
      setStrategy(updated);
      if (reason) {
        await base44.entities.DecisionLedger.create({ date: todayStr(), previous_targets: prev, new_targets: data, reason });
      }
      return updated;
    },
    [strategy]
  );

  const upsertDailyLog = useCallback(
    async (date, fields) => {
      const existing = logs.find((l) => l.date === date);
      if (existing) {
        const updated = await base44.entities.DailyLog.update(existing.id, fields);
        setLogs((prev) => prev.map((l) => (l.id === existing.id ? updated : l)));
        return updated;
      }
      const created = await base44.entities.DailyLog.create({ date, ...fields });
      setLogs((prev) => [...prev, created]);
      return created;
    },
    [logs]
  );

  const addSession = useCallback(async (data) => {
    const created = await base44.entities.ExerciseSession.create(data);
    setSessions((prev) => [created, ...prev]);
    return created;
  }, []);

  const addFood = useCallback(async (data) => {
    const created = await base44.entities.FoodItem.create(data);
    setFoods((prev) => [created, ...prev]);
    return created;
  }, []);

  const addStrengthLog = useCallback(async (data) => {
    const created = await base44.entities.StrengthLog.create(data);
    setStrengthLogs((prev) => [created, ...prev]);
    return created;
  }, []);

  const runCheckIn = useCallback(async () => {
    if (!profile || !strategy) return null;
    const prefs = preferences ?? { tone: "direct" };
    const { trend: t, adjustment } = runWeeklyCheckIn({ logs, profile, preferences: prefs, strategy });
    const aiSummary = buildSummary(t, adjustment);
    const checkIn = await base44.entities.WeeklyCheckIn.create({
      start_date: daysAgoStr(7),
      end_date: todayStr(),
      avg_weight_current: t.avg_weight_current_7_day,
      avg_weight_previous: t.avg_weight_previous_7_day,
      weight_change: t.weight_change_lbs,
      calorie_adherence: t.calorie_adherence,
      protein_adherence: t.protein_adherence,
      step_adherence: t.step_adherence,
      workout_adherence: t.workout_adherence,
      hunger_average: t.hunger_average,
      energy_average: t.energy_average,
      sleep_average: t.sleep_average,
      recommendation_decision: adjustment.decision,
      ai_summary: aiSummary,
      targets_for_next_week: adjustment.nextStrategy
    });
    const changed =
      adjustment.nextStrategy.calorie_target !== strategy.calorie_target ||
      adjustment.nextStrategy.step_target !== strategy.step_target ||
      adjustment.nextStrategy.behavior_focus !== strategy.behavior_focus;
    if (changed) {
      await updateStrategy(strategy.id, adjustment.nextStrategy, adjustment.reason);
    }
    setCheckIns((prev) => [checkIn, ...prev]);
    return { trend: t, adjustment, checkIn };
  }, [profile, strategy, preferences, logs, updateStrategy]);

  const value = {
    loading,
    profile,
    preferences,
    strategy,
    logs,
    sessions,
    strengthLogs,
    checkIns,
    foods,
    recipes,
    decisionLedger,
    trend,
    signal,
    recompLevel,
    quests,
    boss,
    recompSignal,
    todayLog,
    onboarded,
    reload: loadAll,
    completeOnboarding,
    updateProfile,
    updatePreferences,
    updateStrategy,
    upsertDailyLog,
    addSession,
    addFood,
    addStrengthLog,
    runCheckIn
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function RecompGate() {
  return (
    <RecompProvider>
      <Outlet />
    </RecompProvider>
  );
}

export function RequireOnboarding() {
  const { loading, profile } = useRecomp();
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-4 border-panel2 border-t-teal rounded-full animate-spin" />
      </div>
    );
  }
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}