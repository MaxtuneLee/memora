import { useRef, useState, useCallback, useEffect } from "react";
import {
  createAgent,
  createInMemoryAdapter,
  type Agent,
  type AgentConfig,
  type AgentHooks,
  type AgentEvent,
  type ToolDefinition,
  type MessageTransformer,
  type ResponseTransformer,
  type PromptSegment,
  type PersistenceAdapter,
} from "@memora/ai-core";

const CONTINUE_AFTER_ITERATION_LIMIT_PROMPT =
  "Continue from where you left off and finish the user's request. Keep using tools when needed.";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingSteps?: ThinkingStep[];
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
  send: (input: string) => Promise<void>;
  continueAfterIterationLimit: () => Promise<void>;
  dismissIterationLimitPrompt: () => void;
  abort: () => void;
  reset: () => void;
  saveMemory: (key: string, value: unknown) => Promise<void>;
  loadMemory: <T = unknown>(key: string) => Promise<T | null>;
}

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
    options.config.apiFormat,
    options.config.apiKey,
    options.config.endpoint,
    options.config.id,
    options.config.model,
    options.hooks,
    options.persistence,
    options.promptSegments,
    options.responseTransformers,
    options.sessionId,
    options.tools,
    options.transformers,
  ]);

  const addStep = (step: ThinkingStep) => {
    setThinkingSteps((prev) => {
      const next = [...prev, step];
      thinkingStepsRef.current = next;
      return next;
    });
  };

  const updateStep = (id: string, updates: Partial<ThinkingStep>) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      thinkingStepsRef.current = next;
      return next;
    });
  };

  const appendStepText = (id: string, delta: string) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, text: s.text + delta } : s,
      );
      thinkingStepsRef.current = next;
      return next;
    });
  };

  const addChildStep = (parentId: string, child: ThinkingStep) => {
    setThinkingSteps((prev) => {
      const next = prev.map((s) =>
        s.id === parentId
          ? { ...s, children: [...(s.children ?? []), child] }
          : s,
      );
      thinkingStepsRef.current = next;
      return next;
    });
  };

  const parseIterationLimit = (error: Error): number | null => {
    const match = error.message.match(/Max iterations \((\d+)\) reached/i);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };

  const handleEvent = (
    event: AgentEvent,
    streamingId: string,
    reasoningStepIdRef: { current: string },
    searchStepIdRef: { current: string },
    streamedTextRef: { current: string },
    removeEmptyBubble: () => void,
  ) => {
    switch (event.type) {
      case "status": {
        if (event.status === "in_progress") {
          setStatus({ type: "thinking" });
        }
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
        if (reasoningStepIdRef.current) {
          updateStep(reasoningStepIdRef.current, {
            text: event.text,
            status: "done",
          });
          reasoningStepIdRef.current = "";
        }
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
        } else if (event.status === "completed") {
          if (searchStepIdRef.current) {
            updateStep(searchStepIdRef.current, { status: "done" });
            searchStepIdRef.current = "";
          }
          setStatus({ type: "thinking" });
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
        }
        break;
      }

      case "text-delta": {
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
        break;
      }

      case "tool-result": {
        setStatus({ type: "tool-running", toolName: event.toolCall.name });
        break;
      }

      case "tool-call-complete": {
        updateStep(event.toolCall.id, { status: "done" });
        setStatus({ type: "thinking" });
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
        removeEmptyBubble();
        break;
      }

      case "done": {
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
                }
              : m,
          ),
        );
        break;
      }
    }
  };

  const runTurn = useCallback(
    async (input: string, userMessageContent: string = input) => {
      if (isStreaming) return;

      setError(null);
      setIterationLimitPrompt(null);
      setIsStreaming(true);
      setStatus({ type: "thinking" });
      setThinkingSteps([]);
      thinkingStepsRef.current = [];
      setThinkingCollapsed(false);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessageContent,
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

      try {
        const agent = await getAgent();

        const removeEmptyBubble = () => {
          if (!streamedTextRef.current) {
            setMessages((prev) => prev.filter((m) => m.id !== streamingId));
          }
        };

        for await (const event of agent.run(input)) {
          handleEvent(
            event,
            streamingId,
            reasoningStepIdRef,
            searchStepIdRef,
            streamedTextRef,
            removeEmptyBubble,
          );
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? { ...m, thinkingSteps: [...thinkingStepsRef.current] }
              : m,
          ),
        );
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus({ type: "error" });
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsStreaming(false);
        setStatus({ type: "idle" });
      }
    },
    [getAgent, handleEvent, isStreaming],
  );

  const send = useCallback(
    async (input: string) => {
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
    saveMemory,
    loadMemory,
  };
};
