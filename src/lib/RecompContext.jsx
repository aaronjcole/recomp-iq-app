import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
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
const ActionsCtx = createContext(null);

// Stable actions live in their own context so components that only invoke
// actions (never read state) stop re-rendering on unrelated data changes.
export const useRecompActions = () => {
  const c = useContext(ActionsCtx);
  if (!c) throw new Error("useRecompActions must be used within RecompProvider");
  return c;
};

// Backwards-compatible view combining data + actions for existing consumers.
export const useRecomp = () => {
  const data = useContext(Ctx);
  const actions = useContext(ActionsCtx);
  if (!data || !actions) throw new Error("useRecomp must be used within RecompProvider");
  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
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

function newestByKey(items, keyFor) {
  const selected = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const current = selected.get(key);
    const itemStamp = item.updated_date ?? item.created_date ?? "";
    const currentStamp = current?.updated_date ?? current?.created_date ?? "";
    if (!current) {
      selected.set(key, item);
    } else if (itemStamp >= currentStamp) {
      selected.set(key, mergeDefined(current, item));
    } else {
      selected.set(key, mergeDefined(item, current));
    }
  }
  return [...selected.values()];
}

function mergeDefined(previous, next) {
  const merged = { ...(previous ?? {}) };
  for (const [key, value] of Object.entries(next ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function enqueueByKey(queueRef, key, work) {
  const previous = queueRef.current.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  queueRef.current.set(key, next);
  next.then(
    () => {
      if (queueRef.current.get(key) === next) queueRef.current.delete(key);
    },
    () => {
      if (queueRef.current.get(key) === next) queueRef.current.delete(key);
    }
  );
  return next;
}

export function RecompProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
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
  const [mealTemplates, setMealTemplates] = useState([]);
  const [habits, setHabits] = useState([]);
  const [habitEntries, setHabitEntries] = useState([]);

  const profileRef = useRef(profile);
  const preferencesRef = useRef(preferences);
  const strategyRef = useRef(strategy);
  const logsRef = useRef(logs);
  const sessionsRef = useRef(sessions);
  const habitEntriesRef = useRef(habitEntries);
  const dailyQueues = useRef(new Map());
  const habitQueues = useRef(new Map());

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);
  useEffect(() => {
    strategyRef.current = strategy;
  }, [strategy]);
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    habitEntriesRef.current = habitEntries;
  }, [habitEntries]);

  const setLogsCurrent = useCallback((nextOrUpdater) => {
    const next = typeof nextOrUpdater === "function"
      ? nextOrUpdater(logsRef.current)
      : nextOrUpdater;
    logsRef.current = next;
    setLogs(next);
  }, []);

  const setSessionsCurrent = useCallback((nextOrUpdater) => {
    setSessions((previous) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(previous) : nextOrUpdater;
      sessionsRef.current = next;
      return next;
    });
  }, []);

  const setStrengthLogsCurrent = useCallback((nextOrUpdater) => {
    setStrengthLogs((previous) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(previous) : nextOrUpdater;
      return next;
    });
  }, []);

  const setHabitEntriesCurrent = useCallback((nextOrUpdater) => {
    setHabitEntries((previous) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(previous) : nextOrUpdater;
      habitEntriesRef.current = next;
      return next;
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.all([
        base44.entities.UserProfile.list("-created_date", 1),
        base44.entities.UserPreferences.list("-created_date", 1),
        base44.entities.CurrentStrategy.list("-created_date", 1),
        base44.entities.DailyLog.list("-date", 500),
        base44.entities.ExerciseSession.list("-date", 200),
        base44.entities.StrengthLog.list("-date", 500),
        base44.entities.WeeklyCheckIn.list("-created_date", 100),
        base44.entities.FoodItem.list("-created_date", 200),
        base44.entities.Recipe.list("-created_date", 100),
        base44.entities.DecisionLedger.list("-date", 100),
        base44.entities.MealTemplate.list("-created_date", 200),
        base44.entities.Habit.list("-sort_order", 200),
        base44.entities.HabitEntry.list("-date", 500)
      ]);
      const loadedProfile = results[0][0] ?? null;
      const loadedPreferences = results[1][0] ?? null;
      const loadedStrategy = results[2][0] ?? null;
      const loadedLogs = newestByKey(results[3], (item) => item.date).sort((a, b) => b.date.localeCompare(a.date));
      const loadedHabitEntries = newestByKey(results[12], (item) => `${item.habit_id}:${item.date}`);
      profileRef.current = loadedProfile;
      preferencesRef.current = loadedPreferences;
      strategyRef.current = loadedStrategy;
      setProfile(loadedProfile);
      setPreferences(loadedPreferences);
      setStrategy(loadedStrategy);
      setLogsCurrent(loadedLogs);
      setSessionsCurrent(results[4]);
      setStrengthLogsCurrent(results[5]);
      setCheckIns(results[6]);
      setFoods(results[7]);
      setRecipes(results[8]);
      setDecisionLedger(results[9]);
      setMealTemplates(results[10]);
      const habitList = results[11];
      setHabitEntriesCurrent(loadedHabitEntries);
      if (habitList.length > 0) {
        setHabits(habitList);
      } else {
        const seeded = await Promise.all([
          base44.entities.Habit.create({ name: "Water", kind: "count", target_value: 100, unit: "oz", sort_order: 0 }),
          base44.entities.Habit.create({ name: "Read", kind: "check", sort_order: 1 }),
          base44.entities.Habit.create({ name: "Meditate", kind: "check", sort_order: 2 })
        ]);
        setHabits(seeded.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error : new Error("Unable to load your data."));
    } finally {
      setLoading(false);
    }
  }, [setHabitEntriesCurrent, setLogsCurrent, setSessionsCurrent, setStrengthLogsCurrent]);

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
  const onboarded = !!profile && !!preferences && !!strategy;

  const completeOnboarding = useCallback(async (profileData, prefData) => {
    // Each stage is an upsert so retrying after an outage repairs a partial
    // onboarding instead of creating duplicates or trapping the account.
    const existingProfile = profileRef.current;
    const profileResponse = existingProfile?.id
      ? await base44.entities.UserProfile.update(existingProfile.id, profileData)
      : await base44.entities.UserProfile.create(profileData);
    const savedProfile = mergeDefined(existingProfile, profileResponse);
    profileRef.current = savedProfile;
    setProfile(savedProfile);

    const existingPreferences = preferencesRef.current;
    const preferencesResponse = existingPreferences?.id
      ? await base44.entities.UserPreferences.update(existingPreferences.id, prefData)
      : await base44.entities.UserPreferences.create(prefData);
    const savedPreferences = mergeDefined(existingPreferences, preferencesResponse);
    preferencesRef.current = savedPreferences;
    setPreferences(savedPreferences);

    const calculated = recalculateTargets(profileData, prefData);
    const strategyData = { ...calculated, goal_type: profileData.goal };
    const existingStrategy = strategyRef.current;
    const strategyResponse = existingStrategy?.id
      ? await base44.entities.CurrentStrategy.update(existingStrategy.id, strategyData)
      : await base44.entities.CurrentStrategy.create(strategyData);
    const savedStrategy = mergeDefined(existingStrategy, strategyResponse);
    strategyRef.current = savedStrategy;
    setStrategy(savedStrategy);

    return { profile: savedProfile, preferences: savedPreferences, strategy: savedStrategy };
  }, []);

  const updateProfile = useCallback(async (id, data) => {
    const updated = await base44.entities.UserProfile.update(id, data);
    profileRef.current = updated;
    setProfile(updated);
    return updated;
  }, []);

  const updatePreferences = useCallback(async (id, data) => {
    const updated = await base44.entities.UserPreferences.update(id, data);
    preferencesRef.current = updated;
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
      strategyRef.current = updated;
      setStrategy(updated);
      if (reason) {
        try {
          const ledgerEntry = await base44.entities.DecisionLedger.create({
            date: todayStr(),
            previous_targets: prev,
            new_targets: data,
            reason
          });
          setDecisionLedger((current) => [ledgerEntry, ...current]);
        } catch (error) {
          console.warn("Targets updated, but the decision history entry could not be saved.", error);
        }
      }
      return updated;
    },
    [strategy]
  );

  const upsertDailyLog = useCallback(
    (date, fieldsOrUpdater) => {
      const previousLocal = logsRef.current.find((item) => item.date === date) ?? null;
      const fields =
        typeof fieldsOrUpdater === "function"
          ? fieldsOrUpdater(previousLocal)
          : fieldsOrUpdater;
      const optimistic = mergeDefined(previousLocal ?? { date }, fields);

      setLogsCurrent((previous) =>
        [optimistic, ...previous.filter((item) => item.date !== date)].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
      );

      return enqueueByKey(dailyQueues, date, async () => {
        try {
          const local = logsRef.current.find((item) => item.date === date) ?? null;
          const remote = await base44.entities.DailyLog.filter({ date }, "-created_date", 10);
          const existing = newestByKey(
            [...remote, ...(local ? [local] : [])],
            (item) => item.date
          )[0] ?? null;
          const result = await base44.functions.invoke("upsertTrackingRecord", {
            kind: "daily_log",
            date,
            fields
          });
          const response = result?.data?.record;
          if (!response?.id) throw new Error("The daily log update returned no record");
          const current = logsRef.current.find((item) => item.date === date) ?? null;
          const saved = mergeDefined(mergeDefined(existing, response), current);
          setLogsCurrent((previous) =>
            [saved, ...previous.filter((item) => item.id !== saved.id && item.date !== date)].sort((a, b) =>
              b.date.localeCompare(a.date)
            )
          );

          if (fields.weight_lbs != null && profileRef.current?.id) {
            const hasNewerWeight = logsRef.current.some(
              (item) => item.date > date && item.weight_lbs != null
            );
            if (!hasNewerWeight) {
              try {
                const updatedProfile = await base44.entities.UserProfile.update(profileRef.current.id, {
                  current_weight_lbs: fields.weight_lbs
                });
                profileRef.current = updatedProfile;
                setProfile(updatedProfile);
              } catch (error) {
                console.warn("Daily weight saved, but profile weight could not be synchronized.", error);
              }
            }
          }
          return saved;
        } catch (error) {
          setLogsCurrent((previous) => {
            const current = previous.find((item) => item.date === date) ?? null;
            if (!current) return previous;

            const patchIsCurrent = Object.entries(fields).every(([key, value]) =>
              Object.is(current[key], value)
            );
            if (!patchIsCurrent) return previous;
            if (!previousLocal) return previous.filter((item) => item.date !== date);

            const restored = { ...current };
            for (const key of Object.keys(fields)) {
              if (Object.prototype.hasOwnProperty.call(previousLocal, key)) {
                restored[key] = previousLocal[key];
              } else {
                delete restored[key];
              }
            }
            return [restored, ...previous.filter((item) => item.date !== date)].sort((a, b) =>
              b.date.localeCompare(a.date)
            );
          });
          throw error;
        }
      });
    },
    [setLogsCurrent]
  );

  const upsertHabitEntry = useCallback(
    (habitId, date, fieldsOrUpdater) => {
      const key = `${habitId}:${date}`;
      const matches = (item) => item.habit_id === habitId && item.date === date;

      // Optimistically apply the change from the locally-known entry so the
      // habit ring/counter/streak moves on tap instead of freezing until the
      // read + write round-trips return. Mirrors upsertDailyLog. The server
      // function reconciles duplicates; failures roll back below.
      const previousLocal = habitEntriesRef.current.find(matches) ?? null;
      const fields =
        typeof fieldsOrUpdater === "function" ? fieldsOrUpdater(previousLocal) : fieldsOrUpdater;
      const optimistic = mergeDefined(previousLocal ?? { habit_id: habitId, date }, fields);

      setHabitEntriesCurrent((previous) => [
        optimistic,
        ...previous.filter((item) => !matches(item))
      ]);

      return enqueueByKey(habitQueues, key, async () => {
        try {
          const local = habitEntriesRef.current.find(matches) ?? null;
          const remote = await base44.entities.HabitEntry.filter(
            { habit_id: habitId, date },
            "-created_date",
            10
          );
          const existing = newestByKey(
            [...remote, ...(local ? [local] : [])],
            (item) => `${item.habit_id}:${item.date}`
          )[0] ?? null;
          const result = await base44.functions.invoke("upsertTrackingRecord", {
            kind: "habit_entry",
            habit_id: habitId,
            date,
            fields
          });
          const response = result?.data?.record;
          if (!response?.id) throw new Error("The habit update returned no record");
          const current = habitEntriesRef.current.find(matches) ?? null;
          const saved = mergeDefined(mergeDefined(existing, response), current);
          setHabitEntriesCurrent((previous) => [
            saved,
            ...previous.filter((item) => item.id !== saved.id && !matches(item))
          ]);
          return saved;
        } catch (error) {
          // Roll back the optimistic entry only if it is still the current value.
          setHabitEntriesCurrent((previous) => {
            const current = previous.find(matches) ?? null;
            if (!current) return previous;
            const patchIsCurrent = Object.entries(fields).every(([k, v]) =>
              Object.is(current[k], v)
            );
            if (!patchIsCurrent) return previous;
            if (!previousLocal) return previous.filter((item) => !matches(item));
            const restored = { ...current };
            for (const k of Object.keys(fields)) {
              if (Object.prototype.hasOwnProperty.call(previousLocal, k)) {
                restored[k] = previousLocal[k];
              } else {
                delete restored[k];
              }
            }
            return [restored, ...previous.filter((item) => !matches(item))];
          });
          throw error;
        }
      });
    },
    [setHabitEntriesCurrent]
  );

  const addHabit = useCallback(async (data) => {
    const created = await base44.entities.Habit.create(data);
    setHabits((prev) => [...prev, created]);
    return created;
  }, []);

  const updateHabit = useCallback(async (id, data) => {
    const updated = await base44.entities.Habit.update(id, data);
    setHabits((prev) => prev.map((h) => (h.id === id ? updated : h)));
    return updated;
  }, []);

  const archiveHabit = useCallback(async (id) => {
    const updated = await base44.entities.Habit.update(id, { archived: true });
    setHabits((prev) => prev.map((h) => (h.id === id ? updated : h)));
    return updated;
  }, []);

  const addSession = useCallback(async (data) => {
    const created = await base44.entities.ExerciseSession.create(data);
    setSessionsCurrent((prev) => [created, ...prev]);
    return created;
  }, [setSessionsCurrent]);

  const saveTrainingSession = useCallback(
    async ({ session, strengthEntries = [], markDaily = false }) => {
      let createdSession;
      const createdStrengthEntries = [];
      try {
        createdSession = await base44.entities.ExerciseSession.create(session);
        for (const entry of strengthEntries) {
          const created = await base44.entities.StrengthLog.create({
            ...entry,
            session_id: createdSession.id
          });
          createdStrengthEntries.push(created);
        }
        if (markDaily) {
          await upsertDailyLog(session.date, {
            workout_completed: true,
            workout_type: session.type
          });
        }
        setSessionsCurrent((previous) => [createdSession, ...previous]);
        if (createdStrengthEntries.length > 0) {
          setStrengthLogsCurrent((previous) => [...createdStrengthEntries, ...previous]);
        }
        return { session: createdSession, strengthLogs: createdStrengthEntries };
      } catch (error) {
        await Promise.allSettled([
          ...createdStrengthEntries.map((entry) => base44.entities.StrengthLog.delete(entry.id)),
          createdSession?.id
            ? base44.entities.ExerciseSession.delete(createdSession.id)
            : Promise.resolve()
        ]);
        throw error;
      }
    },
    [setSessionsCurrent, setStrengthLogsCurrent, upsertDailyLog]
  );

  const deleteSession = useCallback(async (id) => {
    const session = sessionsRef.current.find((item) => item.id === id);
    try {
      const linked = await base44.entities.StrengthLog.filter({ session_id: id }, "-date", 500);
      // Remove child records first so a partial failure leaves the parent session
      // available for a safe retry instead of creating inaccessible orphans.
      await Promise.all(linked.map((entry) => base44.entities.StrengthLog.delete(entry.id)));
      await base44.entities.ExerciseSession.delete(id);
      setSessionsCurrent((previous) => previous.filter((item) => item.id !== id));
      const linkedIds = new Set(linked.map((entry) => entry.id));
      setStrengthLogsCurrent((previous) => previous.filter((entry) => !linkedIds.has(entry.id)));

      if (session?.date && logsRef.current.some((item) => item.date === session.date)) {
        const remaining = sessionsRef.current.filter(
          (item) => item.id !== id && item.date === session.date
        );
        try {
          await upsertDailyLog(session.date, {
            workout_completed: remaining.length > 0,
            workout_type: remaining[0]?.type
          });
        } catch (error) {
          console.warn("Session deleted, but its daily workout marker could not be synchronized.", error);
        }
      }
    } catch (e) {
      await loadAll();
      throw e;
    }
  }, [loadAll, setSessionsCurrent, setStrengthLogsCurrent, upsertDailyLog]);

  const addFood = useCallback(async (data) => {
    const created = await base44.entities.FoodItem.create(data);
    setFoods((prev) => [created, ...prev]);
    return created;
  }, []);

  const addStrengthLog = useCallback(async (data) => {
    const created = await base44.entities.StrengthLog.create(data);
    setStrengthLogsCurrent((prev) => [created, ...prev]);
    return created;
  }, [setStrengthLogsCurrent]);

  const saveMealTemplate = useCallback(async (data) => {
    const created = await base44.entities.MealTemplate.create(data);
    setMealTemplates((prev) => [created, ...prev]);
    return created;
  }, []);

  const logMealTemplate = useCallback(
    async (template) => {
      await upsertDailyLog(todayStr(), (current) => ({
        calories: (current?.calories ?? 0) + (template.total_calories ?? 0),
        protein_g: (current?.protein_g ?? 0) + (template.total_protein_g ?? 0),
        carbs_g: (current?.carbs_g ?? 0) + (template.total_carbs_g ?? 0),
        fat_g: (current?.fat_g ?? 0) + (template.total_fat_g ?? 0)
      }));
    },
    [upsertDailyLog]
  );

  const addRecipe = useCallback(async (data) => {
    const created = await base44.entities.Recipe.create(data);
    setRecipes((prev) => [created, ...prev]);
    return created;
  }, []);

  const runCheckIn = useCallback(async () => {
    if (!profile || !strategy) return null;
    const prefs = preferences ?? { tone: "direct" };
    const { trend: t, adjustment } = runWeeklyCheckIn({ logs, profile, preferences: prefs, strategy });
    const manual = !!strategy.manual_override;
    const baseSummary = buildSummary(t, adjustment);
    const summary = manual
      ? `${baseSummary} Manual mode is on, so these targets are advisory${
          adjustment.nextStrategy?.calorie_target
            ? ` (we'd suggest ~${adjustment.nextStrategy.calorie_target} kcal)`
            : ""
        } — apply them on the Nutrition page if you'd like.`
      : baseSummary;
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
      ai_summary: summary,
      targets_for_next_week: adjustment.nextStrategy
    });
    const changed =
      adjustment.nextStrategy.calorie_target !== strategy.calorie_target ||
      adjustment.nextStrategy.step_target !== strategy.step_target ||
      adjustment.nextStrategy.behavior_focus !== strategy.behavior_focus;
    if (changed && !manual) {
      await updateStrategy(strategy.id, adjustment.nextStrategy, adjustment.reason);
    }
    setCheckIns((prev) => [checkIn, ...prev]);
    return { trend: t, adjustment, checkIn, manual, advisory: manual ? adjustment.nextStrategy : null };
  }, [profile, strategy, preferences, logs, updateStrategy]);

  // Actions are stable across data changes (they are all useCallback'd), so a
  // component that only calls actions never needs to re-render when state
  // updates. Kept in their own memoized object + context.
  const actionsValue = useMemo(
    () => ({
      reload: loadAll,
      completeOnboarding,
      updateProfile,
      updatePreferences,
      updateStrategy,
      upsertDailyLog,
      upsertHabitEntry,
      addHabit,
      updateHabit,
      archiveHabit,
      addSession,
      saveTrainingSession,
      deleteSession,
      addFood,
      addStrengthLog,
      saveMealTemplate,
      logMealTemplate,
      addRecipe,
      runCheckIn
    }),
    [
      loadAll,
      completeOnboarding,
      updateProfile,
      updatePreferences,
      updateStrategy,
      upsertDailyLog,
      upsertHabitEntry,
      addHabit,
      updateHabit,
      archiveHabit,
      addSession,
      saveTrainingSession,
      deleteSession,
      addFood,
      addStrengthLog,
      saveMealTemplate,
      logMealTemplate,
      addRecipe,
      runCheckIn
    ]
  );

  const dataValue = useMemo(
    () => ({
      loading,
      loadError,
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
      mealTemplates,
      habits,
      habitEntries,
      trend,
      signal,
      recompLevel,
      quests,
      boss,
      recompSignal,
      todayLog,
      onboarded
    }),
    [
      loading,
      loadError,
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
      mealTemplates,
      habits,
      habitEntries,
      trend,
      signal,
      recompLevel,
      quests,
      boss,
      recompSignal,
      todayLog,
      onboarded
    ]
  );

  return (
    <ActionsCtx.Provider value={actionsValue}>
      <Ctx.Provider value={dataValue}>{children}</Ctx.Provider>
    </ActionsCtx.Provider>
  );
}

export function RecompGate() {
  return (
    <RecompProvider>
      <Outlet />
    </RecompProvider>
  );
}

export function RequireOnboarding() {
  const { loading, loadError, onboarded, reload } = useRecomp();
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-4 border-panel2 border-t-teal rounded-full animate-spin" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-bg px-6">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold">We couldn't load your data</h1>
          <p className="text-sm text-muted-foreground">
            Your account has not been changed. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={reload}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-buttonText"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
