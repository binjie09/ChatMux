import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "chatmux-theme";
const DEFAULT_THEME: Theme = "dark";

function readStoredTheme(): Theme {
  return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : DEFAULT_THEME;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f1e9" : "#0e1612");
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
