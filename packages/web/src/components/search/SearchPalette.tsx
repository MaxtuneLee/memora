import { Dialog } from "@base-ui/react/dialog";
import {
  ChatCircleIcon,
  FileIcon,
  FolderNotchOpenIcon,
  GearIcon,
  HouseIcon,
  LightningIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useStore } from "@livestore/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";

import { useSearchPalette } from "@/hooks/search/useSearchPalette";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { listChatSessions, type ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { cn } from "@/lib/cn";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import {
  ACTION_SEARCH_ITEMS,
  STATIC_SEARCH_ITEMS,
} from "@/lib/search/searchCatalog";
import {
  buildChatSessionSearchItems,
  buildFileSearchItems,
  buildFolderSearchItems,
} from "@/lib/search/searchItems";
import { rankSearchItems } from "@/lib/search/searchRanking";
import type {
  GlobalSearchItem,
  SearchItemKind,
  SearchNavigationState,
} from "@/types/search";

interface SearchSection {
  id: string;
  label: string;
  items: GlobalSearchItem[];
  emptyMessage?: string;
}

const CATEGORY_LABELS: Record<SearchItemKind, string> = {
  file: "File",
  folder: "Folder",
  chat: "Chat",
  settings: "Settings",
  page: "Page",
  action: "Action",
};

const SEARCH_ITEM_ICONS: Record<SearchItemKind, React.ElementType> = {
  file: FileIcon,
  folder: FolderNotchOpenIcon,
  chat: ChatCircleIcon,
  settings: GearIcon,
  page: HouseIcon,
  action: LightningIcon,
};

const sortByRecency = (items: GlobalSearchItem[]): GlobalSearchItem[] => {
  return items
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
};

function ShortcutHint({
  keys,
  label,
}: {
  keys: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <kbd className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-[#e5e0d8] bg-[#f7f4ef] px-1.5 font-medium text-zinc-500">
        {keys}
      </kbd>
      <span>{label}</span>
    </div>
  );
}

function SearchResultRow({
  item,
  index,
  isActive,
  reducedMotion,
  onHover,
  onSelect,
}: {
  item: GlobalSearchItem;
  index: number;
  isActive: boolean;
  reducedMotion: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = SEARCH_ITEM_ICONS[item.kind];

  return (
    <motion.button
      id={`search-result-${item.id}`}
      type="button"
      role="option"
      aria-selected={isActive}
      initial={
        reducedMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 10, scale: 0.985 }
      }
      animate={
        reducedMotion
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={{
        duration: reducedMotion ? 0.14 : 0.18,
        delay: reducedMotion ? 0 : Math.min(index, 5) * 0.02,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-[14px] px-4 py-3 text-left outline-none transition-colors duration-150",
        isActive ? "bg-transparent" : "bg-transparent hover:bg-[#f5f4f2]",
      )}
    >
      {isActive ? (
        <motion.div
          layoutId="search-active-result"
          className="absolute inset-0 rounded-[14px] border border-[#e7e1d8] bg-[#f1f0ee]"
          transition={
            reducedMotion
              ? { duration: 0.12 }
              : {
                  type: "spring",
                  stiffness: 430,
                  damping: 36,
                  mass: 0.72,
                }
          }
        />
      ) : null}

      <div
        className={cn(
          "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center transition-colors",
          isActive
            ? "text-zinc-700"
            : "text-zinc-400 group-hover:text-zinc-600",
        )}
      >
        <Icon className="size-5" weight="regular" />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-[15px] font-semibold text-zinc-800">
            {item.title}
          </p>
          <span className="shrink-0 text-sm text-zinc-300">—</span>
          <p className="truncate text-sm text-zinc-400">
            {item.description || CATEGORY_LABELS[item.kind]}
          </p>
        </div>
        <p
          className={cn(
            "mt-1 text-xs leading-5 text-pretty line-clamp-1 sm:line-clamp-2",
            isActive ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          {item.preview}
        </p>
      </div>
    </motion.button>
  );
}

export default function SearchPalette() {
  const { store } = useStore();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { isSearchOpen, closeSearch } = useSearchPalette();
  const { openSettings } = useSettingsDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRows = store.useQuery(desktopFilesQuery$);
  const folderRows = store.useQuery(desktopFoldersQuery$);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const fileItems = useMemo(
    () => buildFileSearchItems(fileRows, folderRows),
    [fileRows, folderRows],
  );
  const folderItems = useMemo(
    () => buildFolderSearchItems(folderRows, fileRows),
    [fileRows, folderRows],
  );
  const chatItems = useMemo(
    () => buildChatSessionSearchItems(chatSessions),
    [chatSessions],
  );

  const allSearchItems = useMemo(
    () => [...STATIC_SEARCH_ITEMS, ...folderItems, ...fileItems, ...chatItems],
    [chatItems, fileItems, folderItems],
  );

  const queryValue = deferredQuery.trim();
  const rankedResults = useMemo(() => {
    return rankSearchItems(allSearchItems, queryValue);
  }, [allSearchItems, queryValue]);

  const displaySections = useMemo<SearchSection[]>(() => {
    if (queryValue.length > 0) {
      return [
        {
          id: "results",
          label: rankedResults.length > 0 ? "Results" : "No matches",
          items: rankedResults,
          emptyMessage:
            "Try a file name, a setting label, or an action like upload or transcription.",
        },
      ];
    }

    return [
      {
        id: "actions",
        label: "Suggested Actions",
        items: ACTION_SEARCH_ITEMS.slice(0, 5),
      },
      {
        id: "recent-chats",
        label: "Recent Chats",
        items: sortByRecency(chatItems).slice(0, 4),
        emptyMessage: isLoadingChats
          ? "Loading saved chat sessions..."
          : "No saved chat sessions yet.",
      },
      {
        id: "recent-files",
        label: "Recent Files",
        items: sortByRecency(fileItems).slice(0, 5),
        emptyMessage: "Upload or record something to see recent files here.",
      },
    ];
  }, [chatItems, fileItems, isLoadingChats, queryValue, rankedResults]);

  const visibleItems = useMemo(
    () => displaySections.flatMap((section) => section.items),
    [displaySections],
  );

  useEffect(() => {
    if (!isSearchOpen) {
      setQuery("");
      setActiveIndex(-1);
      return;
    }

    inputRef.current?.focus();
    setQuery("");
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;

    let cancelled = false;
    setIsLoadingChats(true);

    void listChatSessions()
      .then((summaries) => {
        if (cancelled) return;

        const sorted = summaries
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt);

        startTransition(() => {
          setChatSessions(sorted);
        });
      })
      .catch((error) => {
        console.error("Failed to load chat sessions for search:", error);
        if (!cancelled) {
          startTransition(() => {
            setChatSessions([]);
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingChats(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
        navigate(item.intent.to);
        return;
      case "open-settings":
        openSettings(item.intent.section);
        return;
      case "open-chat-session":
        navigate(`/chat?session=${encodeURIComponent(item.intent.sessionId)}`);
        return;
      case "desktop-intent": {
        const state: SearchNavigationState = {
          searchDesktopIntent: {
            requestId: crypto.randomUUID(),
            intent: item.intent.desktopIntent,
          },
        };
        navigate(item.intent.to ?? "/", { state });
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
    <Dialog.Root
      open={isSearchOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSearch();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          render={(props, state) => {
            const {
              onAnimationEnd,
              onAnimationIteration,
              onAnimationStart,
              onDrag,
              onDragEnd,
              onDragStart,
              ...rest
            } = props;
            void onAnimationEnd;
            void onAnimationIteration;
            void onAnimationStart;
            void onDrag;
            void onDragEnd;
            void onDragStart;

            return (
              <motion.div
                {...rest}
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={
                  state.open
                    ? { opacity: 1, backdropFilter: "blur(8px)" }
                    : { opacity: 0, backdropFilter: "blur(0px)" }
                }
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          }}
          className="fixed inset-0 z-40 bg-[rgba(34,32,29,0.14)]"
        />
        <Dialog.Popup
          render={(props, state) => {
            const {
              onAnimationEnd,
              onAnimationIteration,
              onAnimationStart,
              onDrag,
              onDragEnd,
              onDragStart,
              ...rest
            } = props;
            void onAnimationEnd;
            void onAnimationIteration;
            void onAnimationStart;
            void onDrag;
            void onDragEnd;
            void onDragStart;

            return (
              <motion.div
                {...rest}
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 18, scale: 0.97 }
                }
                animate={
                  state.open
                    ? reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1 }
                    : reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 12, scale: 0.985 }
                }
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          }}
          className="fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-50 w-[min(760px,calc(100vw-1rem))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#ddd8d0] bg-[rgba(255,255,253,0.98)] text-zinc-950 shadow-[0_18px_48px_rgba(38,34,29,0.12)] sm:top-1/2 sm:w-[min(760px,92vw)] sm:-translate-y-1/2"
        >
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
            <div className="rounded-[14px] border border-[#ebe7e1] bg-transparent">
              <label
                htmlFor="global-search-input"
                className="sr-only"
              >
                Search query
              </label>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center text-zinc-700">
                  <MagnifyingGlassIcon className="size-5" />
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
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400"
                />
                <kbd className="hidden items-center rounded-md border border-[#e5e0d8] bg-[#f7f4ef] px-2 py-1 text-[11px] font-medium text-zinc-500 sm:inline-flex">
                  ⌘K
                </kbd>
              </div>
            </div>
          </div>

          <div className="max-h-[min(72vh,640px)] overflow-y-auto px-4 pb-4 sm:px-5">
            <LayoutGroup id="global-search-results">
              <div
                id="global-search-listbox"
                role="listbox"
                aria-label="Search results"
                className="space-y-5"
              >
                {displaySections.map((section) => (
                  <section key={section.id}>
                    <div className="flex items-center justify-between px-2 pb-2">
                      <h3 className="text-[13px] font-semibold text-zinc-500">
                        {section.label}
                      </h3>
                      {section.id === "results" && queryValue.length > 0 ? (
                        <span className="text-xs text-zinc-400">
                          {section.items.length}
                        </span>
                      ) : null}
                    </div>

                    {section.items.length === 0 ? (
                      <div className="rounded-[14px] bg-[#f6f5f3] px-4 py-4 text-sm text-zinc-500">
                        {section.emptyMessage}
                      </div>
                    ) : (
                      <div className="space-y-1">
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

          <div className="border-t border-[#ebe7e1] bg-[#fcfbf8] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <ShortcutHint keys="Enter" label="Open" />
              <ShortcutHint keys="↑↓" label="Move" />
              <ShortcutHint keys="Esc" label="Close" />
              <ShortcutHint keys="⌘K" label="Toggle search" />
              <ShortcutHint keys="Ctrl K" label="Windows" />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
