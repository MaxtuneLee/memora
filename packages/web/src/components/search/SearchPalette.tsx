import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";
import { useAppStore } from "@/livestore/store";
import { AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { NativeDialog } from "@/components/ui/NativeDialog";
import { useSearchPalette } from "@/hooks/search/useSearchPalette";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import type { GlobalSearchItem, SearchNavigationState } from "@/types/search";
import { SearchResultRow } from "./searchPalette/SearchResultRow";
import { ShortcutHint } from "./searchPalette/ShortcutHint";
import { useSearchResults } from "./searchPalette/useSearchResults";

const styles = stylex.create({
  viewport: {
    alignItems: "flex-start",
    paddingInline: "0.5rem",
    paddingTop: "max(0.5rem, env(safe-area-inset-top))",
    "@media (min-width: 640px)": {
      alignItems: "center",
      paddingInline: "1rem",
      paddingTop: "1rem",
    },
  },
  panel: {
    backgroundColor: "rgb(255 255 253 / 0.98)",
    borderColor: "#ddd8d0",
    borderRadius: 18,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 48px rgb(38 34 29 / 0.12)",
    color: "#09090b",
    overflow: "hidden",
    width: "min(760px, calc(100vw - 1rem))",
    "@media (min-width: 640px)": { width: "min(760px, 92vw)" },
  },
  visuallyHidden: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  searchSection: {
    paddingBottom: "0.75rem",
    paddingInline: "1rem",
    paddingTop: "1rem",
    "@media (min-width: 640px)": {
      paddingBottom: "1rem",
      paddingInline: "1.25rem",
      paddingTop: "1.25rem",
    },
  },
  searchFrame: {
    backgroundColor: "transparent",
    borderColor: "#ebe7e1",
    borderRadius: 14,
    borderStyle: "solid",
    borderWidth: 1,
  },
  searchRow: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    paddingBlock: "0.875rem",
    paddingInline: "1rem",
  },
  searchIconFrame: {
    alignItems: "center",
    color: "#3f3f46",
    display: "flex",
    flexShrink: 0,
    height: "2rem",
    justifyContent: "center",
    width: "2rem",
  },
  searchIcon: { height: "1.25rem", width: "1.25rem" },
  input: {
    backgroundColor: "transparent",
    color: "#27272a",
    flex: 1,
    fontSize: 15,
    minWidth: 0,
    outline: "none",
    "::placeholder": { color: "#a1a1aa" },
  },
  shortcut: {
    alignItems: "center",
    backgroundColor: "#f7f4ef",
    borderColor: "#e5e0d8",
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: 1,
    color: "#71717a",
    display: "none",
    fontSize: 11,
    fontWeight: 500,
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
    "@media (min-width: 640px)": { display: "inline-flex" },
  },
  resultsScroller: {
    maxHeight: "min(72vh, 640px)",
    overflowY: "auto",
    paddingBottom: "1rem",
    paddingInline: "1rem",
    "@media (min-width: 640px)": { paddingInline: "1.25rem" },
  },
  resultList: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: "0.5rem",
    paddingInline: "0.5rem",
  },
  sectionTitle: { color: "#71717a", fontSize: 13, fontWeight: 600 },
  resultCount: { color: "#a1a1aa", fontSize: "0.75rem", lineHeight: "1rem" },
  empty: {
    backgroundColor: "#f6f5f3",
    borderRadius: 14,
    color: "#71717a",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    padding: "1rem",
  },
  resultItems: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  footer: {
    backgroundColor: "#fcfbf8",
    borderTopColor: "#ebe7e1",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
    "@media (min-width: 640px)": { paddingInline: "1.25rem" },
  },
  shortcuts: {
    alignItems: "center",
    columnGap: "1.25rem",
    display: "flex",
    flexWrap: "wrap",
    rowGap: "0.5rem",
  },
});

export default function SearchPalette() {
  const store = useAppStore();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { isSearchOpen, closeSearch } = useSearchPalette();
  const { openSettings } = useSettingsDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const fileRows = store.useQuery(desktopFilesQuery$);
  const folderRows = store.useQuery(desktopFoldersQuery$);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const { displaySections, queryValue, visibleItems } = useSearchResults({
    fileRows,
    folderRows,
    isSearchOpen,
    query,
  });

  useEffect(() => {
    if (!isSearchOpen) {
      setQuery("");
      setActiveIndex(-1);
      return;
    }

    setQuery("");
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    setActiveIndex(visibleItems.length > 0 ? 0 : -1);
  }, [isSearchOpen, queryValue, visibleItems.length]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const activeItem = visibleItems[activeIndex];
    if (!activeItem) return;

    const node = document.getElementById(`search-result-${activeItem.id}`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visibleItems]);

  const handleExecute = (item: GlobalSearchItem) => {
    closeSearch({ restoreFocus: false });

    switch (item.intent.type) {
      case "navigate":
        void navigate(item.intent.to);
        return;
      case "open-settings":
        openSettings(item.intent.section);
        return;
      case "open-chat-session":
        void navigate(`/chat?session=${encodeURIComponent(item.intent.sessionId)}`);
        return;
      case "desktop-intent": {
        const state: SearchNavigationState = {
          searchDesktopIntent: {
            requestId: crypto.randomUUID(),
            intent: item.intent.desktopIntent,
          },
        };
        void navigate(item.intent.to ?? "/", { state });
      }
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (visibleItems.length === 0) return -1;
        return prev >= visibleItems.length - 1 ? 0 : prev + 1;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (visibleItems.length === 0) return -1;
        return prev <= 0 ? visibleItems.length - 1 : prev - 1;
      });
      return;
    }

    if (event.key === "Enter") {
      const activeItem = visibleItems[activeIndex];
      if (!activeItem) return;
      event.preventDefault();
      handleExecute(activeItem);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  };

  return (
    <NativeDialog
      open={isSearchOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSearch();
        }
      }}
      initialFocusRef={inputRef}
      labelledBy={titleId}
      viewportClassName={stylex.props(styles.viewport).className}
      panelClassName={stylex.props(styles.panel).className}
    >
      <div>
        <h2 id={titleId} {...stylex.props(styles.visuallyHidden)}>
          Search workspace
        </h2>
        <div {...stylex.props(styles.searchSection)}>
          <div {...stylex.props(styles.searchFrame)}>
            <label htmlFor="global-search-input" {...stylex.props(styles.visuallyHidden)}>
              Search query
            </label>
            <div {...stylex.props(styles.searchRow)}>
              <div {...stylex.props(styles.searchIconFrame)}>
                <MagnifyingGlassIcon {...stylex.props(styles.searchIcon)} />
              </div>
              <input
                ref={inputRef}
                id="global-search-input"
                role="combobox"
                aria-expanded="true"
                aria-controls="global-search-listbox"
                aria-activedescendant={
                  activeIndex >= 0 ? `search-result-${visibleItems[activeIndex]?.id}` : undefined
                }
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search or ask about files, chats, settings, and actions..."
                {...stylex.props(styles.input)}
              />
              <kbd {...stylex.props(styles.shortcut)}>⌘K</kbd>
            </div>
          </div>
        </div>

        <div {...stylex.props(styles.resultsScroller)}>
          <LayoutGroup id="global-search-results">
            <div
              id="global-search-listbox"
              role="listbox"
              aria-label="Search results"
              {...stylex.props(styles.resultList)}
            >
              {displaySections.map((section) => (
                <section key={section.id}>
                  <div {...stylex.props(styles.sectionHeader)}>
                    <h3 {...stylex.props(styles.sectionTitle)}>{section.label}</h3>
                    {section.id === "results" && queryValue.length > 0 ? (
                      <span {...stylex.props(styles.resultCount)}>{section.items.length}</span>
                    ) : null}
                  </div>

                  {section.items.length === 0 ? (
                    <div {...stylex.props(styles.empty)}>{section.emptyMessage}</div>
                  ) : (
                    <div {...stylex.props(styles.resultItems)}>
                      <AnimatePresence initial={false}>
                        {section.items.map((item) => {
                          const index = visibleItems.findIndex(
                            (candidate) => candidate.id === item.id,
                          );
                          return (
                            <SearchResultRow
                              key={item.id}
                              item={item}
                              index={index}
                              isActive={index === activeIndex}
                              reducedMotion={!!reducedMotion}
                              onHover={() => setActiveIndex(index)}
                              onSelect={() => handleExecute(item)}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </LayoutGroup>
        </div>

        <div {...stylex.props(styles.footer)}>
          <div {...stylex.props(styles.shortcuts)}>
            <ShortcutHint keys="Enter" label="Open" />
            <ShortcutHint keys="↑↓" label="Move" />
            <ShortcutHint keys="Esc" label="Close" />
            <ShortcutHint keys="⌘K" label="Toggle search" />
            <ShortcutHint keys="Ctrl K" label="Windows" />
          </div>
        </div>
      </div>
    </NativeDialog>
  );
}
