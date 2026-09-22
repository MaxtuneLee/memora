import * as stylex from "@stylexjs/stylex";

import type { setting } from "@/livestore/setting";
import { darkTheme, lightTheme } from "@/styles/stylex.stylex";

export type ThemePreference = setting["theme"];
export type ResolvedTheme = "light" | "dark";

// Read by the first-frame script in index.html; keep the key and colors in sync with it.
export const THEME_MIRROR_KEY = "memora-theme";
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#fcfaf6",
  dark: "#1b1a17",
};

const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

const THEME_CLASS_NAMES: Record<ResolvedTheme, string[]> = {
  light: (stylex.props(lightTheme).className ?? "").split(" ").filter(Boolean),
  dark: (stylex.props(darkTheme).className ?? "").split(" ").filter(Boolean),
};

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return systemDark ? "dark" : "light";
  }
  return preference;
}

export function isSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(SYSTEM_DARK_QUERY).matches === true;
}

export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function applyDocumentTheme(theme: ResolvedTheme, root = document.documentElement): void {
  const other: ResolvedTheme = theme === "dark" ? "light" : "dark";
  // Remove first: both theme class lists share the var group class.
  root.classList.remove(...THEME_CLASS_NAMES[other]);
  root.classList.add(...THEME_CLASS_NAMES[theme]);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.ownerDocument
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

export function writeThemeMirror(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the next start falls back to the system theme.
  }
}
