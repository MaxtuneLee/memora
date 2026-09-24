import { Outlet, useLocation, useNavigate } from "react-router";
import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import SearchPalette from "@/components/search/SearchPalette";
import ToastStack from "@/components/ToastStack";
import SettingsDialog from "@/components/settings/SettingsDialog";
import { LocalModelDevtoolsPanel } from "@/components/devtools/LocalModelDevtoolsPanel";
import {
  SearchPaletteContextProvider,
  type SearchPaletteContextValue,
} from "@/hooks/search/useSearchPalette";
import { SettingsDialogContextProvider } from "@/hooks/settings/useSettingsDialog";
import { getOnboardingGateStatus } from "@/lib/onboarding/onboardingGate";
import { startAppLogCollection } from "@/lib/appLog/appLogCollector";
import type { SettingsSectionId } from "@/types/settings";
import { useAppStore } from "@/livestore/store";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { useDocumentTheme } from "@/hooks/theme/useDocumentTheme";
import { appShellStyles } from "@/styles/stylex.stylex";
import * as stylex from "@stylexjs/stylex";

import { useAgentToolHost } from "@/hooks/chat/useAgentToolHost";

export default function AppLayout() {
  useAgentToolHost();
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  useDocumentTheme(settings.theme ?? "system");
  useEffect(() => {
    if (!settings.logCollectionEnabled) return;
    return startAppLogCollection(store);
  }, [settings.logCollectionEnabled, store]);
  const location = useLocation();
  const navigate = useNavigate();
  const [onboardingGateReady, setOnboardingGateReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  // Captured once per visit to /onboarding, not kept in sync afterward: finishing
  // onboarding flips onboardingComplete mid-flow (e.g. after the profile step),
  // but the wizard still has bonus steps to show before it navigates home itself.
  // Only a visit that was ALREADY complete on arrival (e.g. a stale bookmark)
  // should be bounced immediately.
  const onboardingCompleteOnEntryRef = useRef<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const lastSearchTriggerRef = useRef<HTMLElement | null>(null);
  const isOnboardingRoute = location.pathname.startsWith("/onboarding");

  const openSettings = useCallback((section: SettingsSectionId) => {
    setIsSearchOpen(false);
    setActiveSection(section);
    setIsSettingsOpen(true);
  }, []);

  const canOpenSearch = useCallback(() => {
    if (isOnboardingRoute) {
      return false;
    }

    if (typeof document === "undefined") {
      return true;
    }

    const openDialog = document.querySelector("[role='dialog']");
    if (!openDialog) {
      return true;
    }

    return isSettingsOpen;
  }, [isOnboardingRoute, isSettingsOpen]);

  const closeSearch = useCallback((options?: { restoreFocus?: boolean }) => {
    setIsSearchOpen(false);
    if (options?.restoreFocus === false) {
      return;
    }

    const nextFocusTarget = lastSearchTriggerRef.current;
    if (!nextFocusTarget) {
      return;
    }

    window.setTimeout(() => {
      nextFocusTarget.focus();
    }, 0);
  }, []);

  const openSearch = useCallback(
    (trigger?: HTMLElement | null) => {
      if (!canOpenSearch()) {
        return;
      }

      if (trigger) {
        lastSearchTriggerRef.current = trigger;
      } else if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        lastSearchTriggerRef.current = document.activeElement;
      }

      if (isSettingsOpen) {
        setIsSettingsOpen(false);
      }
      setIsSearchOpen(true);
    },
    [canOpenSearch, isSettingsOpen],
  );

  const toggleSearch = useCallback(
    (trigger?: HTMLElement | null) => {
      if (isSearchOpen) {
        closeSearch();
        return;
      }

      openSearch(trigger);
    },
    [closeSearch, isSearchOpen, openSearch],
  );

  const settingsValue = useMemo(
    () => ({
      isSettingsOpen,
      activeSection,
      setActiveSection,
      openSettings,
      setIsSettingsOpen,
    }),
    [activeSection, isSettingsOpen, openSettings],
  );

  const searchValue = useMemo<SearchPaletteContextValue>(
    () => ({
      isSearchOpen,
      openSearch,
      closeSearch,
      toggleSearch,
    }),
    [closeSearch, isSearchOpen, openSearch, toggleSearch],
  );

  useEffect(() => {
    let cancelled = false;

    const checkOnboardingGate = async () => {
      const status = await getOnboardingGateStatus(settings.onboardingCompleted);
      if (cancelled) {
        return;
      }

      setOnboardingComplete(status.ready);
      setOnboardingGateReady(true);
    };

    void checkOnboardingGate();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, settings.onboardingCompleted]);

  useEffect(() => {
    if (!isOnboardingRoute) {
      onboardingCompleteOnEntryRef.current = null;
      return;
    }
    if (onboardingGateReady && onboardingCompleteOnEntryRef.current === null) {
      onboardingCompleteOnEntryRef.current = onboardingComplete;
    }
  }, [isOnboardingRoute, onboardingComplete, onboardingGateReady]);

  useEffect(() => {
    if (!onboardingGateReady) {
      return;
    }

    if (!onboardingComplete && !isOnboardingRoute) {
      void navigate("/onboarding", { replace: true });
      return;
    }

    if (isOnboardingRoute && onboardingCompleteOnEntryRef.current === true) {
      void navigate("/", { replace: true });
    }
  }, [isOnboardingRoute, navigate, onboardingComplete, onboardingGateReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key.toLocaleLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      toggleSearch(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleSearch]);

  return (
    <Toast.Provider limit={3}>
      <SettingsDialogContextProvider value={settingsValue}>
        <SearchPaletteContextProvider value={searchValue}>
          {!onboardingGateReady ? (
            <div {...stylex.props(appShellStyles.loading)}>Preparing your workspace...</div>
          ) : isOnboardingRoute ? (
            <Outlet />
          ) : (
            <div {...stylex.props(appShellStyles.shell)}>
              <Sidebar />
              <main {...stylex.props(appShellStyles.content)}>
                <div {...stylex.props(appShellStyles.scrollArea)}>
                  <Outlet />
                </div>
              </main>
            </div>
          )}
          {!isOnboardingRoute && <SearchPalette />}
          <SettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
          {import.meta.env.DEV && <LocalModelDevtoolsPanel currentPath={location.pathname} />}
          <ToastStack />
        </SearchPaletteContextProvider>
      </SettingsDialogContextProvider>
    </Toast.Provider>
  );
}
