import {
  ArrowCounterClockwiseIcon,
  MicrophoneIcon,
  PencilSimpleIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import MemoraMascot, {
  type MemoraMascotState,
} from "@/components/assistant/MemoraMascot";
import { cn } from "@/lib/cn";
import {
  parseMemoraJumpContent,
  type MediaJumpCardData,
} from "@/lib/chat/memoraJump";
import { formatDuration } from "@/lib/format";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import { ChatWidget } from "@/components/chat/ChatWidget";
import type { ChatWidget as ChatWidgetData } from "@/lib/chat/showWidget";
import { motion } from "motion/react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";
import type { TokenUsage } from "@memora/ai-core";
import { ThinkingPanel } from "@/components/chat/ThinkingPanel";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidgetData[];
  thinkingSteps?: ThinkingStep[];
  usage?: TokenUsage;
}

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

const formatTokenUsage = (usage?: TokenUsage): string | null => {
  if (!usage) return null;

  const parts = [
    usage.inputTokens !== undefined ? `In ${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `Out ${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `Total ${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
};

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
  const liveThinkingSteps =
    thinkingSteps && thinkingSteps.length > 0 ? thinkingSteps : undefined;
  const persistedThinkingSteps =
    message.thinkingSteps && message.thinkingSteps.length > 0
      ? message.thinkingSteps
      : undefined;
  const visibleThinkingSteps = liveThinkingSteps ?? persistedThinkingSteps;
  const visibleStatus =
    liveThinkingSteps && status ? status : { type: "idle" as const };
  const canToggleThinking = Boolean(liveThinkingSteps && onToggleThinking);
  const parsedContent = useMemo(
    () =>
      isUser
        ? [
            {
              type: "text" as const,
              content: message.content,
            },
          ]
        : parseMemoraJumpContent(message.content),
    [isUser, message.content],
  );
  const hasRenderableText = parsedContent.some((part) => {
    return part.type === "text" && part.content.trim().length > 0;
  });
  const hasJumpCards = parsedContent.some((part) => part.type === "jump");
  const hasStreamingSpinner =
    isStreaming &&
    thinkingSteps &&
    thinkingSteps.length === 0 &&
    !hasRenderableText &&
    !hasJumpCards &&
    (!message.widgets || message.widgets.length === 0);
  const tokenUsageText = isUser ? null : formatTokenUsage(message.usage);
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
  }, [
    actionsDisabled,
    canSubmitEdit,
    draftText,
    message.id,
    onEditMessage,
  ]);

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
          {message.attachments && message.attachments.length > 0 && (
            <div className={cn(message.content ? "mb-3" : "")}>
              <ChatImageAttachmentGallery
                attachments={message.attachments}
                tone={isUser ? "user" : "composer"}
                savingAttachmentIds={savingAttachmentIds}
                onSaveToLibrary={
                  onSaveImageToLibrary
                    ? (attachmentId) =>
                        onSaveImageToLibrary(message.id, attachmentId)
                    : undefined
                }
              />
            </div>
          )}
          {isUser ? (
            isEditing ? (
              <div className="space-y-3">
                <textarea
                  ref={editInputRef}
                  value={draftText}
                  onChange={(event) => setDraftText(event.currentTarget.value)}
                  rows={3}
                  className="block w-full resize-y rounded-2xl border border-[#d9d1c5] bg-[#f3efe9] px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  placeholder="Edit your message..."
                  disabled={actionsDisabled}
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#d9d1c5] bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitEdit}
                    disabled={!canSubmitEdit || actionsDisabled}
                    className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              message.content
            )
          ) : (
            <>
              {visibleThinkingSteps && (
                <ThinkingPanel
                  steps={visibleThinkingSteps}
                  status={visibleStatus}
                  collapsed={canToggleThinking ? thinkingCollapsed : undefined}
                  onToggle={canToggleThinking ? onToggleThinking : undefined}
                />
              )}
              {message.widgets && message.widgets.length > 0 && (
                <div className="space-y-3">
                  {message.widgets.map((widget) => (
                    <ChatWidget
                      key={widget.toolCallId}
                      widget={widget}
                      onSendPrompt={onSendWidgetPrompt}
                    />
                  ))}
                </div>
              )}
              {parsedContent.length > 0 ? (
                <div
                  className={cn(
                    "space-y-3",
                    message.widgets && message.widgets.length > 0 && "mt-3",
                  )}
                >
                  {parsedContent.map((part, index) => {
                    if (part.type === "text") {
                      if (!part.content.trim()) {
                        return null;
                      }

                      return (
                        <Streamdown
                          key={`text-${index}`}
                          mode={isStreaming ? "streaming" : "static"}
                          animated={{
                            animation: "blurIn",
                            sep: "word",
                            duration: 0.5,
                            easing: "ease-in-out",
                          }}
                          isAnimating={isStreaming}
                          plugins={{ cjk, code, math, mermaid }}
                        >
                          {part.content}
                        </Streamdown>
                      );
                    }

                    return (
                      <MediaJumpCard
                        key={`${part.jumpCard.fileId}-${part.jumpCard.startSec}-${index}`}
                        jumpCard={part.jumpCard}
                      />
                    );
                  })}
                </div>
              ) : hasStreamingSpinner ? (
                <div className="flex items-center gap-1 py-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="size-1.5 rounded-full bg-zinc-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {tokenUsageText && (
                <div className="mt-3 border-t border-zinc-200/70 pt-2 text-[11px] font-medium text-zinc-400">
                  {tokenUsageText}
                </div>
              )}
            </>
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

function MediaJumpCard({ jumpCard }: { jumpCard: MediaJumpCardData }) {
  const JumpIcon =
    jumpCard.mediaType === "video" ? VideoCameraIcon : MicrophoneIcon;

  return (
    <Link
      to={`/transcript/file/${jumpCard.fileId}?seek=${encodeURIComponent(
        String(jumpCard.startSec),
      )}`}
      className="group block rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 transition hover:border-zinc-300 hover:bg-white"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <JumpIcon className="size-3.5" weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-zinc-900">
              {jumpCard.fileName}
            </p>
            <span className="shrink-0 text-[11px] font-medium text-zinc-500">
              {formatDuration(jumpCard.startSec)} - {formatDuration(jumpCard.endSec)}
            </span>
          </div>
          {jumpCard.context && (
            <p className="mt-1 truncate text-xs text-zinc-500">
              {jumpCard.context}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function getAssistantAvatarState(
  status: AgentStatus | undefined,
  isStreaming: boolean,
): MemoraMascotState {
  if (status?.type === "thinking" || status?.type === "searching") {
    return "thinking";
  }

  if (status?.type === "tool-calling" || status?.type === "tool-running") {
    return "listening";
  }

  if (isStreaming || status?.type === "generating") {
    return "speaking";
  }

  return "idle";
}
