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

const CONTINUE_AFTER_ITERATION_LIMIT_PROMPT =
  "Continue from where you left off and finish the user's request. Keep using tools when needed.";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
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
  const agentSignatureRef = useRef("");
  const initialMessagesRef = useRef<ChatMessage[]>(
    options.initialMessages ?? [],
  );

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
  }, [options.sessionId]);

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

  const handleEvent = useCallback((
    event: AgentEvent,
    streamingId: string,
    reasoningStepIdRef: { current: string },
    searchStepIdRef: { current: string },
    streamedTextRef: { current: string },
    usageRef: { current?: TokenUsage },
    logger: ReturnType<typeof createDevAgentLogger>,
    removeEmptyBubble: () => void,
  ) => {
    switch (event.type) {
      case "status": {
        if (event.status === "in_progress") {
          setStatus({ type: "thinking" });
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
        setStatus((prev) =>
          prev.type !== "generating" ? { type: "generating" } : prev,
        );
        if (!streamedTextRef.current) {
          setThinkingCollapsed(true);
        }
        streamedTextRef.current += event.delta;
        const text = streamedTextRef.current;
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, content: text } : m)),
        );
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
        break;
      }

      case "error": {
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  content:
                    event.message.content
                      .filter(
                        (c): c is { type: "text"; text: string } =>
                          c.type === "text",
                      )
                      .map((c) => c.text)
                      .join("") || streamedTextRef.current,
                  ...(event.usage ? { usage: event.usage } : {}),
                }
              : m,
          ),
        );
        logger.logEvent({ type: event.type, usage: event.usage });
        break;
      }
    }
  }, [addChildStep, addStep, appendStepText, parseIterationLimit, updateStep]);

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
          if (!streamedTextRef.current) {
            setMessages((prev) => prev.filter((m) => m.id !== streamingId));
          }
        };

        for await (const event of agent.run(agentInput)) {
          handleEvent(
            event,
            streamingId,
            reasoningStepIdRef,
            searchStepIdRef,
            streamedTextRef,
            usageRef,
            logger,
            removeEmptyBubble,
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  thinkingSteps: [...thinkingStepsRef.current],
                  ...(usageRef.current ? { usage: usageRef.current } : {}),
                }
              : m,
          ),
        );
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
        setIsStreaming(false);
        setStatus({ type: "idle" });
      }
    },
    [getAgent, handleEvent, isStreaming, options.sessionId],
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
    agentRef.current?.abort();
    setIsStreaming(false);
    setStatus({ type: "idle" });
    setIterationLimitPrompt(null);
  }, []);

  const reset = useCallback(() => {
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
  }, []);

  const updateMessage = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        let changed = false;
        const next = prev.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          changed = true;
          return updater(message);
        });

        return changed ? next : prev;
      });
    },
    [],
  );

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
    updateMessage,
    saveMemory,
    loadMemory,
  };
};
