import { useState, useEffect, useCallback } from "react";

function initialTheme() {
  try {
    const stored = localStorage.getItem("recomp-theme");
    if (stored === "light") return "light";
  } catch (e) {}
  return "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("recomp-theme", theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle, setTheme };
}