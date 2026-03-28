import { Outlet, useLocation, useNavigate } from "react-router";
import { Toast } from "@base-ui/react/toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import SearchPalette from "@/components/search/SearchPalette";
import SettingsDialog from "@/components/settings/SettingsDialog";
import {
  SearchPaletteContextProvider,
  type SearchPaletteContextValue,
} from "@/hooks/search/useSearchPalette";
import { SettingsDialogContextProvider } from "@/hooks/settings/useSettingsDialog";
import { loadGlobalMemoryData } from "@/lib/settings/personalityStorage";
import type { SettingsSectionId } from "@/types/settings";

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [onboardingGateReady, setOnboardingGateReady] = useState(false);
  const [hasPersonality, setHasPersonality] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const lastSearchTriggerRef = useRef<HTMLElement | null>(null);
  const isOnboardingRoute = location.pathname.startsWith("/onboarding");
  const isChatRoute = location.pathname.startsWith("/chat");

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
      const memory = await loadGlobalMemoryData();
      const personality = memory?.personality?.trim() ?? "";
      if (cancelled) {
        return;
      }

      setHasPersonality(!!personality);
      setOnboardingGateReady(true);
    };

    void checkOnboardingGate();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!onboardingGateReady) {
      return;
    }

    if (!hasPersonality && isChatRoute) {
      navigate("/onboarding", { replace: true });
      return;
    }

    if (hasPersonality && isOnboardingRoute) {
      navigate("/chat", { replace: true });
    }
  }, [hasPersonality, isChatRoute, isOnboardingRoute, navigate, onboardingGateReady]);

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
            <div className="flex h-dvh w-full items-center justify-center bg-memora-bg text-sm text-memora-muted">
              Preparing your workspace...
            </div>
          ) : isOnboardingRoute ? (
            <Outlet />
          ) : (
            <div className="flex h-dvh w-full overflow-hidden bg-memora-bg text-memora-text font-sans selection:bg-[#879a4f] selection:text-zinc-950">
              <Sidebar />
              <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200">
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
        </SearchPaletteContextProvider>
      </SettingsDialogContextProvider>
    </Toast.Provider>
  );
}
