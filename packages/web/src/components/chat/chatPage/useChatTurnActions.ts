import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ChatMessage as AgentChatMessage } from "@/hooks/chat/useAgent";
import type { ChatTurnInput } from "@/hooks/chat/useAgent/types";
import {
  attachmentToChatInputImage,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";
import {
  findMessageIndexById,
  findRetrySourceMessage,
} from "./helpers";
import type { ComposerNotice, SuggestionCard } from "./types";

interface SendFn {
  (input: string | ChatTurnInput, options?: {
    existingUserMessage?: AgentChatMessage;
    userMessageContent?: string;
  }): Promise<void>;
}

interface ResetFn {
  (options?: {
    messages?: AgentChatMessage[];
    contextMessages?: AgentChatMessage[];
  }): Promise<void>;
}

interface UseChatTurnActionsParams {
  activeSessionId: string;
  sessionsReady: boolean;
  isStreaming: boolean;
  isConfigured: boolean;
  openSettings: (section?: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messages: AgentChatMessage[];
  composerImages: ChatImageAttachment[];
  composerImagesRef: MutableRefObject<ChatImageAttachment[]>;
  setComposerImages: Dispatch<SetStateAction<ChatImageAttachment[]>>;
  setComposerNotice: Dispatch<SetStateAction<ComposerNotice | null>>;
  closeReferencePicker: () => void;
  closeImagePicker: () => void;
  onComposerInputValueChange: (value: string) => void;
  prepareReferenceScopeForTurn: () => void;
  send: SendFn;
  resetAgent: ResetFn;
  setActiveSessionInitialMessages: React.Dispatch<
    React.SetStateAction<AgentChatMessage[]>
  >;
  thinkingCollapsed: boolean;
}

interface UseChatTurnActionsResult {
  composerTextValue: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isPreparingTurn: boolean;
  userToggled: boolean;
  panelCollapsed: boolean;
  canSubmitMessage: boolean;
  retryableAssistantIds: Set<string>;
  lastAssistantId: string | undefined;
  handleToggleThinking: () => void;
  handleInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (event: FormEvent) => void;
  handleSuggestionClick: (suggestion: SuggestionCard) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleCompositionStart: () => void;
  handleCompositionEnd: () => void;
  handleEditMessage: (messageId: string, nextText: string) => Promise<void>;
  handleRetryMessage: (assistantMessageId: string) => Promise<void>;
  handleWidgetPrompt: (text: string) => Promise<void>;
  submitMessage: () => Promise<void>;
  setComposerTextValue: Dispatch<SetStateAction<string>>;
  setIsPreparingTurn: Dispatch<SetStateAction<boolean>>;
}

export const useChatTurnActions = ({
  activeSessionId,
  sessionsReady,
  isStreaming,
  isConfigured,
  openSettings,
  inputRef,
  messages,
  composerImages,
  composerImagesRef,
  setComposerImages,
  setComposerNotice,
  closeReferencePicker,
  closeImagePicker,
  onComposerInputValueChange,
  prepareReferenceScopeForTurn,
  send,
  resetAgent,
  setActiveSessionInitialMessages,
  thinkingCollapsed,
}: UseChatTurnActionsParams): UseChatTurnActionsResult => {
  const isComposingRef = useRef(false);
  const latestMessagesRef = useRef(messages);
  const [composerTextValue, setComposerTextValue] = useState("");
  const [isPreparingTurn, setIsPreparingTurn] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setComposerTextValue("");
    setUserToggled(false);
    setIsPreparingTurn(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [activeSessionId, inputRef]);

  const startAgentTurn = useCallback(
    async (
      turnInput: string | ChatTurnInput,
      options?: Parameters<SendFn>[1],
    ) => {
      await send(turnInput, options);
    },
    [send],
  );

  const buildReplayTurnInput = useCallback(
    async (
      message: AgentChatMessage,
      nextText: string,
    ): Promise<string | ChatTurnInput> => {
      const attachments = message.attachments ?? [];
      if (attachments.length === 0) {
        return nextText;
      }

      const images = await Promise.all(
        attachments.map((attachment) => attachmentToChatInputImage(attachment)),
      );

      return {
        text: nextText,
        images,
      };
    },
    [],
  );

  const queueReplayTurn = useCallback(
    async (sourceMessage: AgentChatMessage, nextText: string) => {
      if (!sessionsReady || !activeSessionId || isPreparingTurn || isStreaming) {
        return;
      }
      if (sourceMessage.role !== "user") {
        return;
      }
      if (!isConfigured) {
        openSettings("ai-provider");
        return;
      }

      const normalizedText = nextText.trim();
      const hasAttachments = (sourceMessage.attachments?.length ?? 0) > 0;
      if (!normalizedText && !hasAttachments) {
        setComposerNotice({
          type: "error",
          text: "A message needs text or at least one image attachment.",
        });
        return;
      }

      const sourceIndex = findMessageIndexById(
        latestMessagesRef.current,
        sourceMessage.id,
      );
      if (sourceIndex < 0) {
        return;
      }

      prepareReferenceScopeForTurn();
      setUserToggled(false);
      closeReferencePicker();
      closeImagePicker();
      setComposerNotice(null);
      setIsPreparingTurn(true);

      try {
        const input = await buildReplayTurnInput(sourceMessage, nextText);
        const baseMessages = latestMessagesRef.current.slice(0, sourceIndex);
        const replayedUserMessage: AgentChatMessage = {
          ...sourceMessage,
          content: nextText,
        };
        const nextDisplayedMessages = [...baseMessages, replayedUserMessage];

        latestMessagesRef.current = nextDisplayedMessages;
        setActiveSessionInitialMessages(nextDisplayedMessages);
        await resetAgent({
          messages: nextDisplayedMessages,
          contextMessages: baseMessages,
        });
        await startAgentTurn(input, {
          existingUserMessage: replayedUserMessage,
        });
      } catch (error) {
        setComposerNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not prepare that message for resend.",
        });
      } finally {
        setIsPreparingTurn(false);
      }
    },
    [
      activeSessionId,
      buildReplayTurnInput,
      closeImagePicker,
      closeReferencePicker,
      isConfigured,
      isPreparingTurn,
      isStreaming,
      openSettings,
      prepareReferenceScopeForTurn,
      resetAgent,
      sessionsReady,
      setActiveSessionInitialMessages,
      setComposerNotice,
      startAgentTurn,
    ],
  );

  const submitMessage = useCallback(async () => {
    if (!sessionsReady || !activeSessionId || isPreparingTurn) {
      return;
    }

    const trimmed = inputRef.current?.value.trim() ?? "";
    const nextComposerImages = composerImagesRef.current;
    if (
      (trimmed.length === 0 && nextComposerImages.length === 0) ||
      isStreaming
    ) {
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
          nextComposerImages.map((attachment) =>
            attachmentToChatInputImage(attachment),
          ),
        );
        turnInput = {
          text: trimmed,
          images,
        };
      } catch (error) {
        setComposerNotice({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not attach those images.",
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
    composerImagesRef,
    inputRef,
    isConfigured,
    isPreparingTurn,
    isStreaming,
    openSettings,
    prepareReferenceScopeForTurn,
    sessionsReady,
    setComposerImages,
    setComposerNotice,
    startAgentTurn,
  ]);

  const handleWidgetPrompt = useCallback(
    async (text: string) => {
      if (
        !sessionsReady ||
        !activeSessionId ||
        isPreparingTurn ||
        isStreaming
      ) {
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

  const handleEditMessage = useCallback(
    async (messageId: string, nextText: string) => {
      const sourceMessage = latestMessagesRef.current.find(
        (message) => message.id === messageId,
      );
      if (!sourceMessage) {
        return;
      }

      await queueReplayTurn(sourceMessage, nextText);
    },
    [queueReplayTurn],
  );

  const handleRetryMessage = useCallback(
    async (assistantMessageId: string) => {
      const sourceMessage = findRetrySourceMessage(
        latestMessagesRef.current,
        assistantMessageId,
      );
      if (!sourceMessage) {
        return;
      }

      await queueReplayTurn(sourceMessage, sourceMessage.content);
    },
    [queueReplayTurn],
  );

  const handleToggleThinking = useCallback(() => {
    setUserToggled((value) => !value);
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.currentTarget.value;
      setComposerTextValue(value);
      onComposerInputValueChange(value);
    },
    [onComposerInputValueChange],
  );

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void submitMessage();
    },
    [submitMessage],
  );

  const handleSuggestionClick = useCallback((suggestion: SuggestionCard) => {
    if (inputRef.current) {
      inputRef.current.value = suggestion.title;
      inputRef.current.focus();
    }
    setComposerTextValue(suggestion.title);
  }, [inputRef]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.nativeEvent.isComposing ||
        event.nativeEvent.keyCode === 229 ||
        isComposingRef.current
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeReferencePicker();
        closeImagePicker();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submitMessage();
      }
    },
    [closeImagePicker, closeReferencePicker, submitMessage],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const lastAssistantId = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant")
      ?.id;
  }, [messages]);

  const retryableAssistantIds = useMemo(() => {
    const ids = new Set<string>();
    messages.forEach((message) => {
      if (
        message.role === "assistant" &&
        findRetrySourceMessage(messages, message.id)
      ) {
        ids.add(message.id);
      }
    });
    return ids;
  }, [messages]);

  const canSubmitMessage =
    !isStreaming &&
    !isPreparingTurn &&
    (composerTextValue.trim().length > 0 || composerImages.length > 0);
  const panelCollapsed = userToggled ? !thinkingCollapsed : thinkingCollapsed;

  return {
    composerTextValue,
    inputRef,
    isPreparingTurn,
    userToggled,
    panelCollapsed,
    canSubmitMessage,
    retryableAssistantIds,
    lastAssistantId,
    handleToggleThinking,
    handleInputChange,
    handleSubmit,
    handleSuggestionClick,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
    handleEditMessage,
    handleRetryMessage,
    handleWidgetPrompt,
    submitMessage,
    setComposerTextValue,
    setIsPreparingTurn,
  };
};
