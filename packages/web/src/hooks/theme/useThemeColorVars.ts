import { useEffect, useState } from "react";

import { useResolvedTheme } from "./useResolvedTheme";

// Resolves CSS custom properties from the document root -- the --color-memora-* names the
// StyleX theme classes define (see legacyColorAliases in styles/stylex.stylex.ts) -- so canvas
// and Chart.js drawing code can read the active theme's colors without hard-coding hex values,
// and redraw when the theme changes. Pass a stable (module-level) array of var names: it is used
// as an effect dependency, not diffed by value.
export function useThemeColorVars<const Names extends readonly string[]>(
  varNames: Names,
): Record<Names[number], string> {
  const resolvedTheme = useResolvedTheme();
  const [colors, setColors] = useState<Record<string, string>>(() =>
    resolveThemeColorVars(varNames),
  );

  useEffect(() => {
    setColors(resolveThemeColorVars(varNames));
  }, [resolvedTheme, varNames]);

  return colors as Record<Names[number], string>;
}

function resolveThemeColorVars(varNames: readonly string[]): Record<string, string> {
  if (typeof document === "undefined") {
    return {};
  }
  const style = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const name of varNames) {
    result[name] = style.getPropertyValue(name).trim();
  }
  return result;
}
