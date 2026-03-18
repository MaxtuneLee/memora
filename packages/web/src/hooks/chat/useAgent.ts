import { useRef, useState, useCallback, useEffect } from "react";
import {
  createAgent,
  createInMemoryAdapter,
  type Agent,
  type AgentConfig,
  type AgentMessage,
  type AgentHooks,
  type AgentEvent,
  type TokenUsage,
  type ToolDefinition,
  type MessageTransformer,
  type ResponseTransformer,
  type PromptSegment,
  type PersistenceAdapter,
} from "@memora/ai-core";

import {
  type ChatImageAttachment,
  type ChatInputImage,
} from "@/lib/chat/chatImageAttachments";
import {
  type ChatWidget,
  type ChatWidgetPhase,
  SHOW_WIDGET_TOOL_NAME,
  parsePartialShowWidgetArguments,
  sanitizeShowWidgetArguments,
} from "@/lib/chat/showWidget";
import {
  clearShowWidgetDebug,
  updateShowWidgetDebug,
} from "@/lib/chat/showWidgetDebug";

const CONTINUE_AFTER_ITERATION_LIMIT_PROMPT =
  "Continue from where you left off and finish the user's request. Keep using tools when needed.";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidget[];
  thinkingSteps?: ThinkingStep[];
  usage?: TokenUsage;
}

export interface ChatTurnInput {
  text: string;
  images: ChatInputImage[];
}

interface IterationLimitPrompt {
  iterations: number;
}

export interface ThinkingStep {
  id: string;
  type: "reasoning" | "web-search" | "tool-call" | "output-item";
  text: string;
  status: "in_progress" | "done";
  children?: ThinkingStep[];
}

export type AgentStatus =
  | { type: "idle" }
  | { type: "thinking" }
  | { type: "generating" }
  | { type: "tool-calling"; toolName: string }
  | { type: "tool-running"; toolName: string }
  | { type: "searching" }
  | { type: "error" };

interface UseAgentOptions {
  sessionId: string;
  initialMessages?: ChatMessage[];
  config: Partial<AgentConfig>;
  hooks?: AgentHooks;
  persistence?: PersistenceAdapter;
  tools?: Partial<ToolDefinition>[];
  promptSegments?: PromptSegment[];
  transformers?: MessageTransformer[];
  responseTransformers?: ResponseTransformer[];
}

interface UseAgentReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  status: AgentStatus;
  thinkingSteps: ThinkingStep[];
  thinkingCollapsed: boolean;
  iterationLimitPrompt: IterationLimitPrompt | null;
  error: Error | null;
  send: (input: string | ChatTurnInput) => Promise<void>;
  continueAfterIterationLimit: () => Promise<void>;
  dismissIterationLimitPrompt: () => void;
  abort: () => void;
  reset: () => void;
  updateMessage: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  saveMemory: (key: string, value: unknown) => Promise<void>;
  loadMemory: <T = unknown>(key: string) => Promise<T | null>;
}

const IS_DEV = import.meta.env.DEV;

const normalizeTurnInput = (input: string | ChatTurnInput): ChatTurnInput => {
  if (typeof input === "string") {
    return {
      text: input,
      images: [],
    };
  }

  return {
    text: input.text,
    images: input.images ?? [],
  };
};

const buildAgentInput = (
  input: ChatTurnInput,
  messageId: string,
): string | AgentMessage => {
  if (input.images.length === 0) {
    return input.text;
  }

  return {
    id: messageId,
    role: "user",
    createdAt: Date.now(),
    content: [
      ...(input.text
        ? [
            {
              type: "text" as const,
              text: input.text,
            },
          ]
        : []),
      ...input.images.map((image) => ({
        type: "image" as const,
        mimeType: image.attachment.mimeType,
        data: image.data,
      })),
    ],
  };
};

const formatUsageSummary = (usage?: TokenUsage): string => {
  if (!usage) return "none";

  const parts = [
    usage.inputTokens !== undefined ? `in=${usage.inputTokens}` : null,
    usage.outputTokens !== undefined ? `out=${usage.outputTokens}` : null,
    usage.totalTokens !== undefined ? `total=${usage.totalTokens}` : null,
  ].filter((value): value is string => value !== null);

  return parts.join(" ") || "none";
};

const toLogValue = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 4000
      ? `${serialized.slice(0, 4000)}…`
      : serialized;
  } catch {
    return String(value);
  }
};

const createDevAgentLogger = (sessionId: string) => {
  if (!IS_DEV) {
    return {
      logTurnStart: (_payload: {
        userMessageId: string;
        assistantMessageId: string;
        inputLength: number;
        input: unknown;
        imageCount: number;
      }) => {},
      logEvent: (_payload: {
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
      }) => {},
      logTurnEnd: (_payload: {
        durationMs: number;
        textLength: number;
        usage?: TokenUsage;
        finalContent: string;
      }) => {},
      logTurnError: (_payload: { durationMs: number; error: Error }) => {},
    };
  }

  return {
      logTurnStart: (payload: {
        userMessageId: string;
        assistantMessageId: string;
        inputLength: number;
        input: unknown;
        imageCount: number;
      }) => {
        console.info("[agent] turn:start", {
          sessionId,
          userMessageId: payload.userMessageId,
          assistantMessageId: payload.assistantMessageId,
          inputLength: payload.inputLength,
          imageCount: payload.imageCount,
          input: toLogValue(payload.input),
        });
      },
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
    }) => {
      console.info("[agent] event", {
        sessionId,
        type: payload.type,
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.toolName ? { toolName: payload.toolName } : {}),
        ...(payload.toolCallId ? { toolCallId: payload.toolCallId } : {}),
        ...(payload.isError !== undefined ? { isError: payload.isError } : {}),
        ...(payload.queries ? { queries: payload.queries } : {}),
        ...(payload.resultsCount !== undefined
          ? { resultsCount: payload.resultsCount }
          : {}),
        ...(payload.usage ? { usage: formatUsageSummary(payload.usage) } : {}),
        ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
        ...(payload.content !== undefined
          ? { content: toLogValue(payload.content) }
          : {}),
        ...(payload.delta !== undefined ? { delta: toLogValue(payload.delta) } : {}),
        ...(payload.toolArguments !== undefined
          ? { toolArguments: toLogValue(payload.toolArguments) }
          : {}),
        ...(payload.toolResult !== undefined
          ? { toolResult: toLogValue(payload.toolResult) }
          : {}),
      });
    },
    logTurnEnd: (payload: {
      durationMs: number;
      textLength: number;
      usage?: TokenUsage;
      finalContent: string;
    }) => {
      console.info("[agent] turn:end", {
        sessionId,
        durationMs: payload.durationMs,
        textLength: payload.textLength,
        usage: formatUsageSummary(payload.usage),
        finalContent: toLogValue(payload.finalContent),
      });
    },
    logTurnError: (payload: { durationMs: number; error: Error }) => {
      console.error("[agent] turn:error", {
        sessionId,
        durationMs: payload.durationMs,
        errorMessage: payload.error.message,
      });
    },
  };
};

const areStatusEqual = (left: AgentStatus, right: AgentStatus): boolean => {
  const leftToolName = "toolName" in left ? left.toolName : undefined;
  const rightToolName = "toolName" in right ? right.toolName : undefined;
  return left.type === right.type && leftToolName === rightToolName;
};

const areWidgetsEqual = (left: ChatWidget, right: ChatWidget): boolean => {
  if (
    left.toolCallId !== right.toolCallId ||
    left.title !== right.title ||
    left.widgetCode !== right.widgetCode ||
    left.phase !== right.phase ||
    left.errorMessage !== right.errorMessage ||
    left.loadingMessages.length !== right.loadingMessages.length
  ) {
    return false;
  }

  return left.loadingMessages.every((message, index) => {
    return message === right.loadingMessages[index];
  });
};

interface ParsedShowWidgetSnapshot {
  title: string;
  loadingMessages: string[];
  widgetCode: string;
}

const areParsedShowWidgetSnapshotsEqual = (
  left: ParsedShowWidgetSnapshot | null,
  right: ParsedShowWidgetSnapshot | null,
): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.title !== right.title ||
    left.widgetCode !== right.widgetCode ||
    left.loadingMessages.length !== right.loadingMessages.length
  ) {
    return false;
  }

  return left.loadingMessages.every((message, index) => {
    return message === right.loadingMessages[index];
  });
};

const toParsedShowWidgetSnapshot = (
  rawArgsBuffer: string,
): ParsedShowWidgetSnapshot | null => {
  const partialArguments = parsePartialShowWidgetArguments(rawArgsBuffer);
  if (!partialArguments) {
    return null;
  }

  return {
    title: partialArguments.title ?? "",
    loadingMessages: partialArguments.loading_messages ?? [],
    widgetCode: partialArguments.widget_code ?? "",
  };
};

export const useAgent = (options: UseAgentOptions): UseAgentReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    options.initialMessages ?? [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<AgentStatus>({ type: "idle" });
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false);
  const [iterationLimitPrompt, setIterationLimitPrompt] =
    useState<IterationLimitPrompt | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const initializedRef = useRef(false);
  const thinkingStepsRef = useRef<ThinkingStep[]>([]);
  const rawWidgetArgsBufferByToolCallIdRef = useRef(new Map<string, string>());
  const scheduledWidgetFrameByToolCallIdRef = useRef(new Map<string, number>());
  const latestParsedWidgetSnapshotByToolCallIdRef = useRef(
    new Map<string, ParsedShowWidgetSnapshot | null>(),
  );
  const streamingMessageIdByToolCallIdRef = useRef(new Map<string, string>());
  const latestWidgetDeltaByToolCallIdRef = useRef(new Map<string, string>());
  const agentSignatureRef = useRef("");
  const initialMessagesRef = useRef<ChatMessage[]>(
    options.initialMessages ?? [],
  );

  const clearBufferedWidgetState = useCallback(() => {
    scheduledWidgetFrameByToolCallIdRef.current.forEach((frameId) => {
      window.cancelAnimationFrame(frameId);
    });
    scheduledWidgetFrameByToolCallIdRef.current = new Map();
    rawWidgetArgsBufferByToolCallIdRef.current = new Map();
    latestParsedWidgetSnapshotByToolCallIdRef.current = new Map();
    streamingMessageIdByToolCallIdRef.current = new Map();
    latestWidgetDeltaByToolCallIdRef.current = new Map();
  }, []);

  useEffect(() => {
    initialMessagesRef.current = options.initialMessages ?? [];
  }, [options.initialMessages]);

  useEffect(() => {
    agentRef.current?.abort();
    agentRef.current = null;
    initializedRef.current = false;
    agentSignatureRef.current = "";
    setMessages(initialMessagesRef.current);
    setIsStreaming(false);
    setStatus({ type: "idle" });
    setThinkingSteps([]);
    thinkingStepsRef.current = [];
    setThinkingCollapsed(false);
    setIterationLimitPrompt(null);
    setError(null);
    clearBufferedWidgetState();
  }, [clearBufferedWidgetState, options.sessionId]);

  const getAgent = useCallback(async (): Promise<Agent> => {
    const signature = [
      options.sessionId,
      options.config.id ?? "",
      options.config.endpoint ?? "",
      options.config.model ?? "",
      options.config.apiFormat ?? "",
      options.config.apiKey ?? "",
    ].join("::");

    if (
      agentRef.current &&
      initializedRef.current &&
      agentSignatureRef.current === signature
    ) {
      return agentRef.current;
    }

    agentRef.current?.abort();

    const agent = createAgent({
      config: options.config as AgentConfig,
      hooks: options.hooks,
      persistence: options.persistence ?? createInMemoryAdapter(),
    });

    options.tools?.forEach((tool) => agent.registerTool(tool));
    options.promptSegments?.forEach((seg) => agent.addPromptSegment(seg));
    options.transformers?.forEach((t) => agent.useTransformer(t));
    options.responseTransformers?.forEach((t) =>
      agent.useResponseTransformer(t),
    );

    await agent.init();
    agentRef.current = agent;
    initializedRef.current = true;
    agentSignatureRef.current = signature;
    return agent;
  }, [
    options.config,
    options.hooks,
    options.persistence,
    options.promptSegments,
    options.responseTransformers,
    options.sessionId,
    options.tools,
    options.transformers,
  ]);

  const addStep = useCallback((step: ThinkingStep) => {
    setThinkingSteps((prev) => {
      const next = [...prev, step];
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<ThinkingStep>) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const appendStepText = useCallback((id: string, delta: string) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, text: s.text + delta } : s,
      );
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const addChildStep = useCallback((parentId: string, child: ThinkingStep) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) =>
        s.id === parentId
          ? { ...s, children: [...(s.children ?? []), child] }
          : s,
      );
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const parseIterationLimit = useCallback((error: Error): number | null => {
    const match = error.message.match(/Max iterations \((\d+)\) reached/i);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }, []);

  const updateMessageById = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          const updatedMessage = updater(message);
          if (updatedMessage !== message) {
            changed = true;
          }
          return updatedMessage;
        });

        return changed ? next : prev;
      });
    },
    [],
  );

  const upsertWidget = useCallback(
    (
      messageId: string,
      toolCallId: string,
      updater: (widget: ChatWidget | undefined) => ChatWidget,
    ) => {
      updateMessageById(messageId, (message) => {
        const currentWidgets = message.widgets ?? [];
        const widgetIndex = currentWidgets.findIndex((widget) => {
          return widget.toolCallId === toolCallId;
        });
        const currentWidget =
          widgetIndex >= 0 ? currentWidgets[widgetIndex] : undefined;
        const nextWidget = updater(currentWidget);

        if (currentWidget && areWidgetsEqual(currentWidget, nextWidget)) {
          return message;
        }

        const widgets = [...currentWidgets];
        if (widgetIndex >= 0) {
          widgets[widgetIndex] = nextWidget;
        } else {
          widgets.push(nextWidget);
        }

        return {
          ...message,
          widgets,
        };
      });
    },
    [updateMessageById],
  );

  const cancelScheduledWidgetFlush = useCallback((toolCallId: string) => {
    const frameId = scheduledWidgetFrameByToolCallIdRef.current.get(toolCallId);
    if (frameId === undefined) {
      return;
    }

    window.cancelAnimationFrame(frameId);
    scheduledWidgetFrameByToolCallIdRef.current.delete(toolCallId);
  }, []);

  const flushBufferedWidget = useCallback(
    (
      toolCallId: string,
      options?: {
        phase?: ChatWidgetPhase;
        errorMessage?: string;
        debugEvent?: {
          type: string;
          summary: string;
          details?: Record<string, unknown>;
        };
      },
    ) => {
      cancelScheduledWidgetFlush(toolCallId);

      const messageId = streamingMessageIdByToolCallIdRef.current.get(toolCallId);
      const rawArgsBuffer =
        rawWidgetArgsBufferByToolCallIdRef.current.get(toolCallId) ?? "";
      const latestDelta =
        latestWidgetDeltaByToolCallIdRef.current.get(toolCallId) ?? "";
      const nextSnapshot = toParsedShowWidgetSnapshot(rawArgsBuffer);
      const previousSnapshot =
        latestParsedWidgetSnapshotByToolCallIdRef.current.get(toolCallId) ?? null;

      if (nextSnapshot) {
        latestParsedWidgetSnapshotByToolCallIdRef.current.set(
          toolCallId,
          nextSnapshot,
        );
      }

      updateShowWidgetDebug(
        toolCallId,
        {
          argsBuffer: rawArgsBuffer,
          latestDelta,
          ...(nextSnapshot ? { widgetCode: nextSnapshot.widgetCode } : {}),
          ...(options?.phase ? { phase: options.phase } : {}),
        },
        options?.debugEvent
          ? {
              type: options.debugEvent.type,
              summary: options.debugEvent.summary,
              details: {
                bufferLength: rawArgsBuffer.length,
                latestDeltaLength: latestDelta.length,
                parsed: Boolean(nextSnapshot),
                widgetCodeLength: nextSnapshot?.widgetCode.length ?? null,
                ...options.debugEvent.details,
              },
            }
          : {
              type: "tool-call-args-flush",
              summary: nextSnapshot
                ? "Committed buffered show_widget snapshot"
                : "Buffered show_widget snapshot not yet parseable",
              details: {
                bufferLength: rawArgsBuffer.length,
                latestDeltaLength: latestDelta.length,
                parsed: Boolean(nextSnapshot),
                widgetCodeLength: nextSnapshot?.widgetCode.length ?? null,
              },
            },
      );

      if (!messageId) {
        return;
      }

      const shouldApplySnapshot =
        nextSnapshot !== null &&
        !areParsedShowWidgetSnapshotsEqual(previousSnapshot, nextSnapshot);
      const shouldApplyPatch =
        options?.phase !== undefined || options?.errorMessage !== undefined;

      if (!shouldApplySnapshot && !shouldApplyPatch) {
        return;
      }

      upsertWidget(messageId, toolCallId, (currentWidget) => {
        const fallbackSnapshot = nextSnapshot ?? previousSnapshot;
        return {
          toolCallId,
          title:
            fallbackSnapshot?.title ?? currentWidget?.title ?? "",
          loadingMessages:
            fallbackSnapshot?.loadingMessages ??
            currentWidget?.loadingMessages ??
            [],
          widgetCode:
            fallbackSnapshot?.widgetCode ?? currentWidget?.widgetCode ?? "",
          phase: options?.phase ?? currentWidget?.phase ?? "streaming",
          ...(options?.errorMessage !== undefined
            ? { errorMessage: options.errorMessage }
            : currentWidget?.errorMessage
              ? { errorMessage: currentWidget.errorMessage }
              : {}),
        };
      });
    },
    [cancelScheduledWidgetFlush, upsertWidget],
  );

  const flushAllBufferedWidgets = useCallback(() => {
    for (const toolCallId of streamingMessageIdByToolCallIdRef.current.keys()) {
      flushBufferedWidget(toolCallId, {
        debugEvent: {
          type: "tool-call-args-flush-all",
          summary: "Flushed buffered show_widget snapshot during cleanup",
        },
      });
    }
  }, [flushBufferedWidget]);

  const scheduleBufferedWidgetFlush = useCallback(
    (toolCallId: string) => {
      if (scheduledWidgetFrameByToolCallIdRef.current.has(toolCallId)) {
        return;
      }

      const frameId = window.requestAnimationFrame(() => {
        scheduledWidgetFrameByToolCallIdRef.current.delete(toolCallId);
        flushBufferedWidget(toolCallId);
      });
      scheduledWidgetFrameByToolCallIdRef.current.set(toolCallId, frameId);
    },
    [flushBufferedWidget],
  );

  const handleEvent = useCallback((
    event: AgentEvent,
    streamingId: string,
    reasoningStepIdRef: { current: string },
    searchStepIdRef: { current: string },
    widgetStartedRef: { current: boolean },
    streamedTextRef: { current: string },
    usageRef: { current?: TokenUsage },
    logger: ReturnType<typeof createDevAgentLogger>,
    removeEmptyBubble: () => void,
  ) => {
    switch (event.type) {
      case "status": {
        if (event.status === "in_progress") {
          setStatus((prev) => {
            const nextStatus: AgentStatus = { type: "thinking" };
            return areStatusEqual(prev, nextStatus) ? prev : nextStatus;
          });
        }
        logger.logEvent({ type: event.type, status: event.status });
        break;
      }

      case "reasoning-delta": {
        if (!reasoningStepIdRef.current) {
          const id = crypto.randomUUID();
          reasoningStepIdRef.current = id;
          addStep({
            id,
            type: "reasoning",
            text: event.delta,
            status: "in_progress",
          });
          setStatus({ type: "thinking" });
        } else {
          appendStepText(reasoningStepIdRef.current, event.delta);
        }
        break;
      }

      case "reasoning-done": {
        logger.logEvent({ type: event.type, content: event.text });
        if (reasoningStepIdRef.current) {
          updateStep(reasoningStepIdRef.current, {
            text: event.text,
            status: "done",
          });
          reasoningStepIdRef.current = "";
        }
        break;
      }

      case "usage": {
        usageRef.current = event.usage;
        logger.logEvent({ type: event.type, usage: event.usage });
        break;
      }

      case "web-search": {
        if (event.status === "in_progress" || event.status === "searching") {
          if (!searchStepIdRef.current) {
            const id = crypto.randomUUID();
            searchStepIdRef.current = id;
            addStep({
              id,
              type: "web-search",
              text: "",
              status: "in_progress",
              children: [],
            });
          }
          setStatus({ type: "searching" });
          logger.logEvent({ type: event.type, status: event.status });
        } else if (event.status === "completed") {
          if (searchStepIdRef.current) {
            updateStep(searchStepIdRef.current, { status: "done" });
            searchStepIdRef.current = "";
          }
          setStatus({ type: "thinking" });
          logger.logEvent({ type: event.type, status: event.status });
        }
        break;
      }

      case "output-item-added": {
        if (event.itemType === "web_search_call") {
          if (!searchStepIdRef.current) {
            const id = crypto.randomUUID();
            searchStepIdRef.current = id;
            addStep({
              id,
              type: "web-search",
              text: "",
              status: "in_progress",
              children: [],
            });
          }
          setStatus({ type: "searching" });
          logger.logEvent({ type: event.type, status: "searching" });
        }
        break;
      }

      case "output-item-done": {
        if (event.itemType === "web_search_call" && searchStepIdRef.current) {
          const queries = (event.item as { queries?: string[] }).queries ?? [];
          const results =
            (
              event.item as {
                results?: Array<{ title?: string; url?: string }>;
              }
            ).results ?? [];
          const searchText = queries.join(", ");

          updateStep(searchStepIdRef.current, {
            text: searchText,
            status: "done",
          });

          for (const result of results) {
            addChildStep(searchStepIdRef.current, {
              id: crypto.randomUUID(),
              type: "web-search",
              text: result.title ?? result.url ?? "",
              status: "done",
            });
          }

          searchStepIdRef.current = "";
          setStatus({ type: "thinking" });
          logger.logEvent({
            type: event.type,
            queries,
            resultsCount: results.length,
            content: results.map((result) => result.title ?? result.url ?? ""),
          });
        }
        break;
      }

      case "text-delta": {
        if (!streamedTextRef.current) {
          logger.logEvent({ type: event.type, status: "generating" });
        }
        setStatus((prev) => {
          const nextStatus: AgentStatus = { type: "generating" };
          return areStatusEqual(prev, nextStatus) ? prev : nextStatus;
        });
        if (!streamedTextRef.current) {
          setThinkingCollapsed(true);
        }
        streamedTextRef.current += event.delta;
        const text = streamedTextRef.current;
        updateMessageById(streamingId, (message) => {
          if (message.content === text) {
            return message;
          }

          return {
            ...message,
            content: text,
          };
        });
        break;
      }

      case "tool-call-start": {
        setStatus({ type: "tool-calling", toolName: event.toolCall.name });
        addStep({
          id: event.toolCall.id,
          type: "tool-call",
          text: event.toolCall.name,
          status: "in_progress",
        });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          widgetStartedRef.current = true;
          rawWidgetArgsBufferByToolCallIdRef.current.set(event.toolCall.id, "");
          latestParsedWidgetSnapshotByToolCallIdRef.current.set(
            event.toolCall.id,
            null,
          );
          streamingMessageIdByToolCallIdRef.current.set(
            event.toolCall.id,
            streamingId,
          );
          latestWidgetDeltaByToolCallIdRef.current.set(event.toolCall.id, "");
          clearShowWidgetDebug(event.toolCall.id);
          updateShowWidgetDebug(
            event.toolCall.id,
            {
              argsBuffer: "",
              latestDelta: "",
              widgetCode: "",
              phase: "streaming",
            },
            {
              type: "tool-call-start",
              summary: "show_widget started",
              details: {
                assistantMessageId: streamingId,
              },
            },
          );
          upsertWidget(streamingId, event.toolCall.id, (currentWidget) => ({
            toolCallId: event.toolCall.id,
            title: currentWidget?.title ?? "",
            loadingMessages: currentWidget?.loadingMessages ?? [],
            widgetCode: currentWidget?.widgetCode ?? "",
            phase: currentWidget?.phase ?? "streaming",
            ...(currentWidget?.errorMessage
              ? { errorMessage: currentWidget.errorMessage }
              : {}),
          }));
        }
        break;
      }

      case "tool-call-args-delta": {
        const previousBuffer = rawWidgetArgsBufferByToolCallIdRef.current.get(
          event.toolCallId,
        );
        if (previousBuffer === undefined) {
          break;
        }

        const nextBuffer = `${previousBuffer}${event.delta}`;
        rawWidgetArgsBufferByToolCallIdRef.current.set(event.toolCallId, nextBuffer);
        latestWidgetDeltaByToolCallIdRef.current.set(event.toolCallId, event.delta);
        scheduleBufferedWidgetFlush(event.toolCallId);
        break;
      }

      case "tool-result": {
        setStatus({ type: "tool-running", toolName: event.toolCall.name });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
          isError: event.isError,
          toolResult: event.result,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          const errorMessage =
            event.isError && typeof event.result === "string"
              ? event.result
              : event.isError
                ? "show_widget failed."
                : undefined;
          flushBufferedWidget(event.toolCall.id, {
            phase: event.isError ? "error" : "ready",
            ...(errorMessage ? { errorMessage } : {}),
            debugEvent: {
              type: "tool-result",
              summary: event.isError
                ? "show_widget returned an error"
                : "show_widget finished successfully",
              details: {
                isError: event.isError,
                resultPreview:
                  typeof event.result === "string"
                    ? event.result.slice(0, 240)
                    : toLogValue(event.result),
              },
            },
          });
        }
        break;
      }

      case "tool-call-complete": {
        updateStep(event.toolCall.id, { status: "done" });
        setStatus({ type: "thinking" });
        logger.logEvent({
          type: event.type,
          toolName: event.toolCall.name,
          toolCallId: event.toolCall.id,
        });
        if (event.toolCall.name === SHOW_WIDGET_TOOL_NAME) {
          const completeArguments = sanitizeShowWidgetArguments(event.toolCall.arguments);
          rawWidgetArgsBufferByToolCallIdRef.current.set(
            event.toolCall.id,
            JSON.stringify({
              i_have_seen_read_me: completeArguments.i_have_seen_read_me ?? true,
              title: completeArguments.title ?? "",
              loading_messages: completeArguments.loading_messages ?? [],
              widget_code: completeArguments.widget_code ?? "",
            }),
          );
          flushBufferedWidget(event.toolCall.id, {
            phase: "streaming",
            debugEvent: {
              type: "tool-call-complete",
              summary: "show_widget arguments completed",
              details: {
                title: completeArguments.title ?? "",
                loadingMessagesCount:
                  completeArguments.loading_messages?.length ?? 0,
                widgetCodeLength: completeArguments.widget_code?.length ?? 0,
              },
            },
          });
        }
        break;
      }

      case "error": {
        flushAllBufferedWidgets();
        const iterations = parseIterationLimit(event.error);
        if (iterations !== null) {
          setIterationLimitPrompt({ iterations });
          setError(null);
          setStatus({ type: "idle" });
        } else {
          setError(event.error);
          setStatus({ type: "error" });
        }
        logger.logEvent({
          type: event.type,
          errorMessage: event.error.message,
        });
        removeEmptyBubble();
        break;
      }

      case "done": {
        usageRef.current = event.usage;
        updateMessageById(streamingId, (message) => {
          const nextContent =
            event.message.content
              .filter(
                (c): c is { type: "text"; text: string } => c.type === "text",
              )
              .map((c) => c.text)
              .join("") || streamedTextRef.current;
          const nextUsage = event.usage;
          const usageUnchanged =
            message.usage?.inputTokens === nextUsage?.inputTokens &&
            message.usage?.outputTokens === nextUsage?.outputTokens &&
            message.usage?.totalTokens === nextUsage?.totalTokens;

          if (message.content === nextContent && usageUnchanged) {
            return message;
          }

          return {
            ...message,
            content: nextContent,
            ...(nextUsage ? { usage: nextUsage } : {}),
          };
        });
        logger.logEvent({ type: event.type, usage: event.usage });
        break;
      }
    }
  }, [
    addChildStep,
    addStep,
    appendStepText,
    flushAllBufferedWidgets,
    flushBufferedWidget,
    parseIterationLimit,
    scheduleBufferedWidgetFlush,
    updateStep,
    updateMessageById,
    upsertWidget,
  ]);

  const runTurn = useCallback(
    async (input: string | ChatTurnInput, userMessageContent?: string) => {
      if (isStreaming) return;

      const normalizedInput = normalizeTurnInput(input);
      const userMessageId = crypto.randomUUID();
      const agentInput = buildAgentInput(normalizedInput, userMessageId);
      const userAttachments = normalizedInput.images.map((image) => image.attachment);

      setError(null);
      setIterationLimitPrompt(null);
      setIsStreaming(true);
      setStatus({ type: "thinking" });
      setThinkingSteps([]);
      thinkingStepsRef.current = [];
      setThinkingCollapsed(false);
      clearBufferedWidgetState();

      const userMsg: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: userMessageContent ?? normalizedInput.text,
        ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
      };
      setMessages((prev) => [...prev, userMsg]);

      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: "assistant", content: "" },
      ]);

      const reasoningStepIdRef = { current: "" };
      const searchStepIdRef = { current: "" };
      const widgetStartedRef = { current: false };
      const streamedTextRef = { current: "" };
      const usageRef: { current?: TokenUsage } = {};
      const logger = createDevAgentLogger(options.sessionId);
      const turnStartedAt = Date.now();

      logger.logTurnStart({
        userMessageId: userMsg.id,
        assistantMessageId: streamingId,
        inputLength: normalizedInput.text.length,
        input: {
          text: normalizedInput.text,
          imageNames: userAttachments.map((attachment) => attachment.name),
        },
        imageCount: normalizedInput.images.length,
      });

      try {
        const agent = await getAgent();

        const removeEmptyBubble = () => {
          if (!streamedTextRef.current && !widgetStartedRef.current) {
            setMessages((prev) => prev.filter((m) => m.id !== streamingId));
          }
        };

        for await (const event of agent.run(agentInput)) {
          handleEvent(
            event,
            streamingId,
            reasoningStepIdRef,
            searchStepIdRef,
            widgetStartedRef,
            streamedTextRef,
            usageRef,
            logger,
            removeEmptyBubble,
          );
        }

        updateMessageById(streamingId, (message) => {
          return {
            ...message,
            thinkingSteps: [...thinkingStepsRef.current],
            ...(usageRef.current ? { usage: usageRef.current } : {}),
          };
        });
        logger.logTurnEnd({
          durationMs: Date.now() - turnStartedAt,
          textLength: streamedTextRef.current.length,
          usage: usageRef.current,
          finalContent: streamedTextRef.current,
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus({ type: "error" });
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
        logger.logTurnError({
          durationMs: Date.now() - turnStartedAt,
          error: e,
        });
      } finally {
        flushAllBufferedWidgets();
        setIsStreaming(false);
        setStatus({ type: "idle" });
        clearBufferedWidgetState();
      }
    },
    [
      clearBufferedWidgetState,
      flushAllBufferedWidgets,
      getAgent,
      handleEvent,
      isStreaming,
      options.sessionId,
      updateMessageById,
    ],
  );

  const send = useCallback(
    async (input: string | ChatTurnInput) => {
      await runTurn(input);
    },
    [runTurn],
  );

  const continueAfterIterationLimit = useCallback(async () => {
    if (!iterationLimitPrompt || isStreaming) return;
    await runTurn(CONTINUE_AFTER_ITERATION_LIMIT_PROMPT, "Continue");
  }, [isStreaming, iterationLimitPrompt, runTurn]);

  const dismissIterationLimitPrompt = useCallback(() => {
    setIterationLimitPrompt(null);
  }, []);

  const saveMemory = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      const agent = await getAgent();
      await agent.context.saveMemory(key, value);
    },
    [getAgent],
  );

  const loadMemory = useCallback(
    async <T = unknown>(key: string): Promise<T | null> => {
      const agent = await getAgent();
      return agent.context.loadMemory<T>(key);
    },
    [getAgent],
  );

  const abort = useCallback(() => {
    flushAllBufferedWidgets();
    agentRef.current?.abort();
    setIsStreaming(false);
    setStatus({ type: "idle" });
    setIterationLimitPrompt(null);
    clearBufferedWidgetState();
  }, [clearBufferedWidgetState, flushAllBufferedWidgets]);

  const reset = useCallback(() => {
    flushAllBufferedWidgets();
    agentRef.current?.abort();
    agentRef.current = null;
    initializedRef.current = false;
    agentSignatureRef.current = "";
    setMessages([]);
    setIsStreaming(false);
    setStatus({ type: "idle" });
    setThinkingSteps([]);
    thinkingStepsRef.current = [];
    setIterationLimitPrompt(null);
    setError(null);
    clearBufferedWidgetState();
  }, [clearBufferedWidgetState, flushAllBufferedWidgets]);

  return {
    messages,
    isStreaming,
    status,
    thinkingSteps,
    thinkingCollapsed,
    iterationLimitPrompt,
    error,
    send,
    continueAfterIterationLimit,
    dismissIterationLimitPrompt,
    abort,
    reset,
    updateMessage: updateMessageById,
    saveMemory,
    loadMemory,
  };
};
