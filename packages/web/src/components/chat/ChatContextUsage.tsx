import { Tooltip } from "@base-ui/react/tooltip";

import { cn } from "@/lib/cn";
import type { ChatImageAttachment } from "@/lib/chat/chatImageAttachments";
import type { ResolvedReferenceScope } from "@/lib/chat/tools";
import type { ChatMessage } from "@/hooks/chat/useAgent";
import type { ModelInfo } from "@/types/settingsDialog";

interface ChatContextUsageProps {
  composerImageCount: number;
  composerText: string;
  messages: readonly ChatMessage[];
  model: ModelInfo | null;
  referenceCount: number;
  resolvedReferenceScope: ResolvedReferenceScope;
  selectedModelId: string;
}

interface UsageSummary {
  description: string;
  draftEstimate: number;
  latestInputTokens?: number;
  latestOutputTokens?: number;
  latestTotalTokens?: number;
  measuredUsageRatio: number | null;
  primaryApproximate: boolean;
  primaryContextTokens: number | null;
  projectedNextTurnTokens: number | null;
  projectedUsageRatio: number | null;
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

const formatExactTokenCount = (value: number): string => {
  return `${value.toLocaleString()} tokens`;
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

const buildScopeSummary = (
  referenceCount: number,
  resolvedReferenceScope: ResolvedReferenceScope,
): string => {
  if (!resolvedReferenceScope.isActive) {
    return referenceCount > 0
      ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`
      : "No references";
  }

  const fileCount = resolvedReferenceScope.fileIds.length;
  const prefix = `${referenceCount} ref${referenceCount === 1 ? "" : "s"}`;
  if (resolvedReferenceScope.truncated) {
    return `${prefix} · ${fileCount}/${resolvedReferenceScope.totalResolvedFiles} files`;
  }
  return `${prefix} · ${fileCount} file${fileCount === 1 ? "" : "s"}`;
};

function ContextMetric({
  emphasis = "normal",
  label,
  value,
}: {
  emphasis?: "muted" | "normal";
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-medium",
          emphasis === "muted" ? "text-zinc-500" : "text-zinc-800",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ChatContextUsage({
  composerImageCount,
  composerText,
  messages,
  model,
  referenceCount,
  resolvedReferenceScope,
  selectedModelId,
}: ChatContextUsageProps) {
  const usageSummary = ((): UsageSummary => {
    const latestMeasuredMessage = [...messages]
      .reverse()
      .find((message) => {
        if (message.role !== "assistant" || !message.usage) {
          return false;
        }

        return (
          message.usage.inputTokens !== undefined ||
          message.usage.totalTokens !== undefined
        );
      });

    const latestInputTokens = latestMeasuredMessage?.usage?.inputTokens;
    const latestOutputTokens = latestMeasuredMessage?.usage?.outputTokens;
    const latestTotalTokens = latestMeasuredMessage?.usage?.totalTokens;
    const draftEstimate =
      estimateTextTokens(composerText) +
      composerImageCount * IMAGE_ATTACHMENT_TOKENS;
    const fallbackConversationEstimate =
      messages.reduce((total, message) => total + estimateMessageTokens(message), 0) +
      draftEstimate;

    const primaryContextTokens =
      latestInputTokens ??
      latestTotalTokens ??
      (fallbackConversationEstimate > 0 ? fallbackConversationEstimate : null);
    const primaryApproximate =
      latestInputTokens === undefined && latestTotalTokens === undefined;
    const projectedNextTurnTokens =
      latestInputTokens !== undefined
        ? latestInputTokens + (latestOutputTokens ?? 0) + draftEstimate
        : latestTotalTokens !== undefined
          ? latestTotalTokens + draftEstimate
          : primaryContextTokens;
    const measuredUsageRatio =
      model?.contextWindow && primaryContextTokens
        ? primaryContextTokens / model.contextWindow
        : null;
    const projectedUsageRatio =
      model?.contextWindow && projectedNextTurnTokens
        ? projectedNextTurnTokens / model.contextWindow
        : null;

    let description =
      "Send a message to capture measured context tokens from the provider.";

    if (latestInputTokens !== undefined) {
      description =
        "Latest input tokens come from the last completed turn. Draft and next-turn numbers are estimated.";
    } else if (latestTotalTokens !== undefined) {
      description =
        "Provider returned total tokens but not prompt-only tokens, so context is inferred from that total.";
    } else if (primaryContextTokens !== null) {
      description =
        "No provider usage yet. Current context is a rough estimate from visible chat content and the draft.";
    }

    return {
      description,
      draftEstimate,
      latestInputTokens,
      latestOutputTokens,
      latestTotalTokens,
      measuredUsageRatio,
      primaryApproximate,
      primaryContextTokens,
      projectedNextTurnTokens,
      projectedUsageRatio,
    };
  })();

  const primaryLabel =
    usageSummary.primaryContextTokens !== null
      ? `${usageSummary.primaryApproximate ? "~" : ""}${formatCompactTokenCount(
          usageSummary.primaryContextTokens,
        )}`
      : "--";
  const scopeSummary = buildScopeSummary(referenceCount, resolvedReferenceScope);
  const usagePercent =
    usageSummary.measuredUsageRatio !== null
      ? formatPercent(usageSummary.measuredUsageRatio)
      : null;
  const projectedPercent =
    usageSummary.projectedUsageRatio !== null
      ? formatPercent(usageSummary.projectedUsageRatio)
      : null;
  const progressWidth =
    usageSummary.projectedUsageRatio !== null
      ? `${Math.min(usageSummary.projectedUsageRatio, 1) * 100}%`
      : "0%";
  const resolvedModelLabel = model?.name ?? model?.id ?? selectedModelId;
  const debugContextWindow = model?.contextWindow?.toLocaleString() ?? "missing";
  const debugMaxOutputTokens = model?.maxOutputTokens?.toLocaleString() ?? "missing";
  const debugModelId = model?.id || selectedModelId || "none";
  const metadataStatus = model
    ? "Parsed"
    : selectedModelId
      ? "Missing"
      : "Unavailable";
  const metadataNote =
    selectedModelId && !model
      ? "Saved provider metadata does not currently include a matching entry for the selected model, so limit-based percentages are unavailable."
      : null;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={250}
        closeDelay={0}
        render={
          <button
            type="button"
            aria-label={`Context usage ${primaryLabel}`}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-zinc-50/90 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10"
          >
            <span className="uppercase tracking-[0.18em] text-zinc-400">
              Ctx
            </span>
            <span className="text-zinc-700">{primaryLabel}</span>
            {usagePercent && (
              <span className="rounded-full bg-zinc-200/70 px-1.5 py-0.5 text-[10px] text-zinc-500">
                {usagePercent}
              </span>
            )}
          </button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          align="end"
          sideOffset={10}
          className="z-30"
        >
          <Tooltip.Popup className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-zinc-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800">
                  Context usage
                </p>
                <p className="mt-1 leading-relaxed text-zinc-500">
                  {usageSummary.description}
                </p>
                {metadataNote && (
                  <p className="mt-1 leading-relaxed text-amber-600">
                    {metadataNote}
                  </p>
                )}
              </div>
              {resolvedModelLabel && (
                <span className="max-w-[11rem] truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  {resolvedModelLabel}
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <ContextMetric
                label="Latest input"
                value={
                  usageSummary.latestInputTokens !== undefined
                    ? formatExactTokenCount(usageSummary.latestInputTokens)
                    : "Unavailable"
                }
                emphasis={
                  usageSummary.latestInputTokens !== undefined ? "normal" : "muted"
                }
              />
              <ContextMetric
                label="Latest output"
                value={
                  usageSummary.latestOutputTokens !== undefined
                    ? formatExactTokenCount(usageSummary.latestOutputTokens)
                    : "Unavailable"
                }
                emphasis={
                  usageSummary.latestOutputTokens !== undefined ? "normal" : "muted"
                }
              />
              <ContextMetric
                label="Projected next turn"
                value={
                  usageSummary.projectedNextTurnTokens !== null
                    ? `~${formatExactTokenCount(usageSummary.projectedNextTurnTokens)}`
                    : "Unavailable"
                }
                emphasis={
                  usageSummary.projectedNextTurnTokens !== null ? "normal" : "muted"
                }
              />
              <ContextMetric
                label="Draft"
                value={
                  usageSummary.draftEstimate > 0
                    ? `~${formatExactTokenCount(usageSummary.draftEstimate)}`
                    : "Empty"
                }
                emphasis={
                  usageSummary.draftEstimate > 0 ? "normal" : "muted"
                }
              />
              <ContextMetric
                label="Messages"
                value={`${messages.length}`}
              />
              <ContextMetric
                label="Scope"
                value={scopeSummary}
                emphasis={
                  referenceCount > 0 || resolvedReferenceScope.isActive
                    ? "normal"
                    : "muted"
                }
              />
              <ContextMetric
                label="Max output"
                value={
                  model?.maxOutputTokens
                    ? formatExactTokenCount(model.maxOutputTokens)
                    : "Unknown"
                }
                emphasis={model?.maxOutputTokens ? "normal" : "muted"}
              />
              <ContextMetric
                label="Model meta"
                value={metadataStatus}
                emphasis={model ? "normal" : "muted"}
              />
            </div>

            <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-zinc-600">Model window</span>
                <span className="text-zinc-500">
                  {model?.contextWindow
                    ? `${formatExactTokenCount(model.contextWindow)}${
                        projectedPercent ? ` · ${projectedPercent}` : ""
                      }`
                    : "Unknown"}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-zinc-800 transition-[width] duration-200"
                  style={{ width: progressWidth }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>Current draft images</span>
                <span>
                  {composerImageCount} image{composerImageCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
              Values without a prefixed <span className="font-semibold">~</span> are
              reported by the model provider. Estimated values are derived from the
              visible conversation and current draft.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
              Debug: model=<span className="font-mono">{debugModelId}</span> ·
              contextWindow=<span className="font-mono">{debugContextWindow}</span> ·
              maxOutputTokens=<span className="font-mono">{debugMaxOutputTokens}</span>
            </p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
