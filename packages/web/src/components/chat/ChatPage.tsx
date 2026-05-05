import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@livestore/react";
import type { provider as ProviderRow } from "@/livestore/provider";
import { type file as LiveStoreFile } from "@/livestore/file";
import { type folder as LiveStoreFolder } from "@/livestore/folder";
import { type setting } from "@/livestore/setting";
import { useAgent } from "@/hooks/chat/useAgent";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { createOpfsSessionPersistenceAdapter } from "@/lib/chat/opfsSessionPersistenceAdapter";
import { createChatTools, SYSTEM_PROMPT } from "@/lib/chat/tools";
import { createShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import {
  chatActiveFilesQuery$,
  chatActiveFoldersQuery$,
  chatProvidersQuery$,
} from "@/lib/chat/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import {
  DEFAULT_CHAT_SESSION_TITLE,
  updateChatSession,
  updateChatSessionMessages,
} from "@/lib/chat/chatSessionStorage";
import { generateChatSessionTitle } from "@/lib/chat/chatSessionTitleGenerator";
import { BUILT_IN_SKILLS_PROMPT } from "@/lib/skills/builtInSkills";
import {
  buildSessionSignature,
  loadGreetingName,
  resolveGreetingName,
  resolveTimeGreeting,
} from "@/components/chat/chatPage/helpers";
import { useChatModelConfig } from "@/components/chat/chatPage/useChatModelConfig";
import { useChatComposerImages } from "@/components/chat/chatPage/useChatComposerImages";
import { useChatReferences } from "@/components/chat/chatPage/useChatReferences";
import { useChatSessions } from "@/components/chat/chatPage/useChatSessions";
import { useChatTurnActions } from "@/components/chat/chatPage/useChatTurnActions";
import { useChatWriteApproval } from "@/components/chat/chatPage/useChatWriteApproval";
import { ChatPageView } from "@/components/chat/chatPage/ChatPageView";
import { ONBOARDING_GEMMA_MODEL_ID } from "@/lib/onboarding/onboardingGate";

export const Component = () => {
  const { store } = useStore();
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const { openSettings } = useSettingsDialog();
  const openSettingsPanel = useCallback(
    (section?: string) => {
      openSettings((section as Parameters<typeof openSettings>[0] | undefined) ?? "general");
    },
    [openSettings],
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerOverlayRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const isStreamingRef = useRef(false);
  const isPreparingTurnRef = useRef(false);
  const titleGenerationSessionIdsRef = useRef<Set<string>>(new Set());
  const abortStreamingRef = useRef<() => void>(() => {});
  const closeImagePickerRef = useRef<() => void>(() => {});
  const [composerOverlayHeight, setComposerOverlayHeight] = useState(0);
  const [memoryUpdatedNotice, setMemoryUpdatedNotice] = useState(false);
  const [greetingName, setGreetingName] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const providers = store.useQuery(chatProvidersQuery$) as ProviderRow[];
  const activeFileRows = store.useQuery(chatActiveFilesQuery$) as LiveStoreFile[];
  const activeFolderRows = store.useQuery(chatActiveFoldersQuery$) as LiveStoreFolder[];
  const activeImageRows = useMemo(() => {
    return activeFileRows.filter((file) => file.type === "image");
  }, [activeFileRows]);
  const titleMetadataKey = "chat-session-title";
  const showWidgetSkillTracker = useMemo(() => {
    return createShowWidgetSkillTracker();
  }, []);

  const {
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
    updatePersistedSessionSummary,
    deletingSessionId,
    pendingDeleteSessionId,
    handleCreateSession,
    handleSelectSession,
    handlePromptDeleteSession,
    handleCancelDeleteSession,
    handleConfirmDeleteSession,
  } = useChatSessions({
    getIsPreparingTurn: () => isPreparingTurnRef.current,
    getIsStreaming: () => isStreamingRef.current,
    inputRef,
    onAbortStreaming: () => abortStreamingRef.current(),
  });
  const {
    pendingWriteApproval,
    requestWriteApproval,
    resolveWriteApproval,
    handleAllowWriteOnce,
    handleAllowWriteForSession,
    handleDenyWrite,
  } = useChatWriteApproval(activeSessionId);

  const references = useChatReferences({
    activeSessionId,
    activeReferences,
    setActiveReferences,
    activeFileRows,
    activeFolderRows,
    inputRef,
    onCloseImagePicker: () => closeImagePickerRef.current(),
  });

  const remotePromptSegments = useMemo(() => {
    return [SYSTEM_PROMPT, BUILT_IN_SKILLS_PROMPT, references.referencePromptSegment];
  }, [references.referencePromptSegment]);

  const persistence = useMemo(() => {
    return activeSessionId ? createOpfsSessionPersistenceAdapter(activeSessionId) : undefined;
  }, [activeSessionId]);

  const {
    agentConfig,
    provider,
    isConfigured,
    selectedApiFormat,
    selectedApiKey,
    selectedEndpoint,
    selectedModel,
    selectedModelInfo,
  } = useChatModelConfig({
    providers,
    settings,
    activeSessionId,
  });

  const remoteTools = useMemo(
    () =>
      createChatTools(store, {
        getReferenceScope: references.getReferenceScope,
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
      references.getReferenceScope,
      requestWriteApproval,
      selectedApiFormat,
      selectedApiKey,
      selectedEndpoint,
      selectedModel,
      showWidgetSkillTracker,
      store,
    ],
  );

  const activePromptSegments = remotePromptSegments;
  const activeTools = remoteTools;

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
    reset: resetAgent,
    updateMessage,
  } = useAgent({
    sessionId: activeSessionId || "bootstrap",
    initialMessages: activeSessionInitialMessages,
    config: agentConfig,
    provider,
    promptSegments: activePromptSegments,
    tools: activeTools,
    persistence,
  });

  const abort = useCallback(() => {
    resolveWriteApproval("deny");
    abortAgent();
  }, [abortAgent, resolveWriteApproval]);
  abortStreamingRef.current = abort;
  isStreamingRef.current = isStreaming;

  const composerImages = useChatComposerImages({
    activeSessionId,
    activeImageRows,
    messages,
    store,
    updateMessage,
  });
  closeImagePickerRef.current = composerImages.closeImagePicker;

  const turnActions = useChatTurnActions({
    activeSessionId,
    sessionsReady,
    isStreaming,
    isConfigured,
    openSettings: openSettingsPanel,
    inputRef,
    messages,
    composerImages: composerImages.composerImages,
    composerImagesRef: composerImages.composerImagesRef,
    setComposerImages: composerImages.setComposerImages,
    setComposerNotice: composerImages.setComposerNotice,
    closeReferencePicker: references.closeReferencePicker,
    closeImagePicker: composerImages.closeImagePicker,
    onComposerInputValueChange: references.handleComposerInputValueChange,
    prepareReferenceScopeForTurn: references.prepareReferenceScopeForTurn,
    send,
    resetAgent,
    setActiveSessionInitialMessages,
    thinkingCollapsed,
  });
  isPreparingTurnRef.current = turnActions.isPreparingTurn;

  useEffect(() => {
    setMemoryUpdatedNotice(false);
  }, [activeSessionId]);

  useEffect(() => {
    if (!memoryUpdatedNotice) {
      return;
    }
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

  useEffect(() => {
    const behavior = messages.length > previousMessageCountRef.current ? "smooth" : "auto";
    previousMessageCountRef.current = messages.length;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [messages.length, isStreaming, thinkingSteps]);

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
    if (!sessionsReady || !activeSessionId || isStreaming || turnActions.isPreparingTurn) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const signature = buildSessionSignature(messages, activeReferences);
      const persistedSignature = persistedSignaturesRef.current.get(activeSessionId);
      if (persistedSignature === signature) {
        return;
      }

      void updateChatSessionMessages(activeSessionId, messages, {
        references: activeReferences,
      })
        .then((record) => {
          commitPersistedSession(record, messages);

          const shouldGenerateTitle =
            ONBOARDING_GEMMA_MODEL_ID.trim().length > 0 &&
            record.messages.some((message) => message.role === "user") &&
            record.title !== DEFAULT_CHAT_SESSION_TITLE &&
            record.agentStore[titleMetadataKey]?.generated !== true &&
            !titleGenerationSessionIdsRef.current.has(activeSessionId);

          if (!shouldGenerateTitle) {
            return;
          }

          titleGenerationSessionIdsRef.current.add(activeSessionId);
          void generateChatSessionTitle({
            messages,
            modelId: ONBOARDING_GEMMA_MODEL_ID,
          })
            .then(async (title) => {
              if (!title) return null;
              return updateChatSession(activeSessionId, (session) => ({
                ...session,
                title,
                agentStore: {
                  ...session.agentStore,
                  [titleMetadataKey]: {
                    generated: true,
                    generatedAt: Date.now(),
                  },
                },
              }));
            })
            .then((updatedRecord) => {
              if (updatedRecord) {
                updatePersistedSessionSummary(updatedRecord);
              }
            })
            .catch((titleError) => {
              titleGenerationSessionIdsRef.current.delete(activeSessionId);
              console.warn("Failed to generate chat session title:", titleError);
            });
        })
        .catch((persistError) => {
          console.error("Failed to persist chat session:", persistError);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeReferences,
    activeSessionId,
    commitPersistedSession,
    isStreaming,
    messages,
    persistedSignaturesRef,
    sessionsReady,
    turnActions.isPreparingTurn,
    updatePersistedSessionSummary,
  ]);

  const displayedMessages = messages;
  const hasMessages = displayedMessages.length > 0;
  const composerScrollInset = composerOverlayHeight > 0 ? composerOverlayHeight : 320;
  const composerFadeHeight = Math.min(Math.max(composerOverlayHeight + 40, 160), 320);
  const activeSessionTitle =
    sessions.find((session) => session.id === activeSessionId)?.title ?? "Select a session";
  const timeGreeting = useMemo(() => resolveTimeGreeting(new Date()), []);
  const onboardingGreetingName = resolveGreetingName(settings.onboardingName);
  const effectiveGreetingName = onboardingGreetingName ?? greetingName;
  const greetingTitle = effectiveGreetingName
    ? `${timeGreeting}, ${effectiveGreetingName}. What can I help you with today?`
    : `${timeGreeting}. What can I help you with today?`;
  const isHistoryPanelBusy = isStreaming || turnActions.isPreparingTurn;

  return (
    <ChatPageView
      sessions={sessions}
      activeSessionId={activeSessionId}
      activeSessionTitle={activeSessionTitle}
      isHistoryPanelBusy={isHistoryPanelBusy}
      deletingSessionId={deletingSessionId}
      sessionsReady={sessionsReady}
      sessionsError={sessionsError}
      composerScrollInset={composerScrollInset}
      isStreaming={isStreaming}
      status={status}
      thinkingSteps={thinkingSteps}
      panelCollapsed={turnActions.panelCollapsed}
      hasMessages={hasMessages}
      lastAssistantId={turnActions.lastAssistantId}
      retryableAssistantIds={turnActions.retryableAssistantIds}
      isPreparingTurn={turnActions.isPreparingTurn}
      savingAttachmentIds={composerImages.savingImageAttachmentIdSet}
      iterationLimitPrompt={iterationLimitPrompt}
      error={error}
      messagesEndRef={messagesEndRef}
      greetingTitle={greetingTitle}
      isConfigured={isConfigured}
      onSaveImageToLibrary={composerImages.handleSaveImageToLibrary}
      onSendWidgetPrompt={turnActions.handleWidgetPrompt}
      onEditMessage={turnActions.handleEditMessage}
      onRetryMessage={turnActions.handleRetryMessage}
      onToggleThinking={turnActions.handleToggleThinking}
      onContinueAfterIterationLimit={continueAfterIterationLimit}
      onDismissIterationLimitPrompt={dismissIterationLimitPrompt}
      onOpenSettings={openSettingsPanel}
      onSuggestionClick={turnActions.handleSuggestionClick}
      composerPanelProps={{
        composerFadeHeight,
        composerOverlayRef,
        isStreaming,
        status,
        memoryUpdatedNotice,
        composerNotice: composerImages.composerNotice,
        referenceNotice: references.referenceNotice,
        composerImages: composerImages.composerImages,
        remainingImageSlots: composerImages.remainingImageSlots,
        sessionsReady,
        imagePickerOpen: composerImages.imagePickerOpen,
        imagePickerQuery: composerImages.imagePickerQuery,
        imagePickerOptions: composerImages.imagePickerOptions,
        activeReferences,
        resolvedReferenceScope: references.resolvedReferenceScope,
        referencePickerOpen: references.referencePickerOpen,
        referencePickerQuery: references.referencePickerQuery,
        referencePickerOptions: references.referencePickerOptions,
        referencePickerSource: references.referencePickerSource,
        imageInputRef: composerImages.imageInputRef,
        inputRef,
        composerDragActive: composerImages.composerDragActive,
        isPreparingTurn: turnActions.isPreparingTurn,
        composerTextValue: turnActions.composerTextValue,
        canSubmitMessage: turnActions.canSubmitMessage,
        messages,
        selectedModelInfo,
        selectedModel,
        onOpenSettings: openSettingsPanel,
        onDismissMemoryNotice: () => setMemoryUpdatedNotice(false),
        onOpenLocalImagePicker: composerImages.handleOpenLocalImagePicker,
        onCloseImagePicker: composerImages.closeImagePicker,
        onImagePickerQueryChange: composerImages.setImagePickerQuery,
        onSelectLibraryImage: composerImages.handleSelectLibraryImage,
        onClearReferences: references.handleClearReferences,
        onRemoveReference: references.handleRemoveReference,
        onReferencePickerQueryChange: references.setReferencePickerQuery,
        onSelectReference: references.handleSelectReference,
        onImageInputChange: composerImages.handleImageInputChange,
        onSubmit: turnActions.handleSubmit,
        onDragEnter: composerImages.handleComposerDragEnter,
        onDragOver: composerImages.handleComposerDragOver,
        onDragLeave: composerImages.handleComposerDragLeave,
        onDrop: composerImages.handleComposerDrop,
        onInputChange: turnActions.handleInputChange,
        onKeyDown: turnActions.handleKeyDown,
        onPaste: composerImages.handleComposerPaste,
        onCompositionStart: turnActions.handleCompositionStart,
        onCompositionEnd: turnActions.handleCompositionEnd,
        onCreateSession: () => void handleCreateSession(),
        onImageButtonClick: () =>
          composerImages.handleImageButtonClick(references.closeReferencePicker),
        onReferenceButtonClick: references.handleReferenceButtonClick,
        onAbort: abort,
        onRemoveComposerImage: composerImages.handleRemoveComposerImage,
      }}
      isHistoryDrawerOpen={isHistoryDrawerOpen}
      pendingWriteApproval={pendingWriteApproval}
      onAllowWriteOnce={handleAllowWriteOnce}
      onAllowWriteForSession={handleAllowWriteForSession}
      onDenyWrite={handleDenyWrite}
      pendingDeleteSessionId={pendingDeleteSessionId}
      onCreateSession={() => void handleCreateSession()}
      onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
      onDeleteSession={handlePromptDeleteSession}
      onCancelDeleteSession={handleCancelDeleteSession}
      onConfirmDeleteSession={(sessionId) => {
        void handleConfirmDeleteSession(sessionId);
      }}
      onOpenHistoryDrawer={() => setIsHistoryDrawerOpen(true)}
      onCloseHistoryDrawer={() => setIsHistoryDrawerOpen(false)}
    />
  );
};
