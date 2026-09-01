import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { listChatSessions } from "@/lib/chat/chatSessionStorage";
import { ACTION_SEARCH_ITEMS, STATIC_SEARCH_ITEMS } from "@/lib/search/searchCatalog";
import { modelWorkerFactory } from "@/lib/model-worker";
import { useAppStore } from "@/livestore/store";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { readEmbeddingRuntime } from "@/lib/models/readEmbeddingRuntime";
import { searchContent, type ContentSearchResult } from "@/lib/search/contentSearchService";
import { rankSearchItems } from "@/lib/search/searchRanking";
import {
  buildContentSearchItems,
  buildChatSessionSearchItems,
  buildFileSearchItems,
  buildFolderSearchItems,
} from "@/lib/search/searchItems";
import type { GlobalSearchItem } from "@/types/search";

import { type SearchSection, sortByRecency } from "./constants";

export const useSearchResults = ({
  fileRows,
  folderRows,
  isSearchOpen,
  query,
}: {
  fileRows: Parameters<typeof buildFileSearchItems>[0];
  folderRows: Parameters<typeof buildFolderSearchItems>[0];
  isSearchOpen: boolean;
  query: string;
}) => {
  const store = useAppStore();
  const settings = store.useQuery(settingsDocumentQuery$);
  const modelRouting = settings?.modelRouting;
  const deferredQuery = useDeferredValue(query);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const fileItems = useMemo(
    () => buildFileSearchItems(fileRows, folderRows),
    [fileRows, folderRows],
  );
  const folderItems = useMemo(
    () => buildFolderSearchItems(folderRows, fileRows),
    [fileRows, folderRows],
  );
  const chatItems = useMemo(() => buildChatSessionSearchItems(chatSessions), [chatSessions]);
  const contentItems = useMemo(() => buildContentSearchItems(contentResults), [contentResults]);

  const allSearchItems = useMemo(
    () => [...STATIC_SEARCH_ITEMS, ...folderItems, ...fileItems, ...chatItems],
    [chatItems, fileItems, folderItems],
  );
  const queryValue = deferredQuery.trim();
  const rankedResults = useMemo(
    () => [...rankSearchItems(allSearchItems, queryValue), ...contentItems],
    [allSearchItems, contentItems, queryValue],
  );

  const displaySections = useMemo<SearchSection[]>(() => {
    if (queryValue.length > 0) {
      return [
        {
          id: "results",
          label: rankedResults.length > 0 ? "Results" : "No matches",
          items: rankedResults,
          emptyMessage: isLoadingContent
            ? "Searching extracted file content..."
            : contentError ?? "Try a file name, a setting label, or an action like upload or transcription.",
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
  }, [chatItems, contentError, fileItems, isLoadingChats, isLoadingContent, queryValue, rankedResults]);

  const visibleItems = useMemo<GlobalSearchItem[]>(
    () => displaySections.flatMap((section) => section.items),
    [displaySections],
  );

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setIsLoadingChats(true);
      }
    });

    void listChatSessions()
      .then((summaries) => {
        if (cancelled) {
          return;
        }

        const sorted = summaries.slice().sort((left, right) => right.updatedAt - left.updatedAt);

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
    if (!isSearchOpen || queryValue.length < 2) {
      setContentResults([]);
      setIsLoadingContent(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoadingContent(true);
      setContentError(null);
      void Promise.resolve().then(() => searchContent({
        query: queryValue,
        vectorDb: modelWorkerFactory.vectorDb,
        files: fileRows,
        signal: controller.signal,
        semantic: readEmbeddingRuntime(store),
        semanticMode: settings?.semanticSearchMode,
      }))
        .then((results) => {
          if (!cancelled) startTransition(() => setContentResults(results));
        })
        .catch((error) => {
          console.warn("Failed to search extracted content:", error);
          if (!cancelled) {
            setContentResults([]);
            setContentError(error instanceof Error ? error.message : "Content search failed.");
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingContent(false);
        });
    }, 150);
    const controller = new AbortController();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [fileRows, isSearchOpen, queryValue, modelRouting, settings?.semanticSearchEnabled, store]);

  return {
    displaySections,
    queryValue,
    visibleItems,
  };
};
