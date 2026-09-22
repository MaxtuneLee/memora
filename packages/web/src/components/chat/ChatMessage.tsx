import { ArrowCounterClockwiseIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import MemoraMascot, { type MemoraMascotState } from "@/components/assistant/MemoraMascot";
import { motion } from "motion/react";
import * as stylex from "@stylexjs/stylex";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";
import { tokens } from "../../styles/stylex.stylex";

import { AssistantMessageContent } from "./chatMessage/AssistantMessageContent";
import { getAssistantAvatarState } from "./chatMessage/getAssistantAvatarState";
import type { ChatMessageData } from "./chatMessage/types";
import { UserMessageContent } from "./chatMessage/UserMessageContent";

const styles = stylex.create({
  root: { alignItems: "flex-start", display: "flex", gap: 12 },
  userRoot: { justifyContent: "flex-end" },
  assistantRoot: { justifyContent: "flex-start" },
  avatarButton: {
    alignItems: "center",
    backgroundColor: tokens.olive,
    borderRadius: 9999,
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    transition: "transform 150ms",
    width: 36,
    ":hover": { transform: "scale(1.03)" },
    ":focus-visible": {
      outline: "none",
      boxShadow: `0 0 0 2px ${tokens.surface}, 0 0 0 4px ${tokens.focusRing}`,
    },
  },
  avatar: { height: 28, width: 28 },
  messageWrap: { minWidth: 0 },
  userMessageWrap: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    maxWidth: "75%",
  },
  editingMessageWrap: { maxWidth: "none", width: "100%" },
  assistantMessageWrap: { display: "flex", flex: 1, flexDirection: "column" },
  messageContent: { fontSize: 14, lineHeight: 1.625, position: "relative" },
  userContent: {
    alignItems: "flex-end",
    color: tokens.textStrong,
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  assistantContent: { color: tokens.text, flex: 1, minWidth: 0 },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 12,
    transition: "opacity 150ms",
    zIndex: 20,
  },
  actionsVisible: { opacity: 1, pointerEvents: "auto" },
  userActions: { marginRight: 12, right: "100%" },
  assistantActions: { left: "100%", marginLeft: 12 },
  actionButton: {
    alignItems: "center",
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.border}`,
    borderRadius: 9999,
    boxShadow: tokens.shadowSmall,
    color: tokens.textMuted,
    display: "inline-flex",
    height: 32,
    justifyContent: "center",
    transition: "all 150ms",
    width: 32,
    ":hover": {
      backgroundColor: tokens.card,
      borderColor: tokens.borderStrong,
      color: tokens.textStrong,
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.4 },
  },
  actionIcon: { height: 14, width: 14 },
});

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
  const [avatarBurstState, setAvatarBurstState] = useState<MemoraMascotState | null>(null);
  const avatarBurstTimeoutRef = useRef<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isActionsVisible, setIsActionsVisible] = useState(false);
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
    const burstStates: MemoraMascotState[] = ["listening", "thinking", "speaking"];
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

  const displayedAssistantAvatarState = avatarBurstState ?? assistantAvatarState;
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
      {...stylex.props(styles.root, isUser ? styles.userRoot : styles.assistantRoot)}
      onMouseEnter={() => setIsActionsVisible(true)}
      onMouseLeave={() => setIsActionsVisible(false)}
      onFocus={() => setIsActionsVisible(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsActionsVisible(false);
        }
      }}
    >
      {!isUser && (
        <button
          type="button"
          onClick={triggerAvatarBurst}
          {...stylex.props(styles.avatarButton)}
          aria-label="Animate assistant avatar"
        >
          <MemoraMascot
            state={displayedAssistantAvatarState}
            animated={shouldAnimateAssistantAvatar}
            decorative
            style={styles.avatar}
          />
        </button>
      )}
      <div
        {...stylex.props(
          styles.messageWrap,
          isUser ? styles.userMessageWrap : styles.assistantMessageWrap,
          isEditing && styles.editingMessageWrap,
        )}
      >
        <div
          {...stylex.props(
            styles.messageContent,
            isUser ? styles.userContent : styles.assistantContent,
          )}
        >
          {canShowHoverActions && (
            <div
              {...stylex.props(
                styles.actions,
                isActionsVisible && styles.actionsVisible,
                isUser ? styles.userActions : styles.assistantActions,
              )}
            >
              {isUser && !isEditing && onEditMessage && (
                <button
                  type="button"
                  onClick={handleStartEditing}
                  disabled={actionsDisabled}
                  {...stylex.props(styles.actionButton)}
                  aria-label="Edit message"
                >
                  <PencilSimpleIcon className={stylex.props(styles.actionIcon).className} />
                </button>
              )}
              {!isUser && onRetryMessage && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={actionsDisabled}
                  {...stylex.props(styles.actionButton)}
                  aria-label="Retry message"
                >
                  <ArrowCounterClockwiseIcon
                    className={stylex.props(styles.actionIcon).className}
                  />
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
    previousStatus && "toolName" in previousStatus ? previousStatus.toolName : undefined;
  const nextToolName = nextStatus && "toolName" in nextStatus ? nextStatus.toolName : undefined;
  return previousStatus?.type === nextStatus?.type && previousToolName === nextToolName;
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
