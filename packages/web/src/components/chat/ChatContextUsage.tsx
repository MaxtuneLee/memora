import { Tooltip } from "@base-ui/react/tooltip";

import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ChatMessage } from "@/hooks/chat/useAgent";
import type { ModelInfo } from "@/types/settingsDialog";

interface ChatContextUsageProps {
  composerImageCount: number;
  composerText: string;
  messages: readonly ChatMessage[];
  model: ModelInfo | null;
}

interface UsageSummary {
  primaryApproximate: boolean;
  primaryContextTokens: number | null;
}

const MESSAGE_FRAMING_TOKENS = 6;
const IMAGE_ATTACHMENT_TOKENS = 24;

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const formatCompactTokenCount = (value: number): string => {
  return compactNumberFormatter.format(value);
};

const formatPercent = (value: number): string => {
  return `${percentFormatter.format(value * 100)}%`;
};

const estimateTextTokens = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  let asciiChars = 0;
  let nonAsciiChars = 0;

  for (const character of trimmed) {
    if (/\s/.test(character)) {
      continue;
    }

    if (character.charCodeAt(0) <= 0x7f) {
      asciiChars += 1;
    } else {
      nonAsciiChars += 1;
    }
  }

  return Math.max(1, Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5));
};

const estimateAttachmentTokens = (
  attachments: readonly ChatImageAttachment[] | undefined,
): number => {
  return (attachments?.length ?? 0) * IMAGE_ATTACHMENT_TOKENS;
};

const estimateMessageTokens = (message: ChatMessage): number => {
  return (
    MESSAGE_FRAMING_TOKENS +
    estimateTextTokens(message.content) +
    estimateAttachmentTokens(message.attachments)
  );
};

export function ChatContextUsage({
  composerImageCount,
  composerText,
  messages,
  model,
}: ChatContextUsageProps) {
  const usageSummary = ((): UsageSummary => {
    const latestMeasuredMessage = [...messages].reverse().find((message) => {
      if (message.role !== "assistant" || !message.usage) {
        return false;
      }

      return message.usage.inputTokens !== undefined || message.usage.totalTokens !== undefined;
    });

    const latestInputTokens = latestMeasuredMessage?.usage?.inputTokens;
    const latestTotalTokens = latestMeasuredMessage?.usage?.totalTokens;
    const draftEstimate =
      estimateTextTokens(composerText) + composerImageCount * IMAGE_ATTACHMENT_TOKENS;
    const fallbackConversationEstimate =
      messages.reduce((total, message) => total + estimateMessageTokens(message), 0) +
      draftEstimate;

    const primaryContextTokens =
      latestInputTokens ??
      latestTotalTokens ??
      (fallbackConversationEstimate > 0 ? fallbackConversationEstimate : null);
    const primaryApproximate = latestInputTokens === undefined && latestTotalTokens === undefined;
    return {
      primaryApproximate,
      primaryContextTokens,
    };
  })();

  const primaryLabel =
    usageSummary.primaryContextTokens !== null
      ? `${usageSummary.primaryApproximate ? "~" : ""}${formatCompactTokenCount(
          usageSummary.primaryContextTokens,
        )}`
      : "--";
  const usageRatio =
    model?.contextWindow && usageSummary.primaryContextTokens !== null
      ? usageSummary.primaryContextTokens / model.contextWindow
      : null;
  const usagePercent = usageRatio === null ? null : formatPercent(usageRatio);
  const progressValue = Math.min(usageRatio ?? 0, 1) * 100;
  const usageDescription = model?.contextWindow
    ? usagePercent
      ? `${usagePercent} of the ${formatCompactTokenCount(model.contextWindow)} window.`
      : "Context usage is unavailable."
    : "Context window unavailable.";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={250}
        closeDelay={0}
        render={
          <button
            type="button"
            aria-label={`Context usage ${usagePercent ?? primaryLabel}`}
            className="inline-flex size-7 items-center justify-center rounded-full text-memora-olive transition-colors hover:bg-memora-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft"
          >
            <svg viewBox="0 0 36 36" className="size-5 -rotate-90" aria-hidden="true">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-20"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                pathLength="100"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${progressValue} 100`}
              />
            </svg>
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" align="end" sideOffset={10} className="z-30">
          <Tooltip.Popup className="rounded-xl border border-memora-border bg-memora-surface px-3 py-2 text-xs text-memora-text-muted shadow-sm-soft">
            {usageDescription}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
