import { useSyncExternalStore } from "react";

import type { ResolvedTheme } from "@/lib/theme/documentTheme";

export const readRootTheme = (): ResolvedTheme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const subscribeRootTheme = (onChange: () => void): (() => void) => {
  const MutationObserverCtor = document.defaultView?.MutationObserver;
  if (!MutationObserverCtor) {
    return () => {};
  }
  const observer = new MutationObserverCtor(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

// The resolved theme useDocumentTheme applied to the document root. Reading the root instead of
// the settings keeps widget hosts in step with the app without threading the preference down.
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeRootTheme, readRootTheme, () => "light");
}
