import type {
  AgentConfig,
  AgentEvent,
  AgentHooks,
  AgentMessage,
  AgentMessageContent,
  HookContext,
  LoopState,
  PersistenceAdapter,
  ProviderAdapter,
  ProviderEvent,
  ThinkResult,
  ToolDefinition,
  PromptSegment,
  TokenUsage,
} from "./types";
import { ContextManager, createContextManager } from "./context";
import { ToolRegistry, createToolRegistry } from "./tools";
import { PromptComposer, createPromptComposer } from "./prompt";
import { InMemoryAdapter } from "./persistence";
import { generateId, now } from "./utils";

const truncateResult = (result: unknown, maxChars: number): unknown => {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= maxChars) return result;
  const truncated = str.slice(0, maxChars);
  return truncated + `\n\n[Truncated: showing ${maxChars} of ${str.length} characters]`;
};

const estimateChars = (messages: AgentMessage[]): number => {
  let total = 0;
  for (const msg of messages) {
    for (const c of msg.content) {
      if (c.type === "text") total += c.text.length;
      else if (c.type === "tool_result") {
        total += typeof c.result === "string" ? c.result.length : JSON.stringify(c.result).length;
      } else if (c.type === "tool_call") {
        total += JSON.stringify(c.arguments).length;
      }
    }
  }
  return total;
};

const trimContext = (messages: AgentMessage[], maxChars: number): AgentMessage[] => {
  if (estimateChars(messages) <= maxChars) return messages;
  const first = messages[0];
  const last = messages[messages.length - 1];
  if (messages.length <= 2) return messages;
  let trimmed = [...messages];
  while (trimmed.length > 2 && estimateChars(trimmed) > maxChars) {
    trimmed = [first, ...trimmed.slice(2)];
  }
  if (estimateChars(trimmed) > maxChars && trimmed.length > 1) {
    trimmed = [first, last];
  }
  return trimmed;
};

const PERSONALITY_MEMORY_KEY = "personality";
const NOTICES_MEMORY_KEY = "notices";

interface MemoryNotice {
  text: string;
}

const mergeSystemPromptWithMemory = (
  systemPrompt: string,
  personalityText: string,
  notices: MemoryNotice[],
): string => {
  const normalizedSystemPrompt = systemPrompt.trim();
  const normalizedPersonality = personalityText.trim();
  const normalizedNotices = notices
    .map((notice) => (typeof notice.text === "string" ? notice.text.trim() : ""))
    .filter((notice) => notice.length > 0);

  const memorySections: string[] = [];
  if (normalizedPersonality) {
    memorySections.push(["## User Personality Context", normalizedPersonality].join("\n\n"));
  }

  if (normalizedNotices.length > 0) {
    memorySections.push(
      ["## Stable User Preferences", ...normalizedNotices.map((notice) => `- ${notice}`)].join(
        "\n",
      ),
    );
  }

  if (memorySections.length === 0) {
    return normalizedSystemPrompt;
  }

  if (!normalizedSystemPrompt) {
    return memorySections.join("\n\n");
  }

  return [normalizedSystemPrompt, ...memorySections].join("\n\n");
};

export interface AgentOptions {
  config: AgentConfig;
  provider: ProviderAdapter;
  hooks?: AgentHooks;
  persistence?: PersistenceAdapter;
}

export class Agent {
  readonly config: AgentConfig;
  readonly context: ContextManager;
  readonly tools: ToolRegistry;
  readonly prompt: PromptComposer;

  private hooks: AgentHooks;
  private provider: ProviderAdapter;
  private state: LoopState;
  private abortController: AbortController | null = null;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.provider = options.provider;
    this.hooks = options.hooks ?? {};
    this.tools = createToolRegistry();
    this.prompt = createPromptComposer();

    const persistence = options.persistence ?? new InMemoryAdapter();
    this.context = createContextManager(this.config.id, persistence);

    this.state = {
      phase: "input",
      iteration: 0,
      agentId: this.config.id,
      aborted: false,
    };
  }

  async init(): Promise<void> {
    await this.context.load();
  }

  registerTool<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    this.tools.register(tool);
  }

  addPromptSegment(segment: PromptSegment): void {
    this.prompt.add(segment);
  }

  setHooks(hooks: Partial<AgentHooks>): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  abort(): void {
    this.state.aborted = true;
    this.abortController?.abort();
  }

  async replaceHistory(messages: AgentMessage[]): Promise<void> {
    await this.context.replaceMessages(messages);
  }

  async *run(input: string | AgentMessage): AsyncGenerator<AgentEvent> {
    this.state = {
      phase: "input",
      iteration: 0,
      agentId: this.config.id,
      aborted: false,
    };
    this.abortController = new AbortController();

    try {
      const inputMessage: AgentMessage =
        typeof input === "string"
          ? {
              id: generateId(),
              role: "user",
              content: [{ type: "text", text: input }],
              createdAt: now(),
            }
          : input;

      await this.context.append(inputMessage);

      const hookCtx = this.createHookContext();
      if (this.hooks.onAfterInput) {
        await this.hooks.onAfterInput(hookCtx, inputMessage);
      }

      const maxIterations = this.config.maxIterations ?? 10;

      while (this.state.iteration < maxIterations && !this.state.aborted) {
        this.state.iteration++;

        this.state.phase = "think";
        if (this.hooks.onBeforeThink) {
          await this.hooks.onBeforeThink(this.createHookContext());
        }

        const thinkResult = yield* this.think();

        if (this.state.aborted) break;

        if (this.hooks.onAfterThink) {
          await this.hooks.onAfterThink(this.createHookContext(), thinkResult);
        }

        if (thinkResult.toolCalls.length === 0) {
          this.state.phase = "complete";
          const assistantMessage: AgentMessage = {
            id: generateId(),
            role: "assistant",
            content: [{ type: "text", text: thinkResult.text }],
            createdAt: now(),
            ...(thinkResult.reasoning ? { reasoning: thinkResult.reasoning } : {}),
          };
          await this.context.append(assistantMessage);

          if (this.hooks.onComplete) {
            await this.hooks.onComplete(this.createHookContext(), assistantMessage);
          }

          yield {
            type: "done",
            message: assistantMessage,
            ...(thinkResult.usage ? { usage: thinkResult.usage } : {}),
          };
          return;
        }

        this.state.phase = "action";

        const assistantMessage: AgentMessage = {
          id: generateId(),
          role: "assistant",
          content: [
            ...(thinkResult.text ? [{ type: "text" as const, text: thinkResult.text }] : []),
            ...thinkResult.toolCalls,
          ],
          createdAt: now(),
          ...(thinkResult.reasoning ? { reasoning: thinkResult.reasoning } : {}),
        };
        await this.context.append(assistantMessage);

        const toolResultContents: AgentMessageContent[] = [];

        for (const toolCall of thinkResult.toolCalls) {
          if (toolCall.type !== "tool_call") continue;
          if (this.state.aborted) break;

          if (this.hooks.onBeforeAction) {
            await this.hooks.onBeforeAction(this.createHookContext(), toolCall);
          }

          const { result: rawResult, isError } = await this.tools.execute(
            toolCall.name,
            toolCall.arguments,
          );

          const maxResultChars = this.config.maxToolResultChars ?? 8000;
          const result = truncateResult(rawResult, maxResultChars);

          yield {
            type: "tool-result",
            toolCall: { id: toolCall.id, name: toolCall.name },
            result,
            isError,
          };

          if (this.hooks.onAfterAction) {
            await this.hooks.onAfterAction(this.createHookContext(), toolCall, result);
          }

          toolResultContents.push({
            type: "tool_result",
            id: toolCall.id,
            name: toolCall.name,
            result,
            isError,
          });
        }

        this.state.phase = "observation";

        const observationMessage: AgentMessage = {
          id: generateId(),
          role: "tool",
          content: toolResultContents,
          createdAt: now(),
        };

        if (this.hooks.onBeforeObservation) {
          await this.hooks.onBeforeObservation(this.createHookContext(), observationMessage);
        }

        await this.context.append(observationMessage);

        if (this.hooks.onAfterObservation) {
          await this.hooks.onAfterObservation(this.createHookContext(), observationMessage);
        }
      }

      if (!this.state.aborted) {
        yield {
          type: "error",
          error: new Error(`Max iterations (${maxIterations}) reached`),
        };
      }
    } catch (err) {
      this.state.phase = "error";
      const error = err instanceof Error ? err : new Error(String(err));

      if (this.hooks.onError) {
        await this.hooks.onError(this.createHookContext(), error);
      }

      yield { type: "error", error };
    } finally {
      this.abortController = null;
    }
  }

  private createHookContext(): HookContext {
    return {
      state: { ...this.state },
      messages: this.context.getMessages(),
      getRelevantContext: () => this.context.getRelevantContext(),
    };
  }

  private async *think(): AsyncGenerator<AgentEvent, ThinkResult> {
    const baseSystemPrompt = await this.prompt.compose();
    const personalityText = await this.context.loadMemory<string>(PERSONALITY_MEMORY_KEY);
    const notices = (await this.context.loadMemory<MemoryNotice[]>(NOTICES_MEMORY_KEY)) ?? [];
    const systemPrompt = mergeSystemPromptWithMemory(
      baseSystemPrompt,
      personalityText ?? "",
      notices,
    );
    const history = this.context.getMessages();
    const maxContextChars = this.config.maxContextChars ?? 100000;
    const messages = trimContext(history, maxContextChars);

    let text = "";
    let reasoning = "";
    let usage: TokenUsage | undefined;
    const toolCallArguments = new Map<string, string>();
    const toolCalls: AgentMessageContent[] = [];

    const stream = this.provider.stream(
      {
        model: this.config.model,
        systemPrompt,
        messages,
        tools: this.tools.list(),
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined ? { maxTokens: this.config.maxTokens } : {}),
      },
      { signal: this.abortController?.signal },
    );

    for await (const event of stream) {
      if (this.state.aborted) break;

      yield event;

      this.applyProviderEvent(event, {
        appendText: (delta) => {
          text += delta;
        },
        appendReasoning: (delta) => {
          reasoning += delta;
        },
        setUsage: (nextUsage) => {
          usage = nextUsage;
        },
        appendToolArgs: (toolCallId, delta) => {
          toolCallArguments.set(toolCallId, (toolCallArguments.get(toolCallId) ?? "") + delta);
        },
        completeToolCall: (toolCall) => {
          const bufferedArguments = toolCallArguments.get(toolCall.id);
          const parsedArguments = bufferedArguments
            ? parseToolArguments(bufferedArguments, toolCall.arguments)
            : toolCall.arguments;
          toolCalls.push({
            type: "tool_call",
            id: toolCall.id,
            name: toolCall.name,
            arguments: parsedArguments,
          });
        },
      });
    }

    return { text, reasoning, toolCalls, ...(usage ? { usage } : {}) };
  }

  private applyProviderEvent(
    event: ProviderEvent,
    handlers: {
      appendText: (delta: string) => void;
      appendReasoning: (delta: string) => void;
      setUsage: (usage: TokenUsage) => void;
      appendToolArgs: (toolCallId: string, delta: string) => void;
      completeToolCall: (toolCall: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }) => void;
    },
  ): void {
    switch (event.type) {
      case "text-delta":
        handlers.appendText(event.delta);
        break;
      case "reasoning-delta":
        handlers.appendReasoning(event.delta);
        break;
      case "reasoning-done":
        if (!event.text) break;
        handlers.appendReasoning(event.text);
        break;
      case "usage":
        handlers.setUsage(event.usage);
        break;
      case "tool-call-args-delta":
        handlers.appendToolArgs(event.toolCallId, event.delta);
        break;
      case "tool-call-complete":
        handlers.completeToolCall(event.toolCall);
        break;
      default:
        break;
    }
  }
}

const parseToolArguments = (
  rawArguments: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(rawArguments);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
};

export const createAgent = (options: AgentOptions): Agent => {
  return new Agent(options);
};
