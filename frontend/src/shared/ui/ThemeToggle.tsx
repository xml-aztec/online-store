"use client";

import { Moon, Sun } from "lucide-react";

import { useThemeStore } from "@/entities/theme/store";

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <span className="flex shrink-0 rounded-full bg-surface p-0.5">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Светлая тема"
        aria-pressed={theme === "light"}
        className={`flex h-[22px] w-[26px] items-center justify-center rounded-full ${
          theme === "light" ? "bg-bg shadow-sm" : ""
        }`}
      >
        <Sun
          className={`h-3 w-3 ${theme === "light" ? "text-ink" : "text-ink-muted"}`}
          aria-hidden="true"
          strokeWidth={2.2}
        />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Тёмная тема"
        aria-pressed={theme === "dark"}
        className={`flex h-[22px] w-[26px] items-center justify-center rounded-full ${
          theme === "dark" ? "bg-surface shadow-sm" : ""
        }`}
      >
        <Moon
          className={`h-3 w-3 ${theme === "dark" ? "text-ink" : "text-ink-muted"}`}
          aria-hidden="true"
          strokeWidth={2.2}
        />
      </button>
    </span>
  );
}
