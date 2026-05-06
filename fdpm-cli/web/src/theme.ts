import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "fdpm-theme";

function readDom(): Theme {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private mode, disk full) — runtime swap still works for the session.
  }
}

/**
 * Read + control the active theme. The initial value is whatever the inline
 * bootstrap script in index.html applied to `<html>`, so SSR/CSR agree and
 * there is no flash. The hook is a thin wrapper around a DOM attribute write.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(readDom);

  useEffect(() => {
    // Track external mutations (e.g. devtools, other tabs).
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setThemeState(e.newValue);
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
  };

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
