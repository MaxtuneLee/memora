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
  hasMeasuredUsage: boolean;
  measuredUsageRatio: number | null;
  primaryApproximate: boolean;
  primaryContextTokens: number | null;
  projectedNextTurnTokens: number | null;
  projectedUsageRatio: number | null;
}

interface UsageState {
  badgeClassName: string;
  label: string;
  triggerClassName: string;
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

function UsageDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <p className="text-zinc-500">
        {label}
      </p>
      <p className="text-right font-medium text-zinc-800">
        {value}
      </p>
    </div>
  );
}

const getUsageState = (ratio: number | null, isMeasured: boolean): UsageState => {
  if (ratio === null) {
    return {
      badgeClassName: "border-zinc-200 bg-zinc-100 text-zinc-600",
      label: isMeasured ? "Measured" : "Estimate",
      triggerClassName:
        "border-zinc-200/80 bg-zinc-50/90 text-zinc-500 hover:border-zinc-300 hover:bg-white hover:text-zinc-700",
    };
  }

  if (ratio >= 0.85) {
    return {
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
      label: "Near limit",
      triggerClassName:
        "border-rose-200/80 bg-rose-50/90 text-rose-700 hover:border-rose-300 hover:bg-rose-50",
    };
  }

  if (ratio >= 0.65) {
    return {
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      label: "Watch it",
      triggerClassName:
        "border-amber-200/80 bg-amber-50/90 text-amber-700 hover:border-amber-300 hover:bg-amber-50",
    };
  }

  return {
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Comfortable",
    triggerClassName:
      "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50",
  };
};

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

    const hasMeasuredUsage = latestInputTokens !== undefined;
    let description = "Send one message to replace the estimate with provider data.";

    if (latestInputTokens !== undefined) {
      description = "Current usage comes from the last completed turn.";
    } else if (latestTotalTokens !== undefined) {
      description = "Current usage is inferred from the provider total and your draft.";
    } else if (primaryContextTokens !== null) {
      description = "Current usage is estimated from visible messages and your draft.";
    }

    return {
      description,
      draftEstimate,
      hasMeasuredUsage,
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
  const exactPrimaryLabel =
    usageSummary.primaryContextTokens !== null
      ? `${usageSummary.primaryApproximate ? "~" : ""}${formatExactTokenCount(
          usageSummary.primaryContextTokens,
        )}`
      : "Unavailable";
  const scopeSummary = buildScopeSummary(referenceCount, resolvedReferenceScope);
  const showScopeSummary = referenceCount > 0 || resolvedReferenceScope.isActive;
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
  const status = getUsageState(
    usageSummary.projectedUsageRatio ?? usageSummary.measuredUsageRatio,
    usageSummary.hasMeasuredUsage,
  );
  const resolvedModelLabel = model?.name ?? model?.id ?? selectedModelId;
  const triggerValue = usagePercent ?? primaryLabel;
  const triggerSecondaryValue = usagePercent ? primaryLabel : null;
  const nextTurnLabel =
    usageSummary.projectedNextTurnTokens !== null
      ? `~${formatExactTokenCount(usageSummary.projectedNextTurnTokens)}`
      : "Unavailable";
  const windowSummary = model?.contextWindow
    ? `${formatCompactTokenCount(model.contextWindow)} window`
    : "Window unavailable";
  const subtitle = model?.contextWindow
    ? usagePercent
      ? `${usagePercent} of the ${windowSummary}.`
      : `Start a message to gauge the ${windowSummary}.`
    : "Model limit is unavailable, so this only shows token estimates.";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={250}
        closeDelay={0}
        render={
          <button
            type="button"
            aria-label={`Context usage ${primaryLabel}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10",
              status.triggerClassName,
            )}
          >
            <span className="uppercase tracking-[0.18em]">
              Ctx
            </span>
            <span className="text-zinc-800">{triggerValue}</span>
            {triggerSecondaryValue && (
              <span className="text-zinc-500">{triggerSecondaryValue}</span>
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
          <Tooltip.Popup className="w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-zinc-200 bg-white/95 p-3.5 text-xs shadow-xl backdrop-blur-sm">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900">Context</p>
                  <p className="mt-1 leading-relaxed text-zinc-500">
                    {subtitle}
                  </p>
                  {resolvedModelLabel && (
                    <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                      {resolvedModelLabel}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    status.badgeClassName,
                  )}
                >
                  {status.label}
                </span>
              </div>
              <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      Now
                    </p>
                    <p className="mt-1 text-lg font-semibold text-zinc-900">
                      {primaryLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {exactPrimaryLabel}
                    </p>
                  </div>
                  {usagePercent && (
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                        Window
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-800">
                        {usagePercent}
                      </p>
                    </div>
                  )}
                </div>
                {model?.contextWindow && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className="h-full rounded-full bg-zinc-800 transition-[width] duration-200"
                        style={{ width: progressWidth }}
                      />
                    </div>
                    {projectedPercent && (
                      <p className="mt-2 text-[11px] text-zinc-500">
                        After send: {projectedPercent}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-zinc-200/80 bg-white px-3 py-3">
                <UsageDetail label="Next send" value={nextTurnLabel} />
                <UsageDetail
                  label="Draft"
                  value={
                    usageSummary.draftEstimate > 0
                      ? `~${formatExactTokenCount(usageSummary.draftEstimate)}`
                      : "Empty"
                  }
                />
                {showScopeSummary && (
                  <UsageDetail label="References" value={scopeSummary} />
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-400">
                {usageSummary.description} Values with{" "}
                <span className="font-semibold">~</span> are estimates.
              </p>
            </div>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
