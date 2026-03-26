import type {
  AgentConfig,
  AgentEvent,
  AgentHooks,
  AgentMessage,
  AgentMessageContent,
  HookContext,
  LLMRequestPayload,
  ResponsesRequestPayload,
  ResponsesToolDefinition,
  ResponsesBuiltinToolDefinition,
  LoopState,
  PersistenceAdapter,
  MessageTransformer,
  ResponseTransformer,
  ThinkResult,
  ToolDefinition,
  PromptSegment,
  TokenUsage,
} from "./types";
import { ContextManager, createContextManager } from "./context";
import { ToolRegistry, createToolRegistry } from "./tools";
import { PromptComposer, createPromptComposer } from "./prompt";
import { TransformPipeline, createTransformPipeline, responsesTransform } from "./transform";
import { parseSSEStream, parseResponsesStream } from "./stream";
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
  hooks?: AgentHooks;
  persistence?: PersistenceAdapter;
}

export class Agent {
  readonly config: AgentConfig;
  readonly context: ContextManager;
  readonly tools: ToolRegistry;
  readonly prompt: PromptComposer;
  readonly transform: TransformPipeline;

  private hooks: AgentHooks;
  private state: LoopState;
  private builtinTools: ResponsesBuiltinToolDefinition[] = [];
  private abortController: AbortController | null = null;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.hooks = options.hooks ?? {};
    this.tools = createToolRegistry();
    this.prompt = createPromptComposer();
    this.transform = createTransformPipeline();

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

  registerTool<TParams, TResult>(tool: Partial<ToolDefinition<TParams, TResult>>): void {
    if (tool.type === "function" && tool.name && tool.parameters && tool.execute) {
      this.tools.register(tool as ToolDefinition<TParams, TResult>);
    } else if (tool.type && tool.type !== "function") {
      this.builtinTools.push(tool as unknown as ResponsesBuiltinToolDefinition);
    }
  }

  addPromptSegment(segment: PromptSegment): void {
    this.prompt.add(segment);
  }

  useTransformer(transformer: MessageTransformer): void {
    this.transform.use(transformer);
  }

  useResponseTransformer(transformer: ResponseTransformer): void {
    this.transform.useResponse(transformer);
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
      // Input
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

      // Loop: Think - Action - Observation
      const maxIterations = this.config.maxIterations ?? 10;

      while (this.state.iteration < maxIterations && !this.state.aborted) {
        this.state.iteration++;

        // Think
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
          // Complete (no tool calls = final response)
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

        // Action
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

        // Observation
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

      if (this.state.aborted) {
        yield {
          type: "error",
          error: new Error("Agent loop aborted"),
        };
      } else {
        yield {
          type: "error",
          error: new Error(`Max iterations (${maxIterations}) reached`),
        };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.state.phase = "error";

      if (this.hooks.onError) {
        await this.hooks.onError(this.createHookContext(), err);
      }

      yield { type: "error", error: err };
    } finally {
      this.abortController = null;
    }
  }

  private async *think(): AsyncGenerator<AgentEvent, ThinkResult> {
    const systemPrompt = await this.prompt.compose();
    let finalSystemPrompt = systemPrompt.trim();
    try {
      const personality = await this.context.loadMemory<string>(PERSONALITY_MEMORY_KEY);
      const notices = await this.context.loadMemory<MemoryNotice[]>(NOTICES_MEMORY_KEY);
      finalSystemPrompt = mergeSystemPromptWithMemory(
        finalSystemPrompt,
        typeof personality === "string" ? personality : "",
        Array.isArray(notices) ? notices : [],
      );
    } catch {
      // Personality context is best-effort; failures should not block chat.
    }

    const maxContextChars = this.config.maxContextChars ?? 100000;
    const allMessages = this.context.getMessages();
    const messages = trimContext(allMessages, maxContextChars);
    const apiFormat = this.config.apiFormat ?? "chat-completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    let payload: string;
    let streamParser: (response: Response) => AsyncGenerator<AgentEvent>;

    if (apiFormat === "responses") {
      const inputItems = responsesTransform(messages);
      const functionTools = this.tools.toResponsesFormat();
      const configBuiltins = (this.config.builtinTools ?? []) as ResponsesBuiltinToolDefinition[];
      const allTools: ResponsesToolDefinition[] = [
        ...functionTools,
        ...this.builtinTools,
        ...configBuiltins,
      ];

      const requestPayload: ResponsesRequestPayload = {
        model: this.config.model,
        input: inputItems,
        stream: true,
        ...(finalSystemPrompt ? { instructions: finalSystemPrompt } : {}),
        ...(allTools.length > 0 ? { tools: allTools } : {}),
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined
          ? { max_output_tokens: this.config.maxTokens }
          : {}),
      };

      payload = JSON.stringify(requestPayload);
      streamParser = parseResponsesStream;
    } else {
      const llmMessages = await this.transform.run(messages, {
        tools: this.tools.list(),
      });

      if (finalSystemPrompt) {
        llmMessages.unshift({ role: "system", content: finalSystemPrompt });
      }

      const toolDefs = this.tools.toLLMFormat();

      const requestPayload: LLMRequestPayload = {
        model: this.config.model,
        messages: llmMessages,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined ? { max_tokens: this.config.maxTokens } : {}),
      };

      payload = JSON.stringify(requestPayload);
      streamParser = parseSSEStream;
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers,
      body: payload,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${body}`);
    }

    let text = "";
    const collectedEvents: AgentEvent[] = [];
    let usage: TokenUsage | undefined;

    for await (const event of streamParser(response)) {
      if (this.state.aborted) break;

      yield event;
      collectedEvents.push(event);

      if (event.type === "text-delta") {
        text += event.delta;
      } else if (event.type === "usage") {
        usage = event.usage;
      }
    }

    const result = await this.transform.runResponse(collectedEvents);
    return {
      ...result,
      usage,
    };
  }

  private createHookContext(): HookContext {
    return {
      state: { ...this.state },
      messages: this.context.getMessages(),
      getRelevantContext: () => this.context.getRelevantContext(),
    };
  }
}

export const createAgent = (options: AgentOptions): Agent => {
  return new Agent(options);
};
