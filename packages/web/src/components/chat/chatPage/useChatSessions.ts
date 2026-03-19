import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { ChatMessage as AgentChatMessage } from "@/hooks/chat/useAgent";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  loadChatSession,
  type ChatSessionRecord,
  type ChatSessionReference,
  type ChatSessionSummary,
} from "@/lib/chat/chatSessionStorage";
import {
  buildSessionSignature,
  toAgentMessages,
  toSessionSummary,
} from "./helpers";

interface UseChatSessionsParams {
  getIsPreparingTurn: () => boolean;
  getIsStreaming: () => boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onAbortStreaming: () => void;
}

interface UseChatSessionsResult {
  sessions: ChatSessionSummary[];
  sessionsReady: boolean;
  sessionsError: string | null;
  activeSessionId: string;
  activeSessionInitialMessages: AgentChatMessage[];
  setActiveSessionInitialMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  activeReferences: ChatSessionReference[];
  setActiveReferences: Dispatch<SetStateAction<ChatSessionReference[]>>;
  persistedSignaturesRef: MutableRefObject<Map<string, string>>;
  commitPersistedSession: (
    record: ChatSessionRecord,
    nextMessages: AgentChatMessage[],
  ) => void;
  deletingSessionId: string | null;
  pendingDeleteSessionId: string | null;
  handleCreateSession: () => Promise<void>;
  handleSelectSession: (sessionId: string) => Promise<void>;
  handlePromptDeleteSession: (sessionId: string) => void;
  handleCancelDeleteSession: () => void;
  handleConfirmDeleteSession: (sessionId: string) => Promise<void>;
}

export const useChatSessions = ({
  getIsPreparingTurn,
  getIsStreaming,
  inputRef,
  onAbortStreaming,
}: UseChatSessionsParams): UseChatSessionsResult => {
  const location = useLocation();
  const navigate = useNavigate();
  const requestedSessionId = useMemo(() => {
    const value = new URLSearchParams(location.search).get("session");
    return value?.trim() ?? "";
  }, [location.search]);
  const shouldCreateSessionFromUrl = useMemo(() => {
    return new URLSearchParams(location.search).get("new") === "1";
  }, [location.search]);
  const initialRequestedSessionIdRef = useRef(requestedSessionId);
  const initialCreateSessionRef = useRef(shouldCreateSessionFromUrl);
  const initialLocationKeyRef = useRef(location.key);
  const handledNewLocationKeyRef = useRef<string | null>(null);
  const pendingLocationSessionIdRef = useRef<string | null>(null);
  const persistedSignaturesRef = useRef<Map<string, string>>(new Map());
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionInitialMessages, setActiveSessionInitialMessages] =
    useState<AgentChatMessage[]>([]);
  const [activeReferences, setActiveReferences] = useState<
    ChatSessionReference[]
  >([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<
    string | null
  >(null);

  const replaceChatLocation = useCallback(
    (sessionId: string) => {
      pendingLocationSessionIdRef.current = sessionId;
      navigate(`/chat?session=${encodeURIComponent(sessionId)}`, {
        replace: true,
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (!requestedSessionId) {
      return;
    }

    if (pendingLocationSessionIdRef.current === requestedSessionId) {
      pendingLocationSessionIdRef.current = null;
    }
  }, [requestedSessionId]);

  const applyLoadedSession = useCallback(
    (
      sessionId: string,
      nextMessages: AgentChatMessage[],
      nextReferences: ChatSessionReference[],
    ) => {
      setActiveSessionInitialMessages(nextMessages);
      setActiveReferences(nextReferences);
      setActiveSessionId(sessionId);
      persistedSignaturesRef.current.set(
        sessionId,
        buildSessionSignature(nextMessages, nextReferences),
      );
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [inputRef],
  );

  useEffect(() => {
    let cancelled = false;

    const initializeSessions = async () => {
      setSessionsReady(false);
      setSessionsError(null);

      try {
        let summaries = await listChatSessions();
        let forcedSessionId: string | null = null;

        if (summaries.length === 0 || initialCreateSessionRef.current) {
          const created = await createChatSession();
          const createdSummary = toSessionSummary(created);
          summaries = [
            createdSummary,
            ...summaries.filter((summary) => summary.id !== createdSummary.id),
          ];
          forcedSessionId = created.id;
          if (initialCreateSessionRef.current) {
            handledNewLocationKeyRef.current = initialLocationKeyRef.current;
          }
        }

        const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt);
        const requestedSummary = initialRequestedSessionIdRef.current
          ? sorted.find(
              (summary) => summary.id === initialRequestedSessionIdRef.current,
            )
          : null;
        const initialSessionId =
          requestedSummary?.id ?? forcedSessionId ?? sorted[0]?.id;
        if (!initialSessionId) {
          throw new Error("No session available");
        }

        const session = await loadChatSession(initialSessionId);
        const initialMessages = toAgentMessages(session?.messages ?? []);
        const initialReferences = session?.references ?? [];
        if (cancelled) {
          return;
        }

        setSessions(sorted);
        applyLoadedSession(initialSessionId, initialMessages, initialReferences);
        if (
          !requestedSummary ||
          initialCreateSessionRef.current ||
          !initialRequestedSessionIdRef.current
        ) {
          replaceChatLocation(initialSessionId);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSessionsError(
          error instanceof Error
            ? error.message
            : "Failed to initialize chat sessions.",
        );
      } finally {
        if (!cancelled) {
          setSessionsReady(true);
        }
      }
    };

    void initializeSessions();

    return () => {
      cancelled = true;
    };
  }, [applyLoadedSession, replaceChatLocation]);

  const handleCreateSession = useCallback(async () => {
    const isPreparingTurn = getIsPreparingTurn();
    const isStreaming = getIsStreaming();
    if (!sessionsReady || isPreparingTurn) {
      return;
    }
    if (isStreaming) {
      onAbortStreaming();
    }

    const created = await createChatSession();
    const summary = toSessionSummary(created);
    setSessions((prev) => [
      summary,
      ...prev.filter((session) => session.id !== summary.id),
    ]);
    applyLoadedSession(created.id, [], []);
    replaceChatLocation(created.id);
  }, [
    applyLoadedSession,
    getIsPreparingTurn,
    getIsStreaming,
    onAbortStreaming,
    replaceChatLocation,
    sessionsReady,
  ]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const isPreparingTurn = getIsPreparingTurn();
      const isStreaming = getIsStreaming();
      if (!sessionsReady || isPreparingTurn) {
        return;
      }
      if (!sessionId || sessionId === activeSessionId) {
        return;
      }
      if (isStreaming) {
        onAbortStreaming();
      }

      const session = await loadChatSession(sessionId);
      if (!session) {
        return;
      }

      const nextMessages = toAgentMessages(session.messages);
      const nextReferences = session.references ?? [];
      applyLoadedSession(session.id, nextMessages, nextReferences);
      replaceChatLocation(session.id);
    },
    [
      activeSessionId,
      applyLoadedSession,
      getIsPreparingTurn,
      getIsStreaming,
      onAbortStreaming,
      replaceChatLocation,
      sessionsReady,
    ],
  );

  const handlePromptDeleteSession = useCallback(
    (sessionId: string) => {
      if (!sessionsReady) {
        return;
      }
      const target = sessions.find((session) => session.id === sessionId);
      if (!target) {
        return;
      }
      setPendingDeleteSessionId(sessionId);
    },
    [sessions, sessionsReady],
  );

  const handleCancelDeleteSession = useCallback(() => {
    if (deletingSessionId) {
      return;
    }
    setPendingDeleteSessionId(null);
  }, [deletingSessionId]);

  const handleConfirmDeleteSession = useCallback(
    async (sessionId: string) => {
      const isPreparingTurn = getIsPreparingTurn();
      const isStreaming = getIsStreaming();
      if (!sessionsReady || isPreparingTurn) {
        return;
      }

      const target = sessions.find((session) => session.id === sessionId);
      if (!target) {
        return;
      }

      if (isStreaming) {
        onAbortStreaming();
      }

      setDeletingSessionId(sessionId);
      setPendingDeleteSessionId(null);
      setSessionsError(null);

      try {
        await deleteChatSession(sessionId);
        persistedSignaturesRef.current.delete(sessionId);

        const remaining = sessions.filter((session) => session.id !== sessionId);
        setSessions(remaining);

        if (sessionId !== activeSessionId) {
          return;
        }

        if (remaining.length === 0) {
          const created = await createChatSession();
          const summary = toSessionSummary(created);
          setSessions([summary]);
          applyLoadedSession(created.id, [], []);
          replaceChatLocation(created.id);
          return;
        }

        const nextSessionId = remaining[0].id;
        const nextSession = await loadChatSession(nextSessionId);
        const nextMessages = toAgentMessages(nextSession?.messages ?? []);
        const nextReferences = nextSession?.references ?? [];
        applyLoadedSession(nextSessionId, nextMessages, nextReferences);
        replaceChatLocation(nextSessionId);
      } catch (error) {
        setSessionsError(
          error instanceof Error
            ? error.message
            : "Failed to delete chat session.",
        );
      } finally {
        setDeletingSessionId(null);
      }
    },
    [
      activeSessionId,
      applyLoadedSession,
      getIsPreparingTurn,
      getIsStreaming,
      onAbortStreaming,
      replaceChatLocation,
      sessions,
      sessionsReady,
    ],
  );

  useEffect(() => {
    if (!sessionsReady || !shouldCreateSessionFromUrl) {
      return;
    }
    if (handledNewLocationKeyRef.current === location.key) {
      return;
    }
    handledNewLocationKeyRef.current = location.key;
    void handleCreateSession();
  }, [handleCreateSession, location.key, sessionsReady, shouldCreateSessionFromUrl]);

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) {
      return;
    }
    if (shouldCreateSessionFromUrl) {
      return;
    }

    if (
      pendingLocationSessionIdRef.current === activeSessionId &&
      requestedSessionId !== activeSessionId
    ) {
      return;
    }

    if (!requestedSessionId) {
      replaceChatLocation(activeSessionId);
      return;
    }

    if (requestedSessionId === activeSessionId) {
      return;
    }

    const requestedExists = sessions.some(
      (session) => session.id === requestedSessionId,
    );
    if (requestedExists) {
      void handleSelectSession(requestedSessionId);
      return;
    }

    const fallbackSessionId = sessions[0]?.id ?? activeSessionId;
    if (!fallbackSessionId) {
      return;
    }

    if (fallbackSessionId === activeSessionId) {
      replaceChatLocation(fallbackSessionId);
      return;
    }

    void handleSelectSession(fallbackSessionId);
  }, [
    activeSessionId,
    handleSelectSession,
    replaceChatLocation,
    requestedSessionId,
    sessions,
    sessionsReady,
    shouldCreateSessionFromUrl,
  ]);

  const commitPersistedSession = useCallback(
    (record: ChatSessionRecord, nextMessages: AgentChatMessage[]) => {
      const summary = toSessionSummary(record);
      persistedSignaturesRef.current.set(
        record.id,
        buildSessionSignature(nextMessages, record.references),
      );
      setSessions((prev) => {
        const next = [
          summary,
          ...prev.filter((session) => session.id !== summary.id),
        ];
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      });
    },
    [],
  );

  return {
    sessions,
    sessionsReady,
    sessionsError,
    activeSessionId,
    activeSessionInitialMessages,
    setActiveSessionInitialMessages,
    activeReferences,
    setActiveReferences,
    persistedSignaturesRef,
    commitPersistedSession,
    deletingSessionId,
    pendingDeleteSessionId,
    handleCreateSession,
    handleSelectSession,
    handlePromptDeleteSession,
    handleCancelDeleteSession,
    handleConfirmDeleteSession,
  };
};
