import {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type FormEvent,
} from "react";
import { useLocation, useNavigate } from "react-router";
import {
  SparkleIcon,
  PenNibIcon,
  FileTextIcon,
  FolderSimpleIcon,
  ImageIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  ArrowUpIcon,
  SlidersHorizontalIcon,
  PlusIcon,
  StopIcon,
  GearIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Persona } from "@/components/assistant/Persona";
import { motion, AnimatePresence } from "motion/react";
import {
  useAgent,
  type ChatMessage as AgentChatMessage,
  type ChatTurnInput,
} from "@/hooks/chat/useAgent";
import type { AgentConfig, PromptSegment } from "@memora/ai-core";
import { useStore, useClientDocument } from "@livestore/react";
import { type provider as ProviderRow } from "@/livestore/provider";
import { fileEvents, type file as LiveStoreFile } from "@/livestore/file";
import { type folder as LiveStoreFolder } from "@/livestore/folder";
import { settingsTable } from "@/livestore/setting";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
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
} from "@/lib/chat/chatSessionStorage";
import { createOpfsSessionPersistenceAdapter } from "@/lib/chat/opfsSessionPersistenceAdapter";
import { ConfirmDialog } from "@/components/desktop";
import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import {
  ReferencePicker,
  type ReferencePickerOption,
} from "@/components/chat/ReferencePicker";
import { StatusBar } from "@/components/chat/StatusBar";
import {
  createChatTools,
  EMPTY_REFERENCE_SCOPE,
  SYSTEM_PROMPT,
  type ResolvedReferenceScope,
  type WriteApprovalDecision,
  type WriteApprovalRequest,
} from "@/lib/chat/tools";
import { createShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import { ToolWriteApprovalDialog } from "@/components/chat/ToolWriteApprovalDialog";
import {
  chatActiveFilesQuery$,
  chatActiveFoldersQuery$,
  chatProvidersQuery$,
} from "@/lib/chat/queries";
import {
  MAX_CHAT_IMAGE_ATTACHMENTS,
  attachmentToChatInputImage,
  createLibraryChatImageAttachment,
  createLocalChatImageAttachment,
  deleteChatImageAttachmentAsset,
  getChatMessagePreviewText,
  resolveChatImageAttachmentBlob,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";
import { saveRecording } from "@/lib/library/fileService";
import {
  loadGlobalMemoryData,
  loadPersonalityDoc,
} from "@/lib/settings/personalityStorage";
import { BUILT_IN_SKILLS_PROMPT } from "@/lib/skills/builtInSkills";

interface SuggestionCard {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface ComposerNotice {
  type: "error" | "success" | "info";
  text: string;
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

const MAX_REFERENCED_FILES = 200;
const REFERENCE_MENTION_PATTERN = /@([^\s@]*)$/;

const toAgentMessages = (messages: ChatSessionMessage[]): AgentChatMessage[] => {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    widgets: message.widgets,
    thinkingSteps: message.thinkingSteps,
    usage: message.usage,
  }));
};

const toSessionSummary = (record: ChatSessionRecord): ChatSessionSummary => {
  const lastMessage = [...record.messages]
    .reverse()
    .find((message) => getChatMessagePreviewText(message).length > 0);
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    preview: lastMessage ? getChatMessagePreviewText(lastMessage) : "",
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
        attachments: message.attachments ?? [],
        widgets: message.widgets ?? [],
        thinkingSteps: message.thinkingSteps ?? [],
        ...(message.usage ? { usage: message.usage } : {}),
      })),
      references: references.map((reference) => ({
        type: reference.type,
        id: reference.id,
        name: reference.name,
      })),
    },
  );
};

const hasImageItems = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.items).some((item) => {
    return item.kind === "file" && item.type.startsWith("image/");
  });
};

const resolveTimeGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
};

const resolveGreetingName = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized;
};

const extractNameFromPersonalityMarkdown = (markdown: string): string | null => {
  const match = markdown.match(
    /^##\s+User\s+Identity\s*\n([\s\S]*?)(?=\n##\s+|$)/im,
  );
  if (!match) {
    return null;
  }

  const firstLine = match[1]
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  if (/^not\s+specified$/i.test(firstLine)) {
    return null;
  }

  return resolveGreetingName(firstLine);
};

const loadGreetingName = async (): Promise<string | null> => {
  const globalMemory = await loadGlobalMemoryData();
  const fromGlobalMemory = extractNameFromPersonalityMarkdown(
    globalMemory?.personality ?? "",
  );
  if (fromGlobalMemory) {
    return fromGlobalMemory;
  }

  const personalityDoc = await loadPersonalityDoc();
  return extractNameFromPersonalityMarkdown(personalityDoc ?? "");
};

export const Component = () => {
  const { store } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const activeFileRows = store.useQuery(chatActiveFilesQuery$) as LiveStoreFile[];
  const activeFolderRows = store.useQuery(chatActiveFoldersQuery$) as LiveStoreFolder[];
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
  const [settings] = useClientDocument(settingsTable);
  const { openSettings } = useSettingsDialog();
  const referenceScopeRef = useRef<ResolvedReferenceScope>(EMPTY_REFERENCE_SCOPE);
  const showWidgetSkillTracker = useMemo(
    () => createShowWidgetSkillTracker(),
    [],
  );
  const referencePromptSegment = useMemo<PromptSegment>(
    () => ({
      id: "reference-scope",
      priority: 90,
      content: () => buildReferenceScopePrompt(referenceScopeRef.current),
    }),
    [],
  );
  const promptSegments = useMemo(
    () => [SYSTEM_PROMPT, BUILT_IN_SKILLS_PROMPT, referencePromptSegment],
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
  const [memoryUpdatedNotice, setMemoryUpdatedNotice] = useState(false);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [pendingWriteApproval, setPendingWriteApproval] =
    useState<WriteApprovalRequest | null>(null);
  const [composerTextValue, setComposerTextValue] = useState("");
  const [composerImages, setComposerImages] = useState<ChatImageAttachment[]>([]);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerQuery, setImagePickerQuery] = useState("");
  const [composerNotice, setComposerNotice] = useState<ComposerNotice | null>(null);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [isPreparingTurn, setIsPreparingTurn] = useState(false);
  const [savingImageAttachmentIds, setSavingImageAttachmentIds] = useState<string[]>(
    [],
  );
  const persistedSignaturesRef = useRef<Map<string, string>>(new Map());
  const handledNewLocationKeyRef = useRef<string | null>(null);
  const pendingLocationSessionIdRef = useRef<string | null>(null);
  const sessionWriteApprovalRef = useRef<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerImagesRef = useRef<ChatImageAttachment[]>([]);
  const dragDepthRef = useRef(0);
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
  const activeImageRows = useMemo(
    () => activeFileRows.filter((file) => file.type === "image"),
    [activeFileRows],
  );
  const savingImageAttachmentIdSet = useMemo(
    () => new Set(savingImageAttachmentIds),
    [savingImageAttachmentIds],
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

  const imagePickerOptions = useMemo(() => {
    const normalizedQuery = imagePickerQuery.trim().toLowerCase();
    const selectedIds = new Set(
      composerImages
        .filter((attachment) => attachment.source === "library")
        .map((attachment) => attachment.fileId),
    );

    return activeImageRows
      .filter((file) => {
        if (!normalizedQuery) {
          return true;
        }

        return file.name.toLowerCase().includes(normalizedQuery);
      })
      .map((file) => ({
        file,
        isSelected: file.id ? selectedIds.has(file.id) : false,
      }))
      .slice(0, 40);
  }, [activeImageRows, composerImages, imagePickerQuery]);

  const remainingImageSlots = Math.max(
    0,
    MAX_CHAT_IMAGE_ATTACHMENTS - composerImages.length,
  );

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
          ? sorted.find((summary) => summary.id === initialRequestedSessionIdRef.current)
          : null;
        const initialSessionId =
          requestedSummary?.id ?? forcedSessionId ?? sorted[0]?.id;
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
        if (
          !requestedSummary ||
          initialCreateSessionRef.current ||
          !initialRequestedSessionIdRef.current
        ) {
          replaceChatLocation(initialSessionId);
        }
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
  }, [replaceChatLocation]);

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

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);

  useEffect(() => {
    if (!composerNotice) return;
    const timer = window.setTimeout(() => {
      setComposerNotice(null);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [composerNotice]);

  useEffect(() => {
    if (!memoryUpdatedNotice) return;
    const timer = window.setTimeout(() => {
      setMemoryUpdatedNotice(false);
    }, 4200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [memoryUpdatedNotice]);

  useEffect(() => {
    let cancelled = false;

    const hydrateGreetingName = async () => {
      const nextName = await loadGreetingName();
      if (!cancelled) {
        setGreetingName(nextName);
      }
    };

    void hydrateGreetingName();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistence = useMemo(() => {
    return activeSessionId
      ? createOpfsSessionPersistenceAdapter(activeSessionId)
      : undefined;
  }, [activeSessionId]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === settings.selectedProviderId) ?? null,
    [providers, settings.selectedProviderId],
  );
  const selectedModel = settings.selectedModel.trim();
  const selectedApiFormat = (
    selectedProvider?.apiFormat ?? "chat-completions"
  ) as "chat-completions" | "responses";
  const selectedApiKey = selectedProvider?.apiKey.trim() ?? "";
  const selectedEndpoint = useMemo(() => {
    if (!selectedProvider) return "";
    const baseUrl = selectedProvider.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) return "";
    return selectedApiFormat === "responses"
      ? `${baseUrl}/responses`
      : `${baseUrl}/chat/completions`;
  }, [selectedApiFormat, selectedProvider]);

  const agentConfig = useMemo((): Partial<AgentConfig> => {
    const sessionScopedAgentId = activeSessionId
      ? `memora-chat:${activeSessionId}`
      : "memora-chat:bootstrap";
    if (!selectedProvider || !selectedModel || !selectedEndpoint) {
      return {
        id: sessionScopedAgentId,
        model: "",
        endpoint: "",
        apiFormat: "chat-completions",
      };
    }
    return {
      id: sessionScopedAgentId,
      model: selectedModel,
      endpoint: selectedEndpoint,
      apiKey: selectedApiKey || undefined,
      apiFormat: selectedApiFormat,
    };
  }, [
    activeSessionId,
    selectedApiFormat,
    selectedApiKey,
    selectedEndpoint,
    selectedModel,
    selectedProvider,
  ]);

  const isConfigured = !!selectedProvider && !!selectedModel && !!selectedEndpoint;

  const tools = useMemo(
    () =>
      createChatTools(store, {
        getReferenceScope: () => referenceScopeRef.current,
        getMemoryExtractionConfig: () => {
          if (!isConfigured || !selectedApiKey) {
            return null;
          }

          return {
            apiFormat: selectedApiFormat,
            endpoint: selectedEndpoint,
            apiKey: selectedApiKey,
            model: selectedModel,
          };
        },
        onMemoryUpdated: () => {
          setMemoryUpdatedNotice(true);
        },
        requestWriteApproval,
        showWidgetSkillTracker,
      }),
    [
      isConfigured,
      requestWriteApproval,
      selectedApiFormat,
      selectedApiKey,
      selectedEndpoint,
      selectedModel,
      showWidgetSkillTracker,
      store,
    ],
  );

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
    updateMessage,
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
  const composerOverlayRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const latestMessagesRef = useRef(messages);
  const latestReferencesRef = useRef(activeReferences);
  const displayedMessages = messages;
  const hasMessages = displayedMessages.length > 0;
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const composerScrollInset = composerOverlayHeight > 0 ? composerOverlayHeight : 320;
  const composerFadeHeight = Math.min(
    Math.max(composerOverlayHeight + 40, 160),
    320,
  );
  const abort = useCallback(() => {
    resolveWriteApproval("deny");
    abortAgent();
  }, [abortAgent, resolveWriteApproval]);

  const closeImagePicker = useCallback(() => {
    setImagePickerOpen(false);
    setImagePickerQuery("");
    setComposerDragActive(false);
    dragDepthRef.current = 0;
  }, []);

  const cleanupComposerImages = useCallback((attachments: ChatImageAttachment[]) => {
    void Promise.all(
      attachments.map(async (attachment) => {
        await deleteChatImageAttachmentAsset(attachment);
      }),
    );
  }, []);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    latestReferencesRef.current = activeReferences;
  }, [activeReferences]);

  useEffect(() => {
    const behavior =
      displayedMessages.length > previousMessageCountRef.current ? "smooth" : "auto";
    previousMessageCountRef.current = displayedMessages.length;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [displayedMessages.length, isStreaming, thinkingSteps]);

  useEffect(() => {
    const overlayElement = composerOverlayRef.current;
    if (!overlayElement) {
      return;
    }

    const measureOverlay = () => {
      const nextHeight = Math.ceil(overlayElement.getBoundingClientRect().height);
      setComposerOverlayHeight((currentHeight) => {
        return currentHeight === nextHeight ? currentHeight : nextHeight;
      });
    };

    measureOverlay();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureOverlay);
      return () => {
        window.removeEventListener("resize", measureOverlay);
      };
    }

    const observer = new ResizeObserver(() => {
      measureOverlay();
    });
    observer.observe(overlayElement);
    window.addEventListener("resize", measureOverlay);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureOverlay);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  useEffect(() => {
    showWidgetSkillTracker.resetTurn();
  }, [activeSessionId, showWidgetSkillTracker]);

  useEffect(() => {
    cleanupComposerImages(composerImagesRef.current);
    setComposerTextValue("");
    setComposerImages([]);
    setImagePickerOpen(false);
    setImagePickerQuery("");
    setComposerNotice(null);
    setComposerDragActive(false);
    setIsPreparingTurn(false);
    dragDepthRef.current = 0;
  }, [activeSessionId, cleanupComposerImages]);

  useEffect(() => {
    sessionWriteApprovalRef.current = null;
    if (writeApprovalResolverRef.current) {
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver("deny");
    }
    setPendingWriteApproval(null);
    setMemoryUpdatedNotice(false);
  }, [activeSessionId]);

  useEffect(() => {
    return () => {
      cleanupComposerImages(composerImagesRef.current);
      const resolver = writeApprovalResolverRef.current;
      writeApprovalResolverRef.current = null;
      resolver?.("deny");
    };
  }, [cleanupComposerImages]);

  useEffect(() => {
    if (
      !sessionsReady ||
      !activeSessionId ||
      isStreaming ||
      isPreparingTurn
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      const nextMessages = latestMessagesRef.current;
      const nextReferences = latestReferencesRef.current;
      const signature = buildSessionSignature(nextMessages, nextReferences);
      const persistedSignature = persistedSignaturesRef.current.get(activeSessionId);
      if (persistedSignature === signature) {
        return;
      }

      void updateChatSessionMessages(activeSessionId, nextMessages, {
        references: nextReferences,
      })
        .then((record) => {
          const summary = toSessionSummary(record);
          persistedSignaturesRef.current.set(
            activeSessionId,
            buildSessionSignature(nextMessages, record.references),
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
  }, [
    activeReferences,
    activeSessionId,
    isPreparingTurn,
    isStreaming,
    messages,
    sessionsReady,
  ]);

  const handleCreateSession = useCallback(async () => {
    if (!sessionsReady || isPreparingTurn) return;
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
    replaceChatLocation(created.id);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [abort, isPreparingTurn, isStreaming, replaceChatLocation, sessionsReady]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionsReady || isPreparingTurn) return;
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
      replaceChatLocation(session.id);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [
      abort,
      activeSessionId,
      isPreparingTurn,
      isStreaming,
      replaceChatLocation,
      sessionsReady,
    ],
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
      if (!sessionsReady || isPreparingTurn) return;
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
          replaceChatLocation(created.id);
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
        replaceChatLocation(nextSessionId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete chat session.";
        setSessionsError(message);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [
      abort,
      activeSessionId,
      isPreparingTurn,
      isStreaming,
      replaceChatLocation,
      sessions,
      sessionsReady,
    ],
  );

  useEffect(() => {
    if (!sessionsReady || !shouldCreateSessionFromUrl) return;
    if (handledNewLocationKeyRef.current === location.key) return;
    handledNewLocationKeyRef.current = location.key;
    void handleCreateSession();
  }, [
    handleCreateSession,
    location.key,
    sessionsReady,
    shouldCreateSessionFromUrl,
  ]);

  useEffect(() => {
    if (!sessionsReady || !activeSessionId) return;
    if (shouldCreateSessionFromUrl) return;

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
    closeImagePicker();
    setReferencePickerOpen(true);
    setReferencePickerQuery("");
    setReferencePickerSource("button");
  }, [closeImagePicker, closeReferencePicker, referencePickerOpen, referencePickerSource]);

  const pushComposerImages = useCallback((nextAttachments: ChatImageAttachment[]) => {
    if (nextAttachments.length === 0) {
      return;
    }

    setComposerImages((prev) => {
      const remainingSlots = MAX_CHAT_IMAGE_ATTACHMENTS - prev.length;
      if (remainingSlots <= 0) {
        setComposerNotice({
          type: "error",
          text: `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images per message.`,
        });
        return prev;
      }

      const accepted = nextAttachments.slice(0, remainingSlots);
      if (accepted.length < nextAttachments.length) {
        setComposerNotice({
          type: "info",
          text: `Only the first ${MAX_CHAT_IMAGE_ATTACHMENTS} images were kept.`,
        });
      }

      return [...prev, ...accepted];
    });
  }, []);

  const addLocalImagesToComposer = useCallback(
    async (files: File[]) => {
      if (!activeSessionId) {
        return;
      }

      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        setComposerNotice({
          type: "error",
          text: "Only image files can be attached.",
        });
        return;
      }

      const remainingSlots = Math.max(
        0,
        MAX_CHAT_IMAGE_ATTACHMENTS - composerImagesRef.current.length,
      );
      if (remainingSlots === 0) {
        setComposerNotice({
          type: "error",
          text: `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images per message.`,
        });
        return;
      }

      const filesToAttach = imageFiles.slice(0, remainingSlots);
      if (filesToAttach.length < imageFiles.length) {
        setComposerNotice({
          type: "info",
          text: `Only the first ${MAX_CHAT_IMAGE_ATTACHMENTS} images were kept.`,
        });
      }

      const nextAttachments: ChatImageAttachment[] = [];
      const errors: string[] = [];
      for (const file of filesToAttach) {
        try {
          const attachment = await createLocalChatImageAttachment(activeSessionId, file);
          nextAttachments.push(attachment);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      pushComposerImages(nextAttachments);
      setImagePickerOpen(true);

      if (errors.length > 0) {
        setComposerNotice({
          type: "error",
          text: errors[0] ?? "Could not attach that image.",
        });
      }
    },
    [activeSessionId, pushComposerImages],
  );

  const handleImageButtonClick = useCallback(() => {
    if (imagePickerOpen) {
      closeImagePicker();
      inputRef.current?.focus();
      return;
    }

    closeReferencePicker();
    setImagePickerOpen(true);
    setImagePickerQuery("");
  }, [closeImagePicker, closeReferencePicker, imagePickerOpen]);

  const handleOpenLocalImagePicker = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      void addLocalImagesToComposer(files);
    },
    [addLocalImagesToComposer],
  );

  const handleSelectLibraryImage = useCallback(
    (file: LiveStoreFile) => {
      if (
        composerImagesRef.current.some(
          (attachment) =>
            attachment.source === "library" && attachment.fileId === file.id,
        )
      ) {
        setComposerNotice({
          type: "info",
          text: `"${file.name}" is already attached.`,
        });
        return;
      }

      try {
        const attachment = createLibraryChatImageAttachment(file);
        pushComposerImages([attachment]);
        setImagePickerOpen(true);
      } catch (error) {
        setComposerNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Could not attach that image.",
        });
      }
    },
    [pushComposerImages],
  );

  const handleRemoveComposerImage = useCallback(
    (attachmentId: string) => {
      const nextAttachment = composerImagesRef.current.find(
        (attachment) => attachment.id === attachmentId,
      );
      if (nextAttachment) {
        cleanupComposerImages([nextAttachment]);
      }

      setComposerImages((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    },
    [cleanupComposerImages],
  );

  const handleComposerPaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void addLocalImagesToComposer(imageFiles);
    },
    [addLocalImagesToComposer],
  );

  const handleComposerDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasImageItems(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setComposerDragActive(true);
      setImagePickerOpen(true);
    },
    [],
  );

  const handleComposerDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleComposerDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasImageItems(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setComposerDragActive(false);
    }
  }, []);

  const handleComposerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasImageItems(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current = 0;
      setComposerDragActive(false);
      void addLocalImagesToComposer(Array.from(event.dataTransfer.files));
    },
    [addLocalImagesToComposer],
  );

  const handleSaveImageToLibrary = useCallback(
    async (messageId: string, attachmentId: string) => {
      const targetMessage = messages.find((message) => message.id === messageId);
      const targetAttachment = targetMessage?.attachments?.find(
        (attachment) => attachment.id === attachmentId,
      );

      if (!targetAttachment || targetAttachment.source !== "local" || targetAttachment.savedFileId) {
        return;
      }

      setSavingImageAttachmentIds((prev) => [...prev, attachmentId]);

      try {
        const blob = await resolveChatImageAttachmentBlob(targetAttachment);
        if (!blob) {
          throw new Error(`Couldn't load "${targetAttachment.name}".`);
        }

        const result = await saveRecording({
          blob,
          name: targetAttachment.name,
          type: "image",
          mimeType: targetAttachment.mimeType,
          createdAt: Date.now(),
        });

        store.commit(
          fileEvents.fileCreated({
            id: result.id,
            name: result.meta.name,
            type: result.meta.type,
            mimeType: result.meta.mimeType,
            sizeBytes: result.meta.sizeBytes,
            storageType: result.meta.storageType,
            storagePath: result.meta.storagePath,
            parentId: result.meta.parentId ?? null,
            positionX: result.meta.positionX ?? null,
            positionY: result.meta.positionY ?? null,
            createdAt: new Date(result.meta.createdAt),
          }),
        );

        updateMessage(messageId, (message) => ({
          ...message,
          attachments: message.attachments?.map((attachment) =>
            attachment.id === attachmentId
              ? { ...attachment, savedFileId: result.id }
              : attachment,
          ),
        }));
        setComposerNotice({
          type: "success",
          text: `Saved "${targetAttachment.name}" to your library.`,
        });
      } catch (error) {
        setComposerNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Could not save that image.",
        });
      } finally {
        setSavingImageAttachmentIds((prev) => {
          return prev.filter((id) => id !== attachmentId);
        });
      }
    },
    [messages, store, updateMessage],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setComposerTextValue(value);
      const mentionMatch = value.match(REFERENCE_MENTION_PATTERN);
      if (mentionMatch) {
        closeImagePicker();
        setReferencePickerOpen(true);
        setReferencePickerSource("mention");
        setReferencePickerQuery(mentionMatch[1] ?? "");
        return;
      }
      if (referencePickerSource === "mention") {
        closeReferencePicker();
      }
    },
    [closeImagePicker, closeReferencePicker, referencePickerSource],
  );

  const prepareReferenceScopeForTurn = useCallback(() => {
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
  }, [
    activeFileById,
    activeFileRows,
    activeFolderById,
    activeFolderRows,
    activeReferences,
  ]);

  const startAgentTurn = useCallback(
    async (turnInput: string | ChatTurnInput) => {
      await send(turnInput);
    },
    [send],
  );

  const submitMessage = useCallback(async () => {
    if (!sessionsReady || !activeSessionId || isPreparingTurn) {
      return;
    }

    const trimmed = inputRef.current?.value.trim() ?? "";
    const nextComposerImages = composerImagesRef.current;
    if ((trimmed.length === 0 && nextComposerImages.length === 0) || isStreaming) {
      return;
    }

    if (!isConfigured) {
      openSettings("ai-provider");
      return;
    }

    prepareReferenceScopeForTurn();

    let turnInput: string | ChatTurnInput = trimmed;
    if (nextComposerImages.length > 0) {
      setIsPreparingTurn(true);

      try {
        const images = await Promise.all(
          nextComposerImages.map((attachment) => attachmentToChatInputImage(attachment)),
        );
        turnInput = {
          text: trimmed,
          images,
        };
      } catch (error) {
        setComposerNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Could not attach those images.",
        });
        setIsPreparingTurn(false);
        return;
      }
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setComposerTextValue("");
    setComposerImages([]);
    setUserToggled(false);
    closeReferencePicker();
    closeImagePicker();

    try {
      await startAgentTurn(turnInput);
    } finally {
      setIsPreparingTurn(false);
    }
  }, [
    activeSessionId,
    closeImagePicker,
    closeReferencePicker,
    isConfigured,
    isPreparingTurn,
    isStreaming,
    openSettings,
    prepareReferenceScopeForTurn,
    sessionsReady,
    startAgentTurn,
  ]);

  const handleWidgetPrompt = useCallback(
    async (text: string) => {
      if (!sessionsReady || !activeSessionId || isPreparingTurn || isStreaming) {
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      if (!isConfigured) {
        openSettings("ai-provider");
        return;
      }

      prepareReferenceScopeForTurn();
      setUserToggled(false);
      await startAgentTurn(trimmed);
    },
    [
      activeSessionId,
      isConfigured,
      isPreparingTurn,
      isStreaming,
      openSettings,
      prepareReferenceScopeForTurn,
      sessionsReady,
      startAgentTurn,
    ],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitMessage();
  };

  const handleSuggestionClick = (suggestion: SuggestionCard) => {
    if (inputRef.current) {
      inputRef.current.value = suggestion.title;
      inputRef.current.focus();
    }
    setComposerTextValue(suggestion.title);
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
    if (e.key === "Escape" && imagePickerOpen) {
      e.preventDefault();
      closeImagePicker();
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
  const canSubmitMessage =
    !isStreaming &&
    !isPreparingTurn &&
    (composerTextValue.trim().length > 0 || composerImages.length > 0);
  const timeGreeting = useMemo(() => resolveTimeGreeting(new Date()), []);
  const onboardingGreetingName = resolveGreetingName(settings.onboardingName);
  const effectiveGreetingName = onboardingGreetingName ?? greetingName;
  const greetingTitle = effectiveGreetingName
    ? `${timeGreeting}, ${effectiveGreetingName}. What can I help you with today?`
    : `${timeGreeting}. What can I help you with today?`;

  const handleOpenHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(true);
  }, []);

  const handleCloseHistoryDrawer = useCallback(() => {
    setIsHistoryDrawerOpen(false);
  }, []);

  const handleCreateSessionFromPanel = useCallback(() => {
    void handleCreateSession();
  }, [handleCreateSession]);

  const handleSelectSessionFromPanel = useCallback(
    (sessionId: string) => {
      void handleSelectSession(sessionId);
    },
    [handleSelectSession],
  );

  const isHistoryPanelBusy = isStreaming || isPreparingTurn;

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
            isStreaming={isHistoryPanelBusy}
            deletingSessionId={deletingSessionId}
            onCreateSession={handleCreateSessionFromPanel}
            onSelectSession={handleSelectSessionFromPanel}
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

          <div className="relative flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-6"
                style={{ paddingBottom: composerScrollInset }}
              >
                {hasMessages ? (
                  <div className="w-full space-y-4">
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
                          savingAttachmentIds={savingImageAttachmentIdSet}
                          onSaveImageToLibrary={handleSaveImageToLibrary}
                          onSendWidgetPrompt={handleWidgetPrompt}
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
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                    <div className="flex flex-col items-center gap-4">
                      {sessionsError && (
                        <p className="text-center text-xs text-red-600">
                          {sessionsError}
                        </p>
                      )}
                      <Persona state="idle" className="size-20" />
                      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                        {greetingTitle}
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

                    <AnimatePresence>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.2 }}
                        className="mt-8 grid w-full grid-cols-2 gap-2.5"
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
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#fffbf2] via-[#fffbf2]/90 to-transparent z-0"
                style={{ height: composerFadeHeight }}
              />
              <div ref={composerOverlayRef} className="px-4 pb-6 pt-16">
                <div className="pointer-events-auto mx-auto max-w-2xl">
              <AnimatePresence>
                {isStreaming &&
                  status.type !== "idle" &&
                  status.type !== "generating" && <StatusBar status={status} />}
              </AnimatePresence>
              {memoryUpdatedNotice && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <span>
                    Memory updated. Review or delete it in Settings &gt; Memory.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSettings("memory")}
                      className="font-semibold text-emerald-800 transition hover:text-emerald-900"
                    >
                      Open settings
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemoryUpdatedNotice(false)}
                      className="text-emerald-600 transition hover:text-emerald-800"
                      aria-label="Dismiss memory update notice"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              )}
              {composerNotice && (
                <div
                  className={`mb-2 rounded-xl border px-3 py-2 text-xs ${
                    composerNotice.type === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : composerNotice.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                  }`}
                >
                  {composerNotice.text}
                </div>
              )}
              {referenceNotice && (
                <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {referenceNotice}
                </p>
              )}
              {composerImages.length > 0 && (
                <div className="mb-2 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-3.5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        Attached images
                      </p>
                      <p className="text-xs text-zinc-500">
                        {composerImages.length} of {MAX_CHAT_IMAGE_ATTACHMENTS} ready to send
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenLocalImagePicker}
                        disabled={!sessionsReady || remainingImageSlots === 0}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setImagePickerOpen((value) => !value)}
                        disabled={!sessionsReady}
                        className="rounded-full border border-zinc-200 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {imagePickerOpen ? "Hide library" : "Browse library"}
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <ChatImageAttachmentGallery
                      attachments={composerImages}
                      tone="composer"
                      onRemove={handleRemoveComposerImage}
                    />
                  </div>
                </div>
              )}
              {imagePickerOpen && (
                <div className="mb-2 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-200/70 px-3.5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">Add images</p>
                      <p className="text-xs text-zinc-500">
                        Paste, drop, upload, or pick from your library. {remainingImageSlots} slot{remainingImageSlots === 1 ? "" : "s"} left.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenLocalImagePicker}
                        disabled={!sessionsReady || remainingImageSlots === 0}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Upload image
                      </button>
                      <button
                        type="button"
                        onClick={closeImagePicker}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <ImageIcon className="size-4 text-zinc-400" />
                      <input
                        value={imagePickerQuery}
                        onChange={(event) => setImagePickerQuery(event.target.value)}
                        placeholder="Search library images..."
                        className="h-7 min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
                      />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {imagePickerOptions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500 sm:col-span-2">
                          No matching images in your library.
                        </div>
                      ) : (
                        imagePickerOptions.map(({ file, isSelected }) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => handleSelectLibraryImage(file)}
                            disabled={isSelected || remainingImageSlots === 0}
                            className={`rounded-2xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                            } disabled:cursor-not-allowed disabled:opacity-55`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{file.name}</p>
                                <p className={`mt-1 text-[11px] ${isSelected ? "text-zinc-200" : "text-zinc-500"}`}>
                                  {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                                </p>
                              </div>
                              {isSelected && (
                                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white">
                                  Added
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
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
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageInputChange}
              />
              <form onSubmit={handleSubmit}>
                <div
                  className={`group relative rounded-xl border bg-white/90 shadow-[0_24px_60px_-28px_rgba(24,24,27,0.35)] backdrop-blur-xl transition-colors focus-within:border-zinc-300 focus-within:shadow-[0_28px_70px_-28px_rgba(24,24,27,0.42)] ${
                    composerDragActive
                      ? "border-zinc-900 ring-2 ring-zinc-900/10"
                      : "border-zinc-200/80"
                  }`}
                  onDragEnter={handleComposerDragEnter}
                  onDragOver={handleComposerDragOver}
                  onDragLeave={handleComposerDragLeave}
                  onDrop={handleComposerDrop}
                >
                  {composerDragActive && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed border-zinc-900/20 bg-zinc-900/5 px-6 text-center text-sm font-medium text-zinc-700">
                      Drop images here to attach them
                    </div>
                  )}
                  <textarea
                    ref={inputRef}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handleComposerPaste}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder="Message Memora..."
                    disabled={isPreparingTurn}
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  />
                  <div className="flex items-center justify-between px-3 pb-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCreateSession()}
                        disabled={!sessionsReady || isPreparingTurn}
                        className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title="New session"
                      >
                        <PlusIcon className="size-4" weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={handleImageButtonClick}
                        disabled={!sessionsReady || isPreparingTurn}
                        className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                          imagePickerOpen || composerImages.length > 0
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                        title="Attach images"
                      >
                        <ImageIcon className="size-4" weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={handleReferenceButtonClick}
                        disabled={!sessionsReady || isPreparingTurn}
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
                        disabled={!canSubmitMessage}
                        className={`flex size-7 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                          canSubmitMessage
                            ? "bg-zinc-900 text-white hover:bg-zinc-800"
                            : "bg-zinc-200 text-zinc-400"
                        }`}
                      >
                        <ArrowUpIcon className="size-3.5" weight="bold" />
                      </button>
                    )}
                  </div>
                </div>
              </form>
                </div>
              </div>
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
                isStreaming={isHistoryPanelBusy}
                deletingSessionId={deletingSessionId}
                onCreateSession={handleCreateSessionFromPanel}
                onSelectSession={handleSelectSessionFromPanel}
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
