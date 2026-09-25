import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { applyDocumentTheme, type ResolvedTheme } from "@web/lib/theme/documentTheme";

// The site's theme: the visitor's explicit choice, remembered; otherwise the system setting.
// Uses the app's own theme classes so embedded components switch with the page.
const KEY = "memora-site-theme";
const DARK = "(prefers-color-scheme: dark)";

const stored = (): ResolvedTheme | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
};

export const initialTheme = (): ResolvedTheme =>
  stored() ?? (matchMedia(DARK).matches ? "dark" : "light");

export function useTheme(): [ResolvedTheme, () => void] {
  const [theme, setTheme] = useState<ResolvedTheme>(initialTheme);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  // Follow the system until the visitor picks a theme themselves.
  useEffect(() => {
    const query = matchMedia(DARK);
    const onChange = () => {
      if (!stored()) setTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: ResolvedTheme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just won't be remembered.
    }
    const apply = () => flushSync(() => setTheme(next));
    // Cross-fade between themes where the browser supports it.
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }, [theme]);

  return [theme, toggle];
}
