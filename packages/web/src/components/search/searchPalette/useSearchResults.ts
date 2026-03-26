import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import { listChatSessions } from "@/lib/chat/chatSessionStorage";
import { ACTION_SEARCH_ITEMS, STATIC_SEARCH_ITEMS } from "@/lib/search/searchCatalog";
import { rankSearchItems } from "@/lib/search/searchRanking";
import {
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
  const deferredQuery = useDeferredValue(query);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  const fileItems = useMemo(
    () => buildFileSearchItems(fileRows, folderRows),
    [fileRows, folderRows],
  );
  const folderItems = useMemo(
    () => buildFolderSearchItems(folderRows, fileRows),
    [fileRows, folderRows],
  );
  const chatItems = useMemo(() => buildChatSessionSearchItems(chatSessions), [chatSessions]);

  const allSearchItems = useMemo(
    () => [...STATIC_SEARCH_ITEMS, ...folderItems, ...fileItems, ...chatItems],
    [chatItems, fileItems, folderItems],
  );
  const queryValue = deferredQuery.trim();
  const rankedResults = useMemo(
    () => rankSearchItems(allSearchItems, queryValue),
    [allSearchItems, queryValue],
  );

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

  return {
    displaySections,
    queryValue,
    visibleItems,
  };
};
