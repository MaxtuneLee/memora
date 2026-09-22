import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

import {
  applyDocumentTheme,
  isSystemDark,
  resolveTheme,
  subscribeSystemTheme,
  writeThemeMirror,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/documentTheme";

const subscribeNothing = () => () => {};

// Applies the stored preference to the document root. The root is shared by the loading
// state, onboarding, the routed shell, and portals, so they all follow one theme.
export function useDocumentTheme(preference: ThemePreference): ResolvedTheme {
  // Only listen to the operating system while the preference is System.
  const systemDark = useSyncExternalStore(
    preference === "system" ? subscribeSystemTheme : subscribeNothing,
    isSystemDark,
  );
  const theme = resolveTheme(preference, systemDark);

  useLayoutEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  // LiveStore is authoritative; the mirror only serves the next first frame.
  useEffect(() => {
    writeThemeMirror(preference);
  }, [preference]);

  return theme;
}
