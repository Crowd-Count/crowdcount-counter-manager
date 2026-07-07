"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "crowdcount_theme";

// Inert subscription: within this tab the stored theme only changes through
// toggleTheme below, which updates React state directly.
const emptySubscribe = () => () => {};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // localStorage as an external store: server snapshot null (SSR paints the
  // "dark" default), client snapshot reads the persisted choice right after
  // hydration — same net behavior as the previous load-on-mount effect.
  const storedTheme = useSyncExternalStore(
    emptySubscribe,
    () => localStorage.getItem(STORAGE_KEY) as Theme | null,
    () => null
  );
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  // In-session override once the user toggles; wins over the stored value.
  const [override, setOverride] = useState<Theme | null>(null);
  const theme: Theme =
    override ?? (storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark");

  // Apply theme to document
  useEffect(() => {
    if (mounted) {
      const root = document.documentElement;
      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setOverride(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
