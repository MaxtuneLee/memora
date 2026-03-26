import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAgent,
  createInMemoryAdapter,
  type Agent,
  type AgentConfig,
  type TokenUsage,
} from "@memora/ai-core";

import { createAgentEventHandler } from "@/hooks/chat/useAgent/createAgentEventHandler";
import {
  buildAgentInput,
  normalizeTurnInput,
  toAgentHistoryMessages,
} from "@/hooks/chat/useAgent/input";
import { createDevAgentLogger } from "@/hooks/chat/useAgent/logger";
import {
  type AgentStatus,
  type ChatMessage,
  type ChatTurnInput,
  type IterationLimitPrompt,
  type RunTurnOptions,
  type ThinkingStep,
  type UseAgentOptions,
  type UseAgentReturn,
} from "@/hooks/chat/useAgent/types";
import { useShowWidgetBuffer } from "@/hooks/chat/useAgent/useShowWidgetBuffer";

const CONTINUE_AFTER_ITERATION_LIMIT_PROMPT =
  "Continue from where you left off and finish the user's request. Keep using tools when needed.";
export type {
  AgentStatus,
  ChatMessage,
  ChatTurnInput,
  ThinkingStep,
} from "@/hooks/chat/useAgent/types";

export const useAgent = (options: UseAgentOptions): UseAgentReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>(options.initialMessages ?? []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<AgentStatus>({ type: "idle" });
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false);
  const [iterationLimitPrompt, setIterationLimitPrompt] = useState<IterationLimitPrompt | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const initializedRef = useRef(false);
  const thinkingStepsRef = useRef<ThinkingStep[]>([]);
  const agentSignatureRef = useRef("");
  const initialMessagesRef = useRef<ChatMessage[]>(options.initialMessages ?? []);
  const updateMessageById = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((previous) => {
        let changed = false;
        const next = previous.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          const updatedMessage = updater(message);
          if (updatedMessage !== message) {
            changed = true;
          }
          return updatedMessage;
        });

        return changed ? next : previous;
      });
    },
    [],
  );
  const widgetBuffer = useShowWidgetBuffer(updateMessageById);

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
    widgetBuffer.clearBufferedWidgetState();
  }, [options.sessionId, widgetBuffer]);

  const getAgent = useCallback(async (): Promise<Agent> => {
    const signature = [
      options.sessionId,
      options.config.id ?? "",
      options.config.endpoint ?? "",
      options.config.model ?? "",
      options.config.apiFormat ?? "",
      options.config.apiKey ?? "",
    ].join("::");

    if (agentRef.current && initializedRef.current && agentSignatureRef.current === signature) {
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
    options.responseTransformers?.forEach((t) => agent.useResponseTransformer(t));

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
      const next = prev.map((s) => (s.id === id ? { ...s, text: s.text + delta } : s));
      thinkingStepsRef.current = next;
      return next;
    });
  }, []);

  const addChildStep = useCallback((parentId: string, child: ThinkingStep) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) =>
        s.id === parentId ? { ...s, children: [...(s.children ?? []), child] } : s,
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

  const runTurn = useCallback(
    async (input: string | ChatTurnInput, turnOptions?: RunTurnOptions) => {
      if (isStreaming) return;

      const normalizedInput = normalizeTurnInput(input);
      const userMessageId = turnOptions?.existingUserMessage?.id ?? crypto.randomUUID();
      const userAttachments = normalizedInput.images.map((image) => image.attachment);
      const userMsg: ChatMessage = turnOptions?.existingUserMessage ?? {
        id: userMessageId,
        role: "user",
        content: turnOptions?.userMessageContent ?? normalizedInput.text,
        ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
      };
      const agentInput = turnOptions?.existingUserMessage
        ? {
            id: userMsg.id,
            role: "user" as const,
            createdAt: Date.now(),
            content: [
              ...(normalizedInput.text
                ? [
                    {
                      type: "text" as const,
                      text: normalizedInput.text,
                    },
                  ]
                : []),
              ...normalizedInput.images.map((image) => ({
                type: "image" as const,
                mimeType: image.attachment.mimeType,
                data: image.data,
              })),
            ],
          }
        : buildAgentInput(normalizedInput, userMessageId);

      setError(null);
      setIterationLimitPrompt(null);
      setIsStreaming(true);
      setStatus({ type: "thinking" });
      setThinkingSteps([]);
      thinkingStepsRef.current = [];
      setThinkingCollapsed(false);
      widgetBuffer.clearBufferedWidgetState();

      if (!turnOptions?.existingUserMessage) {
        setMessages((prev) => [...prev, userMsg]);
      }

      const streamingId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: streamingId, role: "assistant", content: "" }]);

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
            setMessages((previous) => {
              return previous.filter((message) => message.id !== streamingId);
            });
          }
        };

        const handleEvent = createAgentEventHandler({
          streamingId,
          addStep,
          updateStep,
          appendStepText,
          addChildStep,
          setStatus,
          setThinkingCollapsed,
          setError,
          setIterationLimitPrompt,
          updateMessageById,
          parseIterationLimit,
          widgetBuffer,
          reasoningStepIdRef,
          searchStepIdRef,
          widgetStartedRef,
          streamedTextRef,
          usageRef,
          logger,
          removeEmptyBubble,
        });

        for await (const event of agent.run(agentInput)) {
          handleEvent(event);
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
        setMessages((previous) => {
          return previous.filter((message) => message.id !== streamingId);
        });
        logger.logTurnError({
          durationMs: Date.now() - turnStartedAt,
          error: e,
        });
      } finally {
        widgetBuffer.flushAllBufferedWidgets();
        setIsStreaming(false);
        setStatus({ type: "idle" });
        widgetBuffer.clearBufferedWidgetState();
      }
    },
    [
      addChildStep,
      addStep,
      appendStepText,
      getAgent,
      isStreaming,
      updateMessageById,
      updateStep,
      widgetBuffer,
    ],
  );

  const send = useCallback(
    async (input: string | ChatTurnInput, options?: RunTurnOptions) => {
      await runTurn(input, options);
    },
    [runTurn],
  );

  const continueAfterIterationLimit = useCallback(async () => {
    if (!iterationLimitPrompt || isStreaming) return;
    await runTurn(CONTINUE_AFTER_ITERATION_LIMIT_PROMPT, {
      userMessageContent: "Continue",
    });
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
    widgetBuffer.flushAllBufferedWidgets();
    agentRef.current?.abort();
    setIsStreaming(false);
    setStatus({ type: "idle" });
    setIterationLimitPrompt(null);
    widgetBuffer.clearBufferedWidgetState();
  }, [widgetBuffer]);

  const reset = useCallback(
    async (options?: { messages?: ChatMessage[]; contextMessages?: ChatMessage[] }) => {
      widgetBuffer.flushAllBufferedWidgets();
      agentRef.current?.abort();
      const nextMessages = options?.messages ?? [];
      const nextContextMessages = options?.contextMessages ?? nextMessages;
      initialMessagesRef.current = nextMessages;
      setMessages(nextMessages);
      setIsStreaming(false);
      setStatus({ type: "idle" });
      setThinkingSteps([]);
      thinkingStepsRef.current = [];
      setThinkingCollapsed(false);
      setIterationLimitPrompt(null);
      setError(null);
      widgetBuffer.clearBufferedWidgetState();

      const agent = await getAgent();
      await agent.context.clear();
      for (const message of toAgentHistoryMessages(nextContextMessages)) {
        await agent.context.append(message);
      }
    },
    [getAgent, widgetBuffer],
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
    updateMessage: updateMessageById,
    saveMemory,
    loadMemory,
  };
};
