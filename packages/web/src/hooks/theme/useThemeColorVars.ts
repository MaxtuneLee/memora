import { useEffect, useState } from "react";

import { useResolvedTheme } from "./useResolvedTheme";

// Resolves StyleX tokens (each a `var(--name)` string) to the active theme's computed colors, so
// canvas and Chart.js drawing code can use semantic colors and redraw when the theme changes.
// Pass a stable (module-level) object: it is used as an effect dependency, not diffed by value.
export function useThemeColorVars<const Colors extends Record<string, string>>(
  colors: Colors,
): Record<keyof Colors, string> {
  const resolvedTheme = useResolvedTheme();
  const [resolved, setResolved] = useState(() => resolveThemeColors(colors));

  useEffect(() => {
    setResolved(resolveThemeColors(colors));
  }, [resolvedTheme, colors]);

  return resolved;
}

export function resolveThemeColors<const Colors extends Record<string, string>>(
  colors: Colors,
): Record<keyof Colors, string> {
  const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const result = {} as Record<keyof Colors, string>;
  for (const key of Object.keys(colors) as (keyof Colors)[]) {
    const name = colors[key].match(/^var\((--[^),]+)/)?.[1];
    result[key] = (name && style?.getPropertyValue(name).trim()) || "";
  }
  return result;
}
