import { createContext } from "react";

// Context objects live in their own module so that hot-updating
// RecompContext.jsx (the provider + logic) does NOT recreate them.
// Recreating the contexts during HMR breaks the provider/consumer link
// ("useRecomp must be used within RecompProvider") because the old
// provider instance still holds the previous context identity while
// consumers read the new, un-provided one.

// Live/derived data: logs, todayLog, and everything computed from logs.
export const Ctx = createContext(null);
// Stable reference data that a daily-log write does not touch.
export const RefCtx = createContext(null);
// Stable actions (never re-render on state changes).
export const ActionsCtx = createContext(null);
// Habits domain (habits + habitEntries) — highest-churn daily interaction.
export const HabitsCtx = createContext(null);