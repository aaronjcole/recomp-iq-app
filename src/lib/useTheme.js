import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "recomp-theme";
const THEME_EVENT = "recomp-theme-change";
const VALID_PREFERENCES = new Set(["system", "light", "dark"]);

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

export function useTheme() {
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
    const syncPreference = (event) => {
      if (VALID_PREFERENCES.has(event.detail)) setPreference(event.detail);
    };
    const syncStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      setPreference(VALID_PREFERENCES.has(event.newValue) ? event.newValue : "system");
    };
    window.addEventListener(THEME_EVENT, syncPreference);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, syncPreference);
      window.removeEventListener("storage", syncStorage);
    };
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
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: nextPreference }));
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [setTheme, theme]
  );

  return { theme, preference, toggle, setTheme };
}
