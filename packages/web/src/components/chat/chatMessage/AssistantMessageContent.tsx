import { motion } from "motion/react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import "katex/dist/katex.min.css";

import { ChatWidget } from "@/components/chat/ChatWidget";
import { ThinkingPanel } from "@/components/chat/ThinkingPanel";
import type { AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent";
import {
  MEMORA_STREAMDOWN_CLASS_NAME,
  MEMORA_STREAMDOWN_CONTROLS,
  MEMORA_STREAMDOWN_PLUGINS,
  MEMORA_STREAMDOWN_THEME,
} from "@/lib/streamdown";
import {
  parseMemoraJumpContent,
} from "@/lib/chat/memoraJump";
import { cn } from "@/lib/cn";

import { MediaJumpCard } from "./MediaJumpCard";
import type { ChatMessageData } from "./types";

const formatTokenUsage = (usage: ChatMessageData["usage"]): string | null => {
  if (!usage) {
    return null;
  }

  const parts = [
    usage.inputTokens !== undefined ? `In ${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `Out ${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `Total ${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : null;
};

export function AssistantMessageContent({
  message,
  isStreaming,
  thinkingSteps,
  status,
  thinkingCollapsed,
  onToggleThinking,
  onSendWidgetPrompt,
}: {
  message: ChatMessageData;
  isStreaming: boolean;
  thinkingSteps?: ThinkingStep[];
  status?: AgentStatus;
  thinkingCollapsed?: boolean;
  onToggleThinking?: () => void;
  onSendWidgetPrompt?: (text: string) => Promise<void> | void;
}) {
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
  const parsedContent = parseMemoraJumpContent(message.content);
  const hasRenderableText = parsedContent.some(
    (part) => part.type === "text" && part.content.trim().length > 0,
  );
  const hasJumpCards = parsedContent.some((part) => part.type === "jump");
  const hasStreamingSpinner =
    isStreaming &&
    thinkingSteps &&
    thinkingSteps.length === 0 &&
    !hasRenderableText &&
    !hasJumpCards &&
    (!message.widgets || message.widgets.length === 0);
  const tokenUsageText = formatTokenUsage(message.usage);

  return (
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
                  className={MEMORA_STREAMDOWN_CLASS_NAME}
                  animated={{
                    animation: "blurIn",
                    sep: "word",
                    duration: 0.5,
                    easing: "ease-in-out",
                  }}
                  isAnimating={isStreaming}
                  controls={MEMORA_STREAMDOWN_CONTROLS}
                  plugins={{ ...MEMORA_STREAMDOWN_PLUGINS }}
                  shikiTheme={MEMORA_STREAMDOWN_THEME}
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
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="size-1.5 rounded-full bg-zinc-400"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: index * 0.2,
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
  );
}
