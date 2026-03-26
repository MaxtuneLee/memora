import type { TokenUsage } from "@memora/ai-core";

const IS_DEV = import.meta.env.DEV;

const formatUsageSummary = (usage?: TokenUsage): string => {
  if (!usage) {
    return "none";
  }

  const parts = [
    usage.inputTokens !== undefined ? `in=${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `out=${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `total=${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.join(" ") || "none";
};

const toLogValue = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}...` : value;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}...` : serialized;
  } catch {
    return String(value);
  }
};

export interface DevAgentLogger {
  logTurnStart: (payload: {
    userMessageId: string;
    assistantMessageId: string;
    inputLength: number;
    input: unknown;
    imageCount: number;
  }) => void;
  logEvent: (payload: {
    type: string;
    status?: string;
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    queries?: string[];
    resultsCount?: number;
    usage?: TokenUsage;
    errorMessage?: string;
    content?: unknown;
    delta?: string;
    toolArguments?: Record<string, unknown>;
    toolResult?: unknown;
  }) => void;
  logTurnEnd: (payload: {
    durationMs: number;
    textLength: number;
    usage?: TokenUsage;
    finalContent: string;
  }) => void;
  logTurnError: (payload: { durationMs: number; error: Error }) => void;
}

export const createDevAgentLogger = (sessionId: string): DevAgentLogger => {
  if (!IS_DEV) {
    return {
      logTurnStart: () => {},
      logEvent: () => {},
      logTurnEnd: () => {},
      logTurnError: () => {},
    };
  }

  return {
    logTurnStart: (payload) => {
      console.info("[agent] turn:start", {
        sessionId,
        userMessageId: payload.userMessageId,
        assistantMessageId: payload.assistantMessageId,
        inputLength: payload.inputLength,
        imageCount: payload.imageCount,
        input: toLogValue(payload.input),
      });
    },
    logEvent: (payload) => {
      console.info("[agent] event", {
        sessionId,
        type: payload.type,
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.toolName ? { toolName: payload.toolName } : {}),
        ...(payload.toolCallId ? { toolCallId: payload.toolCallId } : {}),
        ...(payload.isError !== undefined ? { isError: payload.isError } : {}),
        ...(payload.queries ? { queries: payload.queries } : {}),
        ...(payload.resultsCount !== undefined ? { resultsCount: payload.resultsCount } : {}),
        ...(payload.usage ? { usage: formatUsageSummary(payload.usage) } : {}),
        ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
        ...(payload.content !== undefined ? { content: toLogValue(payload.content) } : {}),
        ...(payload.delta !== undefined ? { delta: toLogValue(payload.delta) } : {}),
        ...(payload.toolArguments !== undefined
          ? { toolArguments: toLogValue(payload.toolArguments) }
          : {}),
        ...(payload.toolResult !== undefined ? { toolResult: toLogValue(payload.toolResult) } : {}),
      });
    },
    logTurnEnd: (payload) => {
      console.info("[agent] turn:end", {
        sessionId,
        durationMs: payload.durationMs,
        textLength: payload.textLength,
        usage: formatUsageSummary(payload.usage),
        finalContent: toLogValue(payload.finalContent),
      });
    },
    logTurnError: (payload) => {
      console.error("[agent] turn:error", {
        sessionId,
        durationMs: payload.durationMs,
        errorMessage: payload.error.message,
      });
    },
  };
};
