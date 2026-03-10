import {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type FormEvent,
} from "react";
import {
  SparkleIcon,
  PenNibIcon,
  FileTextIcon,
  FolderSimpleIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  ArrowUpIcon,
  SlidersHorizontalIcon,
  PlusIcon,
  StopIcon,
  GearIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Persona } from "@/components/persona";
import { motion, AnimatePresence } from "motion/react";
import { useAgent, type ChatMessage as AgentChatMessage } from "@/hooks/useAgent";
import type { AgentConfig, PromptSegment } from "@memora/ai-core";
import { useStore, useClientDocument } from "@livestore/react";
import { queryDb } from "@livestore/livestore";
import { providerTable, type provider as ProviderRow } from "@/livestore/provider";
import { fileTable, type file as LiveStoreFile } from "@/livestore/file";
import { folderTable, type folder as LiveStoreFolder } from "@/livestore/folder";
import { settingsTable } from "@/livestore/setting";
import { useSettingsDialog } from "@/hooks/useSettingDialog";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  loadChatSession,
  updateChatSessionMessages,
  type ChatSessionReference,
  type ChatSessionMessage,
  type ChatSessionRecord,
  type ChatSessionSummary,
} from "@/lib/chatSessionStorage";
import { createOpfsSessionPersistenceAdapter } from "@/lib/opfsSessionPersistenceAdapter";
import {
  buildPersonalityMarkdown,
  loadPersonalityDoc,
  normalizePersonalityText,
  savePersonalityDoc,
} from "@/lib/personalityStorage";
import { ConfirmDialog } from "@/features/desktop";
import { ChatMessage } from "./ChatMessage";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import {
  ReferencePicker,
  type ReferencePickerOption,
} from "@/components/chat/ReferencePicker";
import { StatusBar } from "./StatusBar";
import {
  createChatTools,
  EMPTY_REFERENCE_SCOPE,
  SYSTEM_PROMPT,
  type ResolvedReferenceScope,
  type WriteApprovalDecision,
  type WriteApprovalRequest,
} from "./tools";
import { ToolWriteApprovalDialog } from "./ToolWriteApprovalDialog";

interface SuggestionCard {
  icon: React.ElementType;
  title: string;
  description: string;
}

const suggestions: SuggestionCard[] = [
  {
    icon: SparkleIcon,
    title: "Summarize a file",
    description: "Get a quick summary of any uploaded file",
  },
  {
    icon: PenNibIcon,
    title: "Draft a note",
    description: "Write notes from your recordings",
  },
  {
    icon: FileTextIcon,
    title: "Search transcripts",
    description: "Find specific moments in your audio",
  },
  {
    icon: CheckCircleIcon,
    title: "Create action items",
    description: "Extract tasks from your meetings",
  },
];

const providersQuery$ = queryDb(
  () => providerTable.where({ deletedAt: null }).orderBy("createdAt", "desc"),
  { label: "chat:providers" },
);

const activeFilesQuery$ = queryDb(
  () =>
    fileTable
      .where({ deletedAt: null, purgedAt: null })
      .orderBy("updatedAt", "desc"),
  { label: "chat:active-files" },
);

const activeFoldersQuery$ = queryDb(
  () =>
    folderTable
      .where({ deletedAt: null, purgedAt: null })
      .orderBy("updatedAt", "desc"),
  { label: "chat:active-folders" },
);

const MAX_REFERENCED_FILES = 200;
const REFERENCE_MENTION_PATTERN = /@([^\s@]*)$/;
const PERSONALITY_MEMORY_KEY = "personality";
const ONBOARDING_IDENTITY_PROMPT =
  "Hey, I’m your Memora assistant. Before we get started, tell me a bit about you and what you usually want help with.";
const ONBOARDING_STYLE_PROMPT =
  "Nice. What kind of assistant style do you want from me? For example: concise, direct, step-by-step, bilingual, etc.";
const ONBOARDING_COMPLETE_PROMPT =
  "Perfect, I’ve saved that. We’re good to go.";

type OnboardingStep = "identity" | "assistantStyle";

const toAgentMessages = (messages: ChatSessionMessage[]): AgentChatMessage[] => {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    thinkingSteps: message.thinkingSteps,
  }));
};

const createLocalChatMessage = (
  role: "user" | "assistant",
  content: string,
): AgentChatMessage => {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
};

const toSessionSummary = (record: ChatSessionRecord): ChatSessionSummary => {
  const lastMessage = [...record.messages]
    .reverse()
    .find((message) => message.content.trim().length > 0);
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    preview: lastMessage?.content.trim().slice(0, 80) ?? "",
  };
};

const buildReferenceKey = (reference: ChatSessionReference): string => {
  return `${reference.type}:${reference.id}`;
};

const sanitizeActiveReferences = (
  references: ChatSessionReference[],
  fileById: Map<string, LiveStoreFile>,
  folderById: Map<string, LiveStoreFolder>,
): ChatSessionReference[] => {
  const seen = new Set<string>();
  const next: ChatSessionReference[] = [];

  for (const reference of references) {
    const exists =
      reference.type === "file"
        ? fileById.has(reference.id)
        : folderById.has(reference.id);
    if (!exists) continue;
    const key = buildReferenceKey(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(reference);
  }

  return next;
};

const removeTrailingReferenceMention = (value: string): string => {
  return value.replace(REFERENCE_MENTION_PATTERN, "").replace(/\s+$/, "");
};

const resolveReferenceScope = (
  references: ChatSessionReference[],
  files: readonly LiveStoreFile[],
  folders: readonly LiveStoreFolder[],
): ResolvedReferenceScope => {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const validReferences = sanitizeActiveReferences(
    references,
    fileById,
    folderById,
  );

  if (validReferences.length === 0) {
    return EMPTY_REFERENCE_SCOPE;
  }

  const filesByParent = new Map<string | null, LiveStoreFile[]>();
  for (const file of files) {
    const parentKey = file.parentId ?? null;
    const siblings = filesByParent.get(parentKey) ?? [];
    siblings.push(file);
    filesByParent.set(parentKey, siblings);
  }

  const foldersByParent = new Map<string | null, LiveStoreFolder[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ?? null;
    const siblings = foldersByParent.get(parentKey) ?? [];
    siblings.push(folder);
    foldersByParent.set(parentKey, siblings);
  }

  const selectedFileIds = new Set<string>();
  for (const reference of validReferences) {
    if (reference.type === "file") {
      selectedFileIds.add(reference.id);
      continue;
    }

    const queue: string[] = [reference.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const childFiles = filesByParent.get(currentId) ?? [];
      childFiles.forEach((file) => selectedFileIds.add(file.id));

      const childFolders = foldersByParent.get(currentId) ?? [];
      childFolders.forEach((folder) => {
        if (!visited.has(folder.id)) {
          queue.push(folder.id);
        }
      });
    }
  }

  const allResolvedIds = Array.from(selectedFileIds);
  const truncated = allResolvedIds.length > MAX_REFERENCED_FILES;
  const scopedIds = truncated
    ? allResolvedIds.slice(0, MAX_REFERENCED_FILES)
    : allResolvedIds;
  const allowedPathsSet = new Set<string>();

  for (const id of scopedIds) {
    const file = fileById.get(id);
    if (!file) continue;
    if (typeof file.storagePath === "string" && file.storagePath.length > 0) {
      allowedPathsSet.add(file.storagePath);
    }
    if (
      typeof file.transcriptPath === "string" &&
      file.transcriptPath.length > 0
    ) {
      allowedPathsSet.add(file.transcriptPath);
    }
  }

  return {
    isActive: true,
    fileIds: scopedIds,
    allowedPaths: Array.from(allowedPathsSet),
    referenceLabels: validReferences.map((reference) =>
      reference.type === "folder"
        ? `Folder "${reference.name}"`
        : `File "${reference.name}"`,
    ),
    totalResolvedFiles: allResolvedIds.length,
    truncated,
  };
};

const buildReferenceScopePrompt = (scope: ResolvedReferenceScope): string => {
  if (!scope.isActive) {
    return "";
  }

  const previewLabels = scope.referenceLabels.slice(0, 8);
  const hasMoreLabels = scope.referenceLabels.length > previewLabels.length;
  const resolvedCountText = scope.truncated
    ? `${scope.fileIds.length} (trimmed from ${scope.totalResolvedFiles})`
    : `${scope.fileIds.length}`;
  const truncationNote = scope.truncated
    ? `Only the first ${MAX_REFERENCED_FILES} resolved files are in scope for this turn.`
    : "";
  const emptyScopeNote =
    scope.fileIds.length === 0
      ? "No active files were resolved from the current references."
      : "";

  return `## Active Reference Scope
The user has selected session-level file or folder references. Treat this scope as a hard constraint when using file-related tools.
- References: ${previewLabels.join(", ")}${hasMoreLabels ? ", ..." : ""}
- Scoped file count: ${resolvedCountText}
${truncationNote}
${emptyScopeNote}
When the scope is active, do not search or read files outside this reference scope.`;
};

const buildSessionSignature = (
  messages: AgentChatMessage[],
  references: ChatSessionReference[],
): string => {
  return JSON.stringify(
    {
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        thinkingSteps: message.thinkingSteps ?? [],
      })),
      references: references.map((reference) => ({
        type: reference.type,
        id: reference.id,
        name: reference.name,
      })),
    },
  );
};

export const Component = () => {
  const { store } = useStore();
  const providers = store.useQuery(providersQuery$) as ProviderRow[];
  const activeFileRows = store.useQuery(activeFilesQuery$) as LiveStoreFile[];
  const activeFolderRows = store.useQuery(activeFoldersQuery$) as LiveStoreFolder[];
  const [settings] = useClientDocument(settingsTable);
  const { openSettings } = useSettingsDialog();
  const referenceScopeRef = useRef<ResolvedReferenceScope>(EMPTY_REFERENCE_SCOPE);
  const referencePromptSegment = useMemo<PromptSegment>(
    () => ({
      id: "reference-scope",
      priority: 90,
      content: () => buildReferenceScopePrompt(referenceScopeRef.current),
    }),
    [],
  );
  const promptSegments = useMemo(
    () => [SYSTEM_PROMPT, referencePromptSegment],
    [referencePromptSegment],
  );

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeSessionInitialMessages, setActiveSessionInitialMessages] =
    useState<AgentChatMessage[]>([]);
  const [userToggled, setUserToggled] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(
    null,
  );
  const [activeReferences, setActiveReferences] = useState<ChatSessionReference[]>(
    [],
  );
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referencePickerQuery, setReferencePickerQuery] = useState("");
  const [referencePickerSource, setReferencePickerSource] = useState<
    "button" | "mention" | null
  >(null);
  const [referenceNotice, setReferenceNotice] = useState<string | null>(null);
  const [pendingWriteApproval, setPendingWriteApproval] =
    useState<WriteApprovalRequest | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("identity");
  const [onboardingMessages, setOnboardingMessages] = useState<AgentChatMessage[]>(
    [],
  );
  const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false);
  const [userIdentityInput, setUserIdentityInput] = useState("");
  const persistedSignaturesRef = useRef<Map<string, string>>(new Map());
  const sessionWriteApprovalRef = useRef<string | null>(null);
  const writeApprovalResolverRef = useRef<((decision: WriteApprovalDecision) => void) | null>(
    null,
  );

  const activeFileById = useMemo(
    () => new Map(activeFileRows.map((file) => [file.id, file])),
    [activeFileRows],
  );
  const activeFolderById = useMemo(
    () => new Map(activeFolderRows.map((folder) => [folder.id, folder])),
    [activeFolderRows],
  );
  const resolvedReferenceScope = useMemo(
    () =>
      resolveReferenceScope(
        activeReferences,
        activeFileRows,
        activeFolderRows,
      ),
    [activeFileRows, activeFolderRows, activeReferences],
  );
  referenceScopeRef.current = resolvedReferenceScope;

  const resolveWriteApproval = useCallback(
    (decision: WriteApprovalDecision) => {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      if (decision === "allow_session" && activeSessionId) {
        sessionWriteApprovalRef.current = activeSessionId;
      }
      setPendingWriteApproval(null);
      resolver?.(decision);
    },
    [activeSessionId],
  );

  const requestWriteApproval = useCallback(
    (request: WriteApprovalRequest): Promise<WriteApprovalDecision> => {
      if (!activeSessionId) {
        return Promise.resolve("deny");
      }
      if (sessionWriteApprovalRef.current === activeSessionId) {
        return Promise.resolve("allow_session");
      }
      if (writeApprovalResolverRef.current) {
        return Promise.resolve("deny");
      }
      return new Promise<WriteApprovalDecision>((resolve) => {
        writeApprovalResolverRef.current = resolve;
        setPendingWriteApproval(request);
      });
    },
    [activeSessionId],
  );

  const tools = useMemo(
    () =>
      createChatTools(store, {
        getReferenceScope: () => referenceScopeRef.current,
        requestWriteApproval,
      }),
    [requestWriteApproval, store],
  );

  const referencePickerOptions = useMemo<ReferencePickerOption[]>(() => {
    const normalizedQuery = referencePickerQuery.trim().toLowerCase();
    const include = (name: string) =>
      normalizedQuery.length === 0 ||
      name.toLowerCase().includes(normalizedQuery);

    const selectedKeys = new Set(
      activeReferences.map((reference) => buildReferenceKey(reference)),
    );

    const folderOptions = activeFolderRows
      .filter((folder) => include(folder.name))
      .map((folder) => ({
        type: "folder" as const,
        id: folder.id,
        name: folder.name,
        isSelected: selectedKeys.has(`folder:${folder.id}`),
      }));

    const fileOptions = activeFileRows
      .filter((file) => include(file.name))
      .map((file) => ({
        type: "file" as const,
        id: file.id,
        name: file.name,
        isSelected: selectedKeys.has(`file:${file.id}`),
      }));

    return [...folderOptions, ...fileOptions].slice(0, 80);
  }, [activeFileRows, activeFolderRows, activeReferences, referencePickerQuery]);

  useEffect(() => {
    let cancelled = false;

    const initializeSessions = async () => {
      setSessionsReady(false);
      setSessionsError(null);

      try {
        let summaries = await listChatSessions();
        if (summaries.length === 0) {
          const created = await createChatSession();
          summaries = [toSessionSummary(created)];
        }

        const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt);
        const initialSessionId = sorted[0]?.id;
        if (!initialSessionId) {
          throw new Error("No session available");
        }

        const session = await loadChatSession(initialSessionId);
        const initialMessages = toAgentMessages(session?.messages ?? []);
        const initialReferences = session?.references ?? [];
        if (cancelled) return;

        setSessions(sorted);
        setActiveSessionInitialMessages(initialMessages);
        setActiveReferences(initialReferences);
        setActiveSessionId(initialSessionId);
        persistedSignaturesRef.current.set(
          initialSessionId,
          buildSessionSignature(initialMessages, initialReferences),
        );
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to initialize chat sessions.";
        setSessionsError(message);
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
  }, []);

  useEffect(() => {
    setActiveReferences((prev) => {
      if (
        prev.length > 0 &&
        activeFileById.size === 0 &&
        activeFolderById.size === 0
      ) {
        return prev;
      }
      const next = sanitizeActiveReferences(
        prev,
        activeFileById,
        activeFolderById,
      );
      if (next.length !== prev.length) {
        setReferenceNotice(
          "Some references were removed because they are no longer available.",
        );
      }
      return next;
    });
  }, [activeFileById, activeFolderById]);

  useEffect(() => {
    if (!referenceNotice) return;
    const timer = window.setTimeout(() => {
      setReferenceNotice(null);
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [referenceNotice]);

  const persistence = useMemo(() => {
    return activeSessionId
      ? createOpfsSessionPersistenceAdapter(activeSessionId)
      : undefined;
  }, [activeSessionId]);

  const agentConfig = useMemo((): Partial<AgentConfig> => {
    const sessionScopedAgentId = activeSessionId
      ? `memora-chat:${activeSessionId}`
      : "memora-chat:bootstrap";
    const provider = providers.find((p) => p.id === settings.selectedProviderId);
    if (!provider || !settings.selectedModel) {
      return {
        id: sessionScopedAgentId,
        model: "",
        endpoint: "",
        apiFormat: "chat-completions",
      };
    }
    const baseUrl = provider.baseUrl.replace(/\/+$/, "");
    const apiFormat = provider.apiFormat as "chat-completions" | "responses";
    const endpoint =
      apiFormat === "responses"
        ? `${baseUrl}/responses`
        : `${baseUrl}/chat/completions`;
    return {
      id: sessionScopedAgentId,
      model: settings.selectedModel,
      endpoint,
      apiKey: provider.apiKey || undefined,
      apiFormat,
    };
  }, [
    activeSessionId,
    providers,
    settings.selectedModel,
    settings.selectedProviderId,
  ]);

  const isConfigured = !!agentConfig.model && !!agentConfig.endpoint;

  const {
    messages,
    isStreaming,
    status,
    thinkingSteps,
    thinkingCollapsed,
    iterationLimitPrompt,
    error,
    send,
    continueAfterIterationLimit,
    dismissIterationLimitPrompt,
    abort: abortAgent,
    saveMemory,
    loadMemory,
  } = useAgent({
    sessionId: activeSessionId || "bootstrap",
    initialMessages: activeSessionInitialMessages,
    config: agentConfig,
    promptSegments,
    tools,
    persistence,
  });

  const panelCollapsed = userToggled ? !thinkingCollapsed : thinkingCollapsed;
  const handleToggleThinking = () => setUserToggled((value) => !value);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const displayedMessages = useMemo(
    () => (isOnboardingOpen ? [...messages, ...onboardingMessages] : messages),
    [isOnboardingOpen, messages, onboardingMessages],
  );
  const hasMessages = displayedMessages.length > 0;
  const abort = useCallback(() => {
    resolveWriteApproval("deny");
    abortAgent();
  }, [abortAgent, resolveWriteApproval]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages, isStreaming, thinkingSteps]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  useEffect(() => {
    sessionWriteApprovalRef.current = null;
    if (writeApprovalResolverRef.current) {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver("deny");
    }
    setPendingWriteApproval(null);
  }, [activeSessionId]);

  useEffect(() => {
    return () => {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver?.("deny");
    };
  }, []);

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return;
    let cancelled = false;

    const initializePersonality = async () => {
      setIsOnboardingSubmitting(false);
      try {
        const memoryValue = await loadMemory<string>(PERSONALITY_MEMORY_KEY);
        const normalizedMemory = normalizePersonalityText(memoryValue);
        if (normalizedMemory) {
          if (!cancelled) {
            setIsOnboardingOpen(false);
            setOnboardingMessages([]);
          }
          return;
        }

        const docValue = await loadPersonalityDoc();
        const normalizedDoc = normalizePersonalityText(docValue);
        if (normalizedDoc) {
          await saveMemory(PERSONALITY_MEMORY_KEY, normalizedDoc);
          if (!cancelled) {
            setIsOnboardingOpen(false);
            setOnboardingMessages([]);
          }
          return;
        }

        if (!cancelled) {
          setOnboardingStep("identity");
          setUserIdentityInput("");
          setOnboardingMessages([
            createLocalChatMessage("assistant", ONBOARDING_IDENTITY_PROMPT),
          ]);
          setIsOnboardingOpen(true);
        }
      } catch (_error) {
        if (cancelled) return;
        setOnboardingStep("identity");
        setUserIdentityInput("");
        setOnboardingMessages([
          createLocalChatMessage(
            "assistant",
            "I had trouble loading your profile settings, so we’ll quickly set it up now.",
          ),
          createLocalChatMessage("assistant", ONBOARDING_IDENTITY_PROMPT),
        ]);
        setIsOnboardingOpen(true);
      }
    };

    void initializePersonality();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, loadMemory, saveMemory, sessionsReady]);

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return;
    const signature = buildSessionSignature(messages, activeReferences);
    const persistedSignature = persistedSignaturesRef.current.get(activeSessionId);
    if (persistedSignature === signature) {
      return;
    }

    const timeout = setTimeout(() => {
      void updateChatSessionMessages(activeSessionId, messages, {
        references: activeReferences,
      })
        .then((record) => {
          const summary = toSessionSummary(record);
          persistedSignaturesRef.current.set(
            activeSessionId,
            buildSessionSignature(messages, record.references),
          );
          setSessions((prev) => {
            const next = [summary, ...prev.filter((session) => session.id !== summary.id)];
            return next.sort((a, b) => b.updatedAt - a.updatedAt);
          });
        })
        .catch((err) => {
          console.error("Failed to persist chat session:", err);
        });
    }, 300);
    return () => {
      clearTimeout(timeout);
    };
  }, [activeReferences, activeSessionId, messages, sessionsReady]);

  const handleCreateSession = useCallback(async () => {
    if (!sessionsReady) return;
    if (isStreaming) {
      abort();
    }
    const created = await createChatSession();
    const summary = toSessionSummary(created);
    setSessions((prev) => [summary, ...prev.filter((session) => session.id !== summary.id)]);
    setActiveSessionInitialMessages([]);
    setActiveReferences([]);
    setActiveSessionId(created.id);
    persistedSignaturesRef.current.set(created.id, buildSessionSignature([], []));
    setReferencePickerOpen(false);
    setReferencePickerQuery("");
    setReferencePickerSource(null);
    setReferenceNotice(null);
    setUserToggled(false);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [abort, isStreaming, sessionsReady]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionsReady) return;
      if (!sessionId || sessionId === activeSessionId) return;
      if (isStreaming) {
        abort();
      }
      const session = await loadChatSession(sessionId);
      if (!session) return;
      const nextMessages = toAgentMessages(session.messages);
      const nextReferences = session.references ?? [];
      setActiveSessionInitialMessages(nextMessages);
      setActiveReferences(nextReferences);
      setActiveSessionId(session.id);
      persistedSignaturesRef.current.set(
        session.id,
        buildSessionSignature(nextMessages, nextReferences),
      );
      setReferencePickerOpen(false);
      setReferencePickerQuery("");
      setReferencePickerSource(null);
      setReferenceNotice(null);
      setUserToggled(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [abort, activeSessionId, isStreaming, sessionsReady],
  );

  const handlePromptDeleteSession = useCallback(
    (sessionId: string) => {
      if (!sessionsReady) return;
      const target = sessions.find((session) => session.id === sessionId);
      if (!target) return;
      setPendingDeleteSessionId(sessionId);
    },
    [sessions, sessionsReady],
  );

  const handleCancelDeleteSession = useCallback(() => {
    if (deletingSessionId) return;
    setPendingDeleteSessionId(null);
  }, [deletingSessionId]);

  const handleConfirmDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!sessionsReady) return;
      const target = sessions.find((session) => session.id === sessionId);
      if (!target) return;

      if (isStreaming) {
        abort();
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
          setActiveSessionInitialMessages([]);
          setActiveReferences([]);
          setActiveSessionId(created.id);
          persistedSignaturesRef.current.set(
            created.id,
            buildSessionSignature([], []),
          );
          return;
        }

        const nextSessionId = remaining[0].id;
        const nextSession = await loadChatSession(nextSessionId);
        const nextMessages = toAgentMessages(nextSession?.messages ?? []);
        const nextReferences = nextSession?.references ?? [];
        setActiveSessionInitialMessages(nextMessages);
        setActiveReferences(nextReferences);
        setActiveSessionId(nextSessionId);
        persistedSignaturesRef.current.set(
          nextSessionId,
          buildSessionSignature(nextMessages, nextReferences),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete chat session.";
        setSessionsError(message);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [abort, activeSessionId, isStreaming, sessions, sessionsReady],
  );

  const closeReferencePicker = useCallback(() => {
    setReferencePickerOpen(false);
    setReferencePickerQuery("");
    setReferencePickerSource(null);
  }, []);

  const handleSelectReference = useCallback(
    (option: ReferencePickerOption) => {
      setActiveReferences((prev) => {
        const key = `${option.type}:${option.id}`;
        if (prev.some((reference) => buildReferenceKey(reference) === key)) {
          return prev;
        }
        return [
          ...prev,
          {
            type: option.type,
            id: option.id,
            name: option.name,
          },
        ];
      });

      if (referencePickerSource === "mention" && inputRef.current) {
        inputRef.current.value = removeTrailingReferenceMention(inputRef.current.value);
      }
      closeReferencePicker();
      inputRef.current?.focus();
    },
    [closeReferencePicker, referencePickerSource],
  );

  const handleRemoveReference = useCallback((reference: ChatSessionReference) => {
    setActiveReferences((prev) =>
      prev.filter(
        (item) =>
          !(
            item.type === reference.type &&
            item.id === reference.id
          ),
      ),
    );
  }, []);

  const handleClearReferences = useCallback(() => {
    setActiveReferences([]);
  }, []);

  const handleReferenceButtonClick = useCallback(() => {
    if (referencePickerOpen && referencePickerSource === "button") {
      closeReferencePicker();
      inputRef.current?.focus();
      return;
    }
    setReferencePickerOpen(true);
    setReferencePickerQuery("");
    setReferencePickerSource("button");
  }, [closeReferencePicker, referencePickerOpen, referencePickerSource]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (isOnboardingOpen) {
        return;
      }
      const value = event.currentTarget.value;
      const mentionMatch = value.match(REFERENCE_MENTION_PATTERN);
      if (mentionMatch) {
        setReferencePickerOpen(true);
        setReferencePickerSource("mention");
        setReferencePickerQuery(mentionMatch[1] ?? "");
        return;
      }
      if (referencePickerSource === "mention") {
        closeReferencePicker();
      }
    },
    [closeReferencePicker, isOnboardingOpen, referencePickerSource],
  );

  const handleOnboardingReply = useCallback(
    async (answer: string) => {
      if (isOnboardingSubmitting) return;

      const trimmedAnswer = answer.trim();
      if (!trimmedAnswer) {
        return;
      }

      if (onboardingStep === "identity") {
        setUserIdentityInput(trimmedAnswer);
        setOnboardingStep("assistantStyle");
        setOnboardingMessages((prev) => [
          ...prev,
          createLocalChatMessage("user", trimmedAnswer),
          createLocalChatMessage("assistant", ONBOARDING_STYLE_PROMPT),
        ]);
        return;
      }

      const userIdentity = userIdentityInput.trim();
      if (!userIdentity) {
        setOnboardingStep("identity");
        setOnboardingMessages((prev) => [
          ...prev,
          createLocalChatMessage(
            "assistant",
            "I didn’t catch that intro. Let’s try again: who are you?",
          ),
        ]);
        return;
      }

      setOnboardingMessages((prev) => [
        ...prev,
        createLocalChatMessage("user", trimmedAnswer),
      ]);

      setIsOnboardingSubmitting(true);
      try {
        const personalityMarkdown = buildPersonalityMarkdown({
          userIdentity,
          assistantStyle: trimmedAnswer,
        });
        await savePersonalityDoc(personalityMarkdown);
        await saveMemory(PERSONALITY_MEMORY_KEY, personalityMarkdown);
        setOnboardingMessages((prev) => [
          ...prev,
          createLocalChatMessage("assistant", ONBOARDING_COMPLETE_PROMPT),
        ]);
        setIsOnboardingOpen(false);
      } catch (_error) {
        setOnboardingMessages((prev) => [
          ...prev,
          createLocalChatMessage(
            "assistant",
            "I couldn't save that just now. Please send your preferred assistant style again.",
          ),
        ]);
      } finally {
        setIsOnboardingSubmitting(false);
      }
    },
    [isOnboardingSubmitting, onboardingStep, saveMemory, userIdentityInput],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!sessionsReady || !activeSessionId) return;
    const trimmed = inputRef.current?.value.trim();
    if (!trimmed || isStreaming) return;

    if (isOnboardingOpen) {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setUserToggled(false);
      closeReferencePicker();
      void handleOnboardingReply(trimmed);
      return;
    }

    if (!isConfigured) {
      openSettings("ai-provider");
      return;
    }

    const validReferences = sanitizeActiveReferences(
      activeReferences,
      activeFileById,
      activeFolderById,
    );
    if (validReferences.length !== activeReferences.length) {
      setActiveReferences(validReferences);
      setReferenceNotice(
        "Some references were removed because they are no longer available.",
      );
    }

    const nextScope = resolveReferenceScope(
      validReferences,
      activeFileRows,
      activeFolderRows,
    );
    referenceScopeRef.current = nextScope;
    if (nextScope.truncated) {
      setReferenceNotice(
        `Reference scope was limited to ${MAX_REFERENCED_FILES} files for this request.`,
      );
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setUserToggled(false);
    closeReferencePicker();
    void send(trimmed);
  };

  const handleSuggestionClick = (suggestion: SuggestionCard) => {
    if (inputRef.current) {
      inputRef.current.value = suggestion.title;
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.nativeEvent.isComposing ||
      e.nativeEvent.keyCode === 229 ||
      isComposingRef.current
    ) {
      return;
    }
    if (e.key === "Escape" && referencePickerOpen) {
      e.preventDefault();
      closeReferencePicker();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
  };

  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;
  const activeSessionTitle =
    sessions.find((session) => session.id === activeSessionId)?.title ??
    "Select a session";

  const handleOpenHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(true);
  }, []);

  const handleCloseHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(false);
  }, []);

  const handleAllowWriteOnce = useCallback(() => {
    resolveWriteApproval("allow_once");
  }, [resolveWriteApproval]);

  const handleAllowWriteForSession = useCallback(() => {
    resolveWriteApproval("allow_session");
  }, [resolveWriteApproval]);

  const handleDenyWrite = useCallback(() => {
    resolveWriteApproval("deny");
  }, [resolveWriteApproval]);

  return (
    <>
      <div className="flex h-full min-h-0">
        <aside className="hidden h-full w-[280px] shrink-0 border-r border-zinc-200/60 md:block">
          <ChatHistoryPanel
            sessions={sessions}
            activeSessionId={activeSessionId}
            isStreaming={isStreaming}
            deletingSessionId={deletingSessionId}
            onCreateSession={() => void handleCreateSession()}
            onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
            onDeleteSession={handlePromptDeleteSession}
            isReady={sessionsReady}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-zinc-200/60 px-4 py-2.5 md:hidden">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleOpenHistoryDrawer}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                <ClockCounterClockwiseIcon className="size-3.5" weight="bold" />
                History
              </button>
              <p className="min-w-0 truncate text-xs font-medium text-zinc-500">
                {activeSessionTitle}
              </p>
            </div>
            {sessionsError && (
              <p className="mx-auto mt-2 max-w-2xl text-xs text-red-600">
                {sessionsError}
              </p>
            )}
          </div>

          {hasMessages ? (
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto max-w-2xl space-y-4">
                {sessionsError && (
                  <p className="hidden text-xs text-red-600 md:block">
                    {sessionsError}
                  </p>
                )}
                {displayedMessages.map((message) => {
                  const isCurrentAssistant =
                    message.role === "assistant" && message.id === lastAssistantId;
                  return (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      isStreaming={isStreaming && isCurrentAssistant}
                      thinkingSteps={isCurrentAssistant ? thinkingSteps : undefined}
                      status={isCurrentAssistant ? status : undefined}
                      thinkingCollapsed={isCurrentAssistant ? panelCollapsed : undefined}
                      onToggleThinking={
                        isCurrentAssistant ? handleToggleThinking : undefined
                      }
                    />
                  );
                })}
                {iterationLimitPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800"
                  >
                    <p>
                      The model has been running for a while (
                      {iterationLimitPrompt.iterations} iterations). Continue
                      running?
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void continueAfterIterationLimit()}
                        disabled={isStreaming}
                        className="rounded-lg border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        onClick={dismissIterationLimitPrompt}
                        disabled={isStreaming}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Stop
                      </button>
                    </div>
                  </motion.div>
                )}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
                  >
                    {error.message}
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-4">
              <div className="flex flex-col items-center gap-4">
                {sessionsError && (
                  <p className="text-center text-xs text-red-600">
                    {sessionsError}
                  </p>
                )}
                <Persona state="idle" className="size-20" />
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  What can I help you with?
                </h1>
                {!isConfigured && (
                  <button
                    type="button"
                    onClick={() => openSettings("ai-provider")}
                    className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 transition hover:bg-amber-100"
                  >
                    <GearIcon className="size-4" />
                    Configure an AI provider to get started
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="shrink-0 px-4 pb-6">
            <div className="mx-auto max-w-2xl">
              <AnimatePresence>
                {isStreaming &&
                  status.type !== "idle" &&
                  status.type !== "generating" && <StatusBar status={status} />}
              </AnimatePresence>
              {referenceNotice && (
                <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {referenceNotice}
                </p>
              )}
              {activeReferences.length > 0 && (
                <div className="mb-2 rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-zinc-600">
                      References
                      <span className="ml-1 text-zinc-400">
                        ({activeReferences.length})
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      {resolvedReferenceScope.isActive && (
                        <span className="text-[11px] text-zinc-500">
                          Scoped files: {resolvedReferenceScope.fileIds.length}
                          {resolvedReferenceScope.truncated
                            ? ` / ${resolvedReferenceScope.totalResolvedFiles}`
                            : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleClearReferences}
                        className="text-xs text-zinc-500 transition hover:text-zinc-700"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeReferences.map((reference) => (
                      <span
                        key={`${reference.type}:${reference.id}`}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
                      >
                        {reference.type === "folder" ? (
                          <FolderSimpleIcon className="size-3.5 shrink-0 text-zinc-500" />
                        ) : (
                          <FileTextIcon className="size-3.5 shrink-0 text-zinc-500" />
                        )}
                        <span className="truncate">{reference.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(reference)}
                          className="inline-flex size-4 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
                          aria-label={`Remove reference ${reference.name}`}
                        >
                          <XIcon className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <ReferencePicker
                open={referencePickerOpen}
                query={referencePickerQuery}
                options={referencePickerOptions}
                onQueryChange={setReferencePickerQuery}
                onSelect={handleSelectReference}
                onClose={closeReferencePicker}
              />
              <form onSubmit={handleSubmit}>
                <div className="group relative rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm transition-colors focus-within:border-zinc-300 focus-within:shadow-md">
                  <textarea
                    ref={inputRef}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder={
                      isOnboardingOpen
                        ? onboardingStep === "identity"
                          ? "Reply with a quick intro..."
                          : "How do you want me to assist you?"
                        : "Message Memora..."
                    }
                    disabled={isOnboardingSubmitting}
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCreateSession()}
                        disabled={!sessionsReady || isOnboardingOpen}
                        className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title="New session"
                      >
                        <PlusIcon className="size-4" weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={handleReferenceButtonClick}
                        disabled={!sessionsReady || isOnboardingOpen}
                        className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                          referencePickerOpen && referencePickerSource === "button"
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                        title="Reference files or folders"
                      >
                        <FileTextIcon className="size-4" weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openSettings("ai-provider")}
                        className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                      >
                        <SlidersHorizontalIcon className="size-4" />
                      </button>
                    </div>
                    {isStreaming ? (
                      <button
                        type="button"
                        onClick={abort}
                        className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800"
                      >
                        <StopIcon className="size-3.5" weight="fill" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isOnboardingSubmitting}
                        className="flex size-7 items-center justify-center rounded-full bg-zinc-200 text-zinc-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowUpIcon className="size-3.5" weight="bold" />
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <AnimatePresence>
                {!hasMessages && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 grid grid-cols-2 gap-2.5"
                  >
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.title}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="flex items-start gap-3 rounded-xl border border-zinc-200/60 bg-white/60 px-3.5 py-3 text-left transition-all hover:border-zinc-300 hover:bg-white/90 hover:shadow-sm"
                      >
                        <suggestion.icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-700">
                            {suggestion.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-zinc-400">
                            {suggestion.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isHistoryDrawerOpen && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={handleCloseHistoryDrawer}
              className="absolute inset-0 bg-zinc-950/30"
              aria-label="Close history panel"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22 }}
              className="absolute inset-y-0 left-0 h-full w-[86vw] max-w-[320px] border-r border-zinc-200/70 shadow-xl"
            >
              <ChatHistoryPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                isStreaming={isStreaming}
                deletingSessionId={deletingSessionId}
                onCreateSession={() => void handleCreateSession()}
                onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
                onDeleteSession={handlePromptDeleteSession}
                onCloseMobileDrawer={handleCloseHistoryDrawer}
                isReady={sessionsReady}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToolWriteApprovalDialog
        request={pendingWriteApproval}
        onAllowOnce={handleAllowWriteOnce}
        onAllowSession={handleAllowWriteForSession}
        onDeny={handleDenyWrite}
      />

      <ConfirmDialog
        isOpen={pendingDeleteSessionId !== null}
        title="Delete session?"
        description="This action cannot be undone. The selected conversation will be permanently removed."
        confirmLabel={deletingSessionId ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        tone="danger"
        onCancel={handleCancelDeleteSession}
        onConfirm={() => {
          if (!pendingDeleteSessionId || deletingSessionId) return;
          void handleConfirmDeleteSession(pendingDeleteSessionId);
        }}
      />
    </>
  );
};
