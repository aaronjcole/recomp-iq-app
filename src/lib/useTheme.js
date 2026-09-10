import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "recomp-theme";
const VALID_PREFERENCES = new Set(["system", "light", "dark"]);
const ThemeContext = createContext(null);

function initialPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (VALID_PREFERENCES.has(stored)) return stored;
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
  return "system";
}

function initialSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** @param {{ children: import("react").ReactNode }} props */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(initialPreference);
  const [systemTheme, setSystemTheme] = useState(initialSystemTheme);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", syncSystemTheme);
    syncSystemTheme();
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    const syncStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      setPreference(VALID_PREFERENCES.has(event.newValue) ? event.newValue : "system");
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((nextPreference) => {
    if (!VALID_PREFERENCES.has(nextPreference)) return;
    try {
      localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      // Keep the in-memory preference working when storage is unavailable.
    }
    setPreference(nextPreference);
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [setTheme, theme]
  );

  const value = useMemo(
    () => ({ theme, preference, toggle, setTheme }),
    [preference, setTheme, theme, toggle]
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
