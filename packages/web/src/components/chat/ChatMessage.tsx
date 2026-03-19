import {
  ArrowCounterClockwiseIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import MemoraMascot, {
  type MemoraMascotState,
} from "@/components/assistant/MemoraMascot";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";

import { AssistantMessageContent } from "./chatMessage/AssistantMessageContent";
import { getAssistantAvatarState } from "./chatMessage/getAssistantAvatarState";
import type { ChatMessageData } from "./chatMessage/types";
import { UserMessageContent } from "./chatMessage/UserMessageContent";

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming: boolean;
  thinkingSteps?: ThinkingStep[];
  status?: AgentStatus;
  thinkingCollapsed?: boolean;
  onToggleThinking?: () => void;
  savingAttachmentIds?: ReadonlySet<string>;
  onSaveImageToLibrary?: (messageId: string, attachmentId: string) => void;
  onSendWidgetPrompt?: (text: string) => Promise<void> | void;
  onEditMessage?: (messageId: string, text: string) => Promise<void> | void;
  onRetryMessage?: (messageId: string) => Promise<void> | void;
  actionsDisabled?: boolean;
}

function ChatMessageComponent({
  message,
  isStreaming,
  thinkingSteps,
  status,
  thinkingCollapsed,
  onToggleThinking,
  savingAttachmentIds,
  onSaveImageToLibrary,
  onSendWidgetPrompt,
  onEditMessage,
  onRetryMessage,
  actionsDisabled = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  const assistantAvatarState = getAssistantAvatarState(status, isStreaming);
  const [avatarBurstState, setAvatarBurstState] =
    useState<MemoraMascotState | null>(null);
  const avatarBurstTimeoutRef = useRef<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.content);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const canShowHoverActions = Boolean(
    (!isUser && onRetryMessage) || (isUser && onEditMessage && !isEditing),
  );

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    editInputRef.current?.focus();
    const valueLength = editInputRef.current?.value.length ?? 0;
    editInputRef.current?.setSelectionRange(valueLength, valueLength);
  }, [isEditing]);

  const triggerAvatarBurst = useCallback(() => {
    const burstStates: MemoraMascotState[] = [
      "listening",
      "thinking",
      "speaking",
    ];
    const randomBurstState =
      burstStates[Math.floor(Math.random() * burstStates.length)] ?? "speaking";

    setAvatarBurstState(randomBurstState);

    if (avatarBurstTimeoutRef.current !== null) {
      window.clearTimeout(avatarBurstTimeoutRef.current);
    }

    avatarBurstTimeoutRef.current = window.setTimeout(() => {
      setAvatarBurstState(null);
      avatarBurstTimeoutRef.current = null;
    }, 900);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarBurstTimeoutRef.current !== null) {
        window.clearTimeout(avatarBurstTimeoutRef.current);
      }
    };
  }, []);

  const displayedAssistantAvatarState =
    avatarBurstState ?? assistantAvatarState;
  const shouldAnimateAssistantAvatar =
    !isUser &&
    (avatarBurstState !== null ||
      isStreaming ||
      status?.type === "thinking" ||
      status?.type === "searching" ||
      status?.type === "tool-calling" ||
      status?.type === "tool-running");
  const canSubmitEdit = draftText.trim().length > 0 || hasAttachments;

  const handleStartEditing = useCallback(() => {
    if (!onEditMessage || actionsDisabled) {
      return;
    }

    setDraftText(message.content);
    setIsEditing(true);
  }, [actionsDisabled, message.content, onEditMessage]);

  const handleCancelEditing = useCallback(() => {
    setDraftText(message.content);
    setIsEditing(false);
  }, [message.content]);

  const handleSubmitEdit = useCallback(() => {
    if (!onEditMessage || actionsDisabled || !canSubmitEdit) {
      return;
    }

    void onEditMessage(message.id, draftText);
    setIsEditing(false);
  }, [actionsDisabled, canSubmitEdit, draftText, message.id, onEditMessage]);

  const handleRetry = useCallback(() => {
    if (!onRetryMessage || actionsDisabled) {
      return;
    }

    void onRetryMessage(message.id);
  }, [actionsDisabled, message.id, onRetryMessage]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group/message flex items-start gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <button
          type="button"
          onClick={triggerAvatarBurst}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mocha ring-[#ddd1c1] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#91a85b]/45"
          aria-label="Animate assistant avatar"
        >
          <MemoraMascot
            state={displayedAssistantAvatarState}
            animated={shouldAnimateAssistantAvatar}
            decorative
            className="size-7"
          />
        </button>
      )}
      <div
        className={cn(
          "min-w-0",
          isUser
            ? cn(
                "flex flex-col items-end",
                isEditing ? "w-full max-w-none" : "max-w-[75%]",
              )
            : "flex min-w-0 flex-1 flex-col",
        )}
      >
        <div
          className={cn(
            "relative text-sm leading-relaxed",
            isUser
              ? "w-full rounded-2xl bg-[#efe7db] px-4 py-2.5 text-zinc-900"
              : "min-w-0 flex-1 bg-transparent px-0 py-0 text-zinc-800",
          )}
        >
          {canShowHoverActions && (
            <div
              className={cn(
                "pointer-events-none absolute top-3 z-20 flex items-center gap-1.5 opacity-0 transition duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100",
                isUser ? "right-full mr-3" : "left-full ml-3",
              )}
            >
              {isUser && !isEditing && onEditMessage && (
                <button
                  type="button"
                  onClick={handleStartEditing}
                  disabled={actionsDisabled}
                  className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-[#f1ebe2] text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Edit message"
                >
                  <PencilSimpleIcon className="size-3.5" />
                </button>
              )}
              {!isUser && onRetryMessage && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={actionsDisabled}
                  className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-[#f1ebe2] text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Retry message"
                >
                  <ArrowCounterClockwiseIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {isUser ? (
            <UserMessageContent
              message={message}
              draftText={draftText}
              isEditing={isEditing}
              actionsDisabled={actionsDisabled}
              savingAttachmentIds={savingAttachmentIds}
              editInputRef={editInputRef}
              onSaveImageToLibrary={onSaveImageToLibrary}
              onCancelEditing={handleCancelEditing}
              onDraftTextChange={setDraftText}
              onSubmitEdit={handleSubmitEdit}
              canSubmitEdit={canSubmitEdit}
            />
          ) : (
            <AssistantMessageContent
              message={message}
              isStreaming={isStreaming}
              thinkingSteps={thinkingSteps}
              status={status}
              thinkingCollapsed={thinkingCollapsed}
              onToggleThinking={onToggleThinking}
              onSendWidgetPrompt={onSendWidgetPrompt}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

const areStatusesEqual = (
  previousStatus: AgentStatus | undefined,
  nextStatus: AgentStatus | undefined,
): boolean => {
  const previousToolName =
    previousStatus && "toolName" in previousStatus
      ? previousStatus.toolName
      : undefined;
  const nextToolName =
    nextStatus && "toolName" in nextStatus ? nextStatus.toolName : undefined;
  return (
    previousStatus?.type === nextStatus?.type &&
    previousToolName === nextToolName
  );
};

const areChatMessagePropsEqual = (
  previousProps: ChatMessageProps,
  nextProps: ChatMessageProps,
): boolean => {
  return (
    previousProps.message === nextProps.message &&
    previousProps.isStreaming === nextProps.isStreaming &&
    previousProps.thinkingSteps === nextProps.thinkingSteps &&
    areStatusesEqual(previousProps.status, nextProps.status) &&
    previousProps.thinkingCollapsed === nextProps.thinkingCollapsed &&
    previousProps.onToggleThinking === nextProps.onToggleThinking &&
    previousProps.savingAttachmentIds === nextProps.savingAttachmentIds &&
    previousProps.onSaveImageToLibrary === nextProps.onSaveImageToLibrary &&
    previousProps.onSendWidgetPrompt === nextProps.onSendWidgetPrompt &&
    previousProps.onEditMessage === nextProps.onEditMessage &&
    previousProps.onRetryMessage === nextProps.onRetryMessage &&
    previousProps.actionsDisabled === nextProps.actionsDisabled
  );
};

export const ChatMessage = memo(ChatMessageComponent, areChatMessagePropsEqual);
