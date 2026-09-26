import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/livestore/store";
import type { provider as ProviderRow } from "@/livestore/provider";
import { type file as LiveStoreFile } from "@/livestore/file";
import { type folder as LiveStoreFolder } from "@/livestore/folder";
import { type setting } from "@/livestore/setting";
import { useAgent } from "@/hooks/chat/useAgent";
import { useSettingsDialog } from "@/hooks/settings/useSettingsDialog";
import { ConfirmDialog } from "@/components/desktop/ConfirmDialog";
import { createOpfsSessionPersistenceAdapter } from "@/lib/chat/opfsSessionPersistenceAdapter";
import { createChatTools, SYSTEM_PROMPT } from "@/lib/chat/tools";
import { createShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import {
  chatActiveFilesQuery$,
  chatActiveFoldersQuery$,
  chatProvidersQuery$,
} from "@/lib/chat/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { DEFAULT_CHAT_SESSION_TITLE, updateChatSession } from "@/lib/chat/chatSessionStorage";
import { generateChatSessionTitle } from "@/lib/chat/chatSessionTitleGenerator";
import { BUILT_IN_SKILLS_PROMPT } from "@/lib/skills/builtInSkills";
import { consumePendingHomeGridPrompt } from "@/lib/widgets/homeGridPrompt";
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
import { ChatPageView } from "@/components/chat/chatPage/ChatPageView";
import { useFeatureModels } from "@/hooks/settings/useFeatureModels";

// While streaming, the chat follows new output unless the user scrolled away from the bottom;
// it then waits this long before following again, or resumes as soon as they return to it.
const CHAT_FOLLOW_PAUSE_MS = 5_000;
const CHAT_FOLLOW_BOTTOM_THRESHOLD_PX = 48;
const CHAT_USER_SCROLL_INPUT_WINDOW_MS = 250;

export const Component = () => {
  const store = useAppStore();
  const { createRuntime } = useFeatureModels();
  const settings = store.useQuery(settingsDocumentQuery$) as setting;
  const { openSettings } = useSettingsDialog();
  const openSettingsPanel = useCallback(
    (section?: string) => {
      openSettings((section as Parameters<typeof openSettings>[0] | undefined) ?? "general");
    },
    [openSettings],
  );
  const [apiKeyPromptOpen, setApiKeyPromptOpen] = useState(false);
  const promptForApiKey = useCallback(() => setApiKeyPromptOpen(true), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messagesScrollAreaRef = useRef<HTMLDivElement>(null);
  const composerOverlayRef = useRef<HTMLDivElement>(null);
  const isPreparingTurnRef = useRef(false);
  const getIsPreparingTurn = useCallback(() => isPreparingTurnRef.current, []);
  const titleGenerationSessionIdsRef = useRef<Set<string>>(new Set());
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
    getIsPreparingTurn,
    inputRef,
  });

  const onSelectSession = useCallback(
    (sessionId: string) => {
      void handleSelectSession(sessionId);
    },
    [handleSelectSession],
  );

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

  const { agentConfig, providerConfig, compactionProviderConfig, isConfigured, selectedModelInfo } =
    useChatModelConfig({
      providers,
      settings,
      activeSessionId,
    });

  const remoteTools = useMemo(
    () =>
      createChatTools(store, {
        getReferenceScope: references.getReferenceScope,
        getMemoryExtractionRuntime: () => createRuntime("memoryExtraction", "background"),
        onMemoryUpdated: () => {
          setMemoryUpdatedNotice(true);
        },
        showWidgetSkillTracker,
      }),
    [createRuntime, references.getReferenceScope, showWidgetSkillTracker, store],
  );

  const activePromptSegments = remotePromptSegments;
  const activeTools = remoteTools;

  const {
    messages,
    pendingMessages,
    pendingWriteApproval,
    resolveWriteApproval,
    isStreaming,
    status,
    thinkingSteps,
    thinkingCollapsed,
    iterationLimitPrompt,
    recap,
    error,
    send,
    continueAfterIterationLimit,
    dismissIterationLimitPrompt,
    abort: abortAgent,
    reset: resetAgent,
    updateMessage,
    steerPending,
  } = useAgent({
    sessionId: activeSessionId || "bootstrap",
    initialMessages: activeSessionInitialMessages,
    config: agentConfig,
    providerConfig,
    compactionProviderConfig,
    getReferenceScope: references.getReferenceScope,
    deliveryMode: settings.agentDeliveryMode ?? "pending",
    promptSegments: activePromptSegments,
    tools: activeTools,
    persistence,
  });

  const isActiveSessionEmpty = Boolean(activeSessionId) && messages.length === 0;
  const onCreateSession = useCallback(() => {
    // An empty session is already a new one; reuse it instead of piling up blank sessions.
    if (isActiveSessionEmpty) {
      inputRef.current?.focus();
      return;
    }
    void handleCreateSession();
  }, [handleCreateSession, inputRef, isActiveSessionEmpty]);

  const abort = useCallback(() => {
    abortAgent();
  }, [abortAgent]);

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
    openSettings: promptForApiKey,
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
    const handleMemoryUpdated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === activeSessionId) setMemoryUpdatedNotice(true);
    };
    window.addEventListener("memora-agent-memory-updated", handleMemoryUpdated);
    return () => window.removeEventListener("memora-agent-memory-updated", handleMemoryUpdated);
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
    const content = messagesContentRef.current;
    const scrollArea = messagesScrollAreaRef.current;
    if (!content || !scrollArea) return;

    let frame = 0;
    let hasScrolledInitially = false;
    // Only scroll events right after wheel/touch/key/pointer input count as the user's; our own
    // smooth scroll fires scroll events too and must not pause following.
    let lastUserInputAt = 0;
    let followPausedUntil = 0;

    const markUserInput = () => {
      lastUserInputAt = Date.now();
    };
    const handleScroll = () => {
      const distanceFromBottom =
        scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
      if (distanceFromBottom <= CHAT_FOLLOW_BOTTOM_THRESHOLD_PX) {
        followPausedUntil = 0;
      } else if (Date.now() - lastUserInputAt < CHAT_USER_SCROLL_INPUT_WINDOW_MS) {
        followPausedUntil = Date.now() + CHAT_FOLLOW_PAUSE_MS;
      }
    };
    const scrollToBottom = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (Date.now() < followPausedUntil) return;
        // Jump on session open so it doesn't glide through the whole history; glide afterwards.
        scrollArea.scrollTo({
          top: scrollArea.scrollHeight,
          behavior: hasScrolledInitially ? "smooth" : "auto",
        });
        hasScrolledInitially = true;
      });
    };

    const userInputEvents = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const eventName of userInputEvents) {
      scrollArea.addEventListener(eventName, markUserInput, { passive: true });
    }
    scrollArea.addEventListener("scroll", handleScroll, { passive: true });
    scrollToBottom();
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(content);

    return () => {
      observer.disconnect();
      for (const eventName of userInputEvents) {
        scrollArea.removeEventListener(eventName, markUserInput);
      }
      scrollArea.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [activeSessionId]);

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
    if (!sessionsReady || !activeSessionId) {
      return;
    }
    // A Home Grid widget's sendPrompt() left this here (see lib/widgets/homeGridPrompt.ts) before
    // navigating to /chat, since a sandboxed iframe outside this page can't call handleWidgetPrompt
    // directly. Consuming it clears it, so a session switch right after landing won't resend it.
    const pendingPrompt = consumePendingHomeGridPrompt();
    if (pendingPrompt) {
      void turnActions.handleWidgetPrompt(pendingPrompt);
    }
    // oxlint-disable-next-line react/exhaustive-deps
  }, [sessionsReady, activeSessionId]);

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

      void updateChatSession(activeSessionId, (record) => ({
        ...record,
        references: activeReferences,
      }))
        .then((record) => {
          commitPersistedSession(record, messages);

          const shouldGenerateTitle =
            record.messages.some((message) => message.role === "user") &&
            record.title !== DEFAULT_CHAT_SESSION_TITLE &&
            record.agentStore[titleMetadataKey]?.generated !== true &&
            !titleGenerationSessionIdsRef.current.has(activeSessionId);

          if (!shouldGenerateTitle) {
            return;
          }

          titleGenerationSessionIdsRef.current.add(activeSessionId);
          void Promise.resolve()
            .then(() =>
              generateChatSessionTitle({
                messages,
                runtime: createRuntime("sessionTitle", "background"),
              }),
            )
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
    createRuntime,
    isStreaming,
    messages,
    persistedSignaturesRef,
    sessionsReady,
    turnActions.isPreparingTurn,
    updatePersistedSessionSummary,
  ]);

  const displayedMessages = messages;
  const hasMessages = displayedMessages.length > 0;
  // Extra room so the last message clears the composer instead of sitting flush against it.
  const composerScrollInset = (composerOverlayHeight > 0 ? composerOverlayHeight : 320) + 24;
  const composerFadeHeight = Math.min(Math.max(composerOverlayHeight + 40, 160), 320);
  const activeSessionTitle =
    sessions.find((session) => session.id === activeSessionId)?.title ?? "Select a session";
  const timeGreeting = useMemo(() => resolveTimeGreeting(new Date()), []);
  const onboardingGreetingName = resolveGreetingName(settings.onboardingName);
  const effectiveGreetingName = onboardingGreetingName ?? greetingName;
  const greetingTitle = effectiveGreetingName
    ? `${timeGreeting}, ${effectiveGreetingName}. What can I help you with today?`
    : `${timeGreeting}. What can I help you with today?`;
  const isHistoryPanelBusy = turnActions.isPreparingTurn;

  return (
    <>
      <ConfirmDialog
        isOpen={apiKeyPromptOpen}
        title="Add an API key to start chatting"
        description="Chat runs on a cloud model. Add a provider and its API key in Settings. Your key stays on this device."
        confirmLabel="Add API key"
        cancelLabel="Not now"
        onConfirm={() => {
          setApiKeyPromptOpen(false);
          openSettings("ai-provider");
        }}
        onCancel={() => setApiKeyPromptOpen(false)}
      />
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
        recap={recap}
        error={error}
        messagesContentRef={messagesContentRef}
        messagesScrollAreaRef={messagesScrollAreaRef}
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
        composerPanelProps={{
          pendingMessages,
          deliveryMode: settings.agentDeliveryMode ?? "pending",
          onSteerPending: steerPending,
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
          onCreateSession,
          onImageButtonClick: () =>
            composerImages.handleImageButtonClick(references.closeReferencePicker),
          onReferenceButtonClick: references.handleReferenceButtonClick,
          onAbort: abort,
          onRemoveComposerImage: composerImages.handleRemoveComposerImage,
        }}
        isHistoryDrawerOpen={isHistoryDrawerOpen}
        pendingWriteApproval={pendingWriteApproval}
        onAllowWriteOnce={() => resolveWriteApproval("allow_once")}
        onAllowWriteForSession={() => resolveWriteApproval("allow_session")}
        onDenyWrite={() => resolveWriteApproval("deny")}
        pendingDeleteSessionId={pendingDeleteSessionId}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onDeleteSession={handlePromptDeleteSession}
        onCancelDeleteSession={handleCancelDeleteSession}
        onConfirmDeleteSession={(sessionId) => {
          void handleConfirmDeleteSession(sessionId);
        }}
        onOpenHistoryDrawer={() => setIsHistoryDrawerOpen(true)}
        onCloseHistoryDrawer={() => setIsHistoryDrawerOpen(false)}
      />
    </>
  );
};
