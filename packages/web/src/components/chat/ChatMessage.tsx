import { MicrophoneIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Link } from "react-router";

import { ChatImageAttachmentGallery } from "@/components/chat/ChatImageAttachmentGallery";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
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
  thinkingSteps?: ThinkingStep[];
  usage?: TokenUsage;
}

interface MediaJumpCardData {
  fileId: string;
  fileName: string;
  mediaType: "video" | "audio";
  startSec: number;
  endSec: number;
  context: string;
}

const parseMediaJumpCard = (value: unknown): MediaJumpCardData | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<MediaJumpCardData>;
  if (typeof candidate.fileId !== "string" || !candidate.fileId.trim()) {
    return null;
  }
  if (typeof candidate.fileName !== "string" || !candidate.fileName.trim()) {
    return null;
  }
  if (candidate.mediaType !== "video" && candidate.mediaType !== "audio") {
    return null;
  }
  if (
    typeof candidate.startSec !== "number" ||
    !Number.isFinite(candidate.startSec) ||
    candidate.startSec < 0
  ) {
    return null;
  }
  if (
    typeof candidate.endSec !== "number" ||
    !Number.isFinite(candidate.endSec) ||
    candidate.endSec < 0
  ) {
    return null;
  }
  return {
    fileId: candidate.fileId.trim(),
    fileName: candidate.fileName.trim(),
    mediaType: candidate.mediaType,
    startSec: candidate.startSec,
    endSec: Math.max(candidate.endSec, candidate.startSec),
    context:
      typeof candidate.context === "string" ? candidate.context.trim() : "",
  };
};

const parseMessageMediaJumps = (
  content: string,
): { cleanedContent: string; jumpCards: MediaJumpCardData[] } => {
  const jumpCards: MediaJumpCardData[] = [];
  const blockPattern = /```memora-jumps\s*([\s\S]*?)```/gi;

  const cleanedContent = content
    .replace(blockPattern, (_, blockPayload: string) => {
      try {
        const parsed = JSON.parse(blockPayload) as unknown;
        if (!Array.isArray(parsed)) {
          return "";
        }
        for (const item of parsed) {
          const jumpCard = parseMediaJumpCard(item);
          if (jumpCard) {
            jumpCards.push(jumpCard);
          }
        }
      } catch {
        // Ignore malformed jump payloads.
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanedContent,
    jumpCards,
  };
};

const formatTokenUsage = (usage?: TokenUsage): string | null => {
  if (!usage) return null;

  const parts = [
    usage.inputTokens !== undefined ? `In ${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `Out ${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `Total ${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
};

export function ChatMessage({
  message,
  isStreaming,
  thinkingSteps,
  status,
  thinkingCollapsed,
  onToggleThinking,
  savingAttachmentIds,
  onSaveImageToLibrary,
}: {
  message: ChatMessageData;
  isStreaming: boolean;
  thinkingSteps?: ThinkingStep[];
  status?: AgentStatus;
  thinkingCollapsed?: boolean;
  onToggleThinking?: () => void;
  savingAttachmentIds?: ReadonlySet<string>;
  onSaveImageToLibrary?: (messageId: string, attachmentId: string) => void;
}) {
  const isUser = message.role === "user";
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
        ? {
            cleanedContent: message.content,
            jumpCards: [] as MediaJumpCardData[],
          }
        : parseMessageMediaJumps(message.content),
    [isUser, message.content],
  );
  const hasStreamingSpinner =
    isStreaming &&
    thinkingSteps &&
    thinkingSteps.length === 0 &&
    !parsedContent.cleanedContent &&
    parsedContent.jumpCards.length === 0;
  const tokenUsageText = isUser ? null : formatTokenUsage(message.usage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-900">
          <span className="text-[10px] font-bold text-white leading-none">
            M
          </span>
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-zinc-900 text-white"
            : "bg-white/80 text-zinc-800 shadow-sm ring-1 ring-zinc-200/60",
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn(message.content ? "mb-3" : "") }>
            <ChatImageAttachmentGallery
              attachments={message.attachments}
              tone={isUser ? "user" : "composer"}
              savingAttachmentIds={savingAttachmentIds}
              onSaveToLibrary={
                onSaveImageToLibrary
                  ? (attachmentId) => onSaveImageToLibrary(message.id, attachmentId)
                  : undefined
              }
            />
          </div>
        )}
        {isUser ? (
          message.content
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
            {parsedContent.cleanedContent ? (
              <Streamdown
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
                {parsedContent.cleanedContent}
              </Streamdown>
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
            {parsedContent.jumpCards.length > 0 && (
              <div className="mt-3 space-y-2">
                {parsedContent.jumpCards.map((jumpCard, index) => {
                  const JumpIcon =
                    jumpCard.mediaType === "video"
                      ? VideoCameraIcon
                      : MicrophoneIcon;
                  return (
                    <Link
                      key={`${jumpCard.fileId}-${jumpCard.startSec}-${index}`}
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
                              {formatDuration(jumpCard.startSec)} -{" "}
                              {formatDuration(jumpCard.endSec)}
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
                })}
              </div>
            )}
            {tokenUsageText && (
              <div className="mt-3 border-t border-zinc-200/70 pt-2 text-[11px] font-medium text-zinc-400">
                {tokenUsageText}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
