import type {
  AgentMessage,
  AgentMessageContent,
  ModelStream,
  TokenUsage,
  AgentConfig,
  AgentEvent,
  AgentHooks,
  HookContext,
  LoopState,
  PersistenceAdapter,
  ThinkResult,
  ToolDefinition,
  PromptSegment,
} from "./types";
import {
  normalizeContext,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai";
import { clampMaxTokensToContext } from "@earendil-works/pi-ai/api/simple-options";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import * as v from "valibot";

import {
  CACHE_TTL_MS,
  HIGH_WATERMARK,
  MAX_SUMMARY_FAILURES,
  MIN_SAVINGS,
  RECAP_INSTRUCTION,
  SUMMARY_INSTRUCTION,
  protectedBoundary,
  type CompactionState,
  RECALL_TOOL_NAME,
  RecallOutput,
  STORED_TOOL_RESULT_MAX_CHARS,
  isTurnStart,
  planCompaction,
  projectHistory,
  recallMessage,
} from "./compaction";
import {
  getAssistantReasoning,
  getAssistantText,
  toAgentMessageContent,
  toPiContext,
  toTokenUsage,
} from "./pi";
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

const SUMMARY_MAX_TOKENS = 8_192;
const RECAP_MAX_TOKENS = 512;
/** Short conversations need no recap. */
const RECAP_MIN_TOKENS = 8_000;

/** Below this a response is too short to be worth sending, so we fail loudly instead. */
const MIN_OUTPUT_TOKENS = 512;

/**
 * Pi subtracts this margin from the context window before clamping the response ceiling, so a
 * window at or below it always reports zero room no matter how short the history is. The clamp
 * carries no signal for those models, so we leave them alone instead of refusing every turn.
 */
const CONTEXT_SAFETY_TOKENS = 4096;

/**
 * Pi estimates the next prompt from the newest assistant message's real usage plus every
 * message after it. That baseline already counts the messages we just dropped, so a trimmed
 * history keeps the old, larger estimate and the response ceiling stays clamped. Dropping
 * providerMessage makes toPiMessage rebuild the turn with zero usage, which sends pi back to
 * counting the characters we actually kept.
 */
const dropStaleUsage = (messages: AgentMessage[]): AgentMessage[] => {
  return messages.map(({ providerMessage: _providerMessage, ...message }) => message);
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
  model: Model<Api>;
  stream: ModelStream;
  hooks?: AgentHooks;
  persistence?: PersistenceAdapter;
  /** Writes compaction summaries and idle recaps; defaults to the main model. */
  compactionModel?: { model: Model<Api>; stream: ModelStream };
}

export class Agent {
  readonly config: AgentConfig;
  readonly context: ContextManager;
  readonly tools: ToolRegistry;
  readonly prompt: PromptComposer;

  private steeringInputs: AgentMessage[] = [];
  private acceptingInput = false;

  steer(message: AgentMessage): boolean {
    if (!this.acceptingInput || this.state.aborted) return false;
    this.steeringInputs.push(structuredClone(message));
    return true;
  }

  takeUnconsumedSteering(): AgentMessage[] {
    return this.steeringInputs.splice(0);
  }

  private hooks: AgentHooks;
  private model: Model<Api>;
  private stream: ModelStream;
  private compactionModel: { model: Model<Api>; stream: ModelStream };
  private state: LoopState;
  private abortController: AbortController | null = null;

  constructor(options: AgentOptions) {
    this.config = options.config;
    this.model = options.model;
    this.stream = options.stream;
    this.compactionModel = options.compactionModel ?? {
      model: options.model,
      stream: options.stream,
    };
    this.hooks = options.hooks ?? {};
    this.tools = createToolRegistry();
    this.prompt = createPromptComposer();

    const persistence = options.persistence ?? new InMemoryAdapter();
    this.context = createContextManager(this.config.id, persistence);

    if (this.config.compaction) {
      this.tools.register({
        type: "function",
        name: RECALL_TOOL_NAME,
        description:
          "Return the original content behind an omission marker in this conversation. Pass the recall ID from the marker. For long content, pass start (and optionally end) character offsets to read further.",
        parameters: v.object({
          id: v.string(),
          start: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
          end: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        }),
        execute: (args) => recallMessage(this.context.getMessages(), args),
      });
    }

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
    this.acceptingInput = true;

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
            content: thinkResult.providerMessage
              ? toAgentMessageContent(thinkResult.providerMessage)
              : [{ type: "text", text: thinkResult.text }],
            createdAt: now(),
            ...(thinkResult.reasoning ? { reasoning: thinkResult.reasoning } : {}),
            ...(thinkResult.providerMessage
              ? { providerMessage: thinkResult.providerMessage }
              : {}),
          };
          await this.context.append(assistantMessage);

          if (this.steeringInputs.length > 0) continue;
          this.acceptingInput = false;

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
          content: thinkResult.providerMessage
            ? toAgentMessageContent(thinkResult.providerMessage)
            : [
                ...(thinkResult.text ? [{ type: "text" as const, text: thinkResult.text }] : []),
                ...thinkResult.toolCalls,
              ],
          createdAt: now(),
          ...(thinkResult.reasoning ? { reasoning: thinkResult.reasoning } : {}),
          ...(thinkResult.providerMessage ? { providerMessage: thinkResult.providerMessage } : {}),
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

          const images = rawResult instanceof RecallOutput ? rawResult.images : [];
          // With compaction the request shortens results itself, so storage keeps far more of
          // the original for recall.
          const maxResultChars = this.config.compaction
            ? STORED_TOOL_RESULT_MAX_CHARS
            : (this.config.maxToolResultChars ?? 8000);
          const result = truncateResult(
            rawResult instanceof RecallOutput ? rawResult.text : rawResult,
            maxResultChars,
          );

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
            ...(images.length ? { images } : {}),
          });
        }

        this.state.phase = "observation";

        const providerToolResult =
          toolResultContents.length === 1 ? toolResultContents[0] : undefined;

        const observationMessage: AgentMessage = {
          id: generateId(),
          role: "tool",
          content: toolResultContents,
          createdAt: now(),
          providerMessage:
            providerToolResult && providerToolResult.type === "tool_result"
              ? {
                  role: "toolResult",
                  toolCallId: providerToolResult.id,
                  toolName: providerToolResult.name,
                  content: [
                    {
                      type: "text",
                      text: stringifyToolResult(providerToolResult.result),
                    },
                  ],
                  isError: providerToolResult.isError ?? false,
                  timestamp: now(),
                }
              : undefined,
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
      this.acceptingInput = false;
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

  /**
   * Drop the oldest messages until pi's own clamp leaves room for a usable response. Using
   * clampMaxTokensToContext as the predicate keeps this in step with the ceiling the provider
   * will actually apply, instead of a character budget that never saw the context window.
   */
  private fitToContextWindow(history: AgentMessage[], systemPrompt: string): AgentMessage[] {
    if (this.model.contextWindow <= CONTEXT_SAFETY_TOKENS) return history;

    const tools = this.tools.list();
    const desiredMaxTokens = this.config.maxTokens ?? this.model.maxTokens;
    const requiredTokens = Math.min(MIN_OUTPUT_TOKENS, desiredMaxTokens);

    let candidate = history;
    let trimmed = false;

    for (;;) {
      const messages = trimmed ? dropStaleUsage(candidate) : candidate;
      const context = normalizeContext(toPiContext({ systemPrompt, messages, tools }));
      if (clampMaxTokensToContext(this.model, context, desiredMaxTokens) >= requiredTokens) {
        return messages;
      }
      if (candidate.length <= 2) {
        throw new Error(
          `Context window (${this.model.contextWindow} tokens) is full: no room left for a reply. Start a new conversation or switch to a model with a larger window.`,
        );
      }
      // ponytail: drop oldest turns, keeping the opening message. Summarising them into a
      // compaction message would preserve more, add that when losing early turns bites.
      // A tool result must follow the assistant turn that called it, so the results of a
      // dropped assistant turn go with it — otherwise providers reject the orphaned output.
      let dropUntil = 2;
      while (candidate[dropUntil]?.role === "tool") dropUntil++;
      candidate = [candidate[0], ...candidate.slice(dropUntil)] as AgentMessage[];
      trimmed = true;
    }
  }

  private estimateTokens(systemPrompt: string, messages: AgentMessage[]): number {
    const tools = this.tools.list();
    return estimateContextTokens(normalizeContext(toPiContext({ systemPrompt, messages, tools })))
      .tokens;
  }

  /**
   * Render the history through the persisted compaction state, and move that state forward
   * only at a turn start:
   * - after the cache expired, shrink older turns further and show a recap written meanwhile;
   * - past the high watermark, compact older turns when that frees enough room to be worth one
   *   prompt-cache rewrite, then summarize them if the context is still too large.
   * Anything still too large falls through to fitToContextWindow.
   */
  private async compactHistory(
    history: AgentMessage[],
    systemPrompt: string,
  ): Promise<AgentMessage[]> {
    let state = this.context.getCompaction();
    if (!isTurnStart(history)) return projectHistory(history, state);

    const input = history[history.length - 1]!;
    const lastReply = history
      .slice(0, -1)
      .reverse()
      .find((message) => message.role === "assistant");
    if (lastReply && input.createdAt - lastReply.createdAt > CACHE_TTL_MS) {
      const recap = await this.context.loadRecap();
      const withRecap =
        recap && recap.through === history[history.length - 2]?.id
          ? { ...state, recaps: [...(state.recaps ?? []), { before: input.id, text: recap.text }] }
          : state;
      const next = planCompaction(history, withRecap, true) ?? withRecap;
      if (next !== state) {
        state = next;
        await this.context.setCompaction(state);
      }
    }

    let projected = projectHistory(history, state);
    const window = this.model.contextWindow;
    if (window <= CONTEXT_SAFETY_TOKENS) return projected;
    const outputReserve = Math.min(
      this.config.maxTokens ?? this.model.maxTokens,
      Math.floor(window / 4),
    );
    const budget = window - outputReserve;
    let tokens = this.estimateTokens(systemPrompt, projected);
    if (tokens <= budget * HIGH_WATERMARK) return projected;

    const next = planCompaction(history, state);
    if (next) {
      const compacted = projectHistory(history, next);
      const after = this.estimateTokens(systemPrompt, compacted);
      if (tokens - after >= budget * MIN_SAVINGS) {
        state = next;
        await this.context.setCompaction(state);
        projected = compacted;
        tokens = after;
      }
    }
    if (tokens <= budget * HIGH_WATERMARK) return projected;
    return (await this.summarize(history, state, systemPrompt)) ?? projected;
  }

  /** Replace the turns before the protected recent ones with one summary. */
  private async summarize(
    history: AgentMessage[],
    state: CompactionState,
    systemPrompt: string,
  ): Promise<AgentMessage[] | undefined> {
    if ((state.summaryFailures ?? 0) >= MAX_SUMMARY_FAILURES) return undefined;
    const boundary = protectedBoundary(history);
    const summarizedEnd = state.summary
      ? history.findIndex((message) => message.id === state.summary?.through)
      : -1;
    if (boundary <= summarizedEnd) return undefined;
    let next: CompactionState;
    try {
      const text = await this.complete(
        systemPrompt,
        projectHistory(history.slice(0, boundary + 1), state),
        SUMMARY_INSTRUCTION,
        SUMMARY_MAX_TOKENS,
      );
      next = {
        ...(planCompaction(history, state) ?? state),
        summary: { through: history[boundary]!.id, text },
        summaryFailures: 0,
      };
    } catch (error) {
      if (this.abortController?.signal.aborted) throw error;
      await this.context.setCompaction({
        ...state,
        summaryFailures: (state.summaryFailures ?? 0) + 1,
      });
      return undefined;
    }
    await this.context.setCompaction(next);
    return projectHistory(history, next);
  }

  /**
   * One tool-less completion from the compaction model: the conversation as the model sees it,
   * then the instruction. Replaying the same system prompt, tools, and messages lets the
   * provider serve the prefix from cache.
   */
  private async complete(
    systemPrompt: string,
    messages: AgentMessage[],
    instruction: string,
    maxTokens: number,
  ): Promise<string> {
    const request = this.fitToContextWindow(
      [
        ...messages,
        {
          id: "compaction-instruction",
          role: "user",
          content: [{ type: "text", text: instruction }],
          createdAt: now(),
        },
      ],
      systemPrompt,
    );
    const { model, stream } = this.compactionModel;
    const events = await stream(
      model,
      toPiContext({ systemPrompt, messages: request, tools: this.tools.list() }),
      {
        maxTokens: Math.min(maxTokens, model.maxTokens || maxTokens),
        ...(this.abortController?.signal ? { signal: this.abortController.signal } : {}),
      },
    );
    let text = "";
    let final: AssistantMessage | undefined;
    for await (const event of events) {
      if (event.type === "text_delta") text += event.delta;
      if (event.type === "done") final = event.message;
      if (event.type === "error")
        throw new Error(event.error.errorMessage || "Compaction request failed.");
    }
    if (final) {
      if (final.stopReason === "length") throw new Error("The summary was cut off.");
      text = getAssistantText(final);
    }
    if (!text.trim()) throw new Error("The model returned no text.");
    return text.trim();
  }

  /**
   * Write a one-paragraph recap for a user who stepped away, once per finished turn. Returns
   * undefined when a turn is still open, the conversation is short, or it is already recapped.
   */
  async generateRecap(): Promise<string | undefined> {
    const history = this.context.getMessages();
    const last = history[history.length - 1];
    if (last?.role !== "assistant") return undefined;
    if ((await this.context.loadRecap())?.through === last.id) return undefined;
    const systemPrompt = await this.composeSystemPrompt();
    const projected = projectHistory(history, this.context.getCompaction());
    if (this.estimateTokens(systemPrompt, projected) < RECAP_MIN_TOKENS) return undefined;
    const text = await this.complete(systemPrompt, projected, RECAP_INSTRUCTION, RECAP_MAX_TOKENS);
    await this.context.saveRecap({ through: last.id, text });
    return text;
  }

  private async composeSystemPrompt(): Promise<string> {
    const baseSystemPrompt = await this.prompt.compose();
    const personalityText = await this.context.loadMemory<string>(PERSONALITY_MEMORY_KEY);
    const notices = (await this.context.loadMemory<MemoryNotice[]>(NOTICES_MEMORY_KEY)) ?? [];
    return mergeSystemPromptWithMemory(baseSystemPrompt, personalityText ?? "", notices);
  }

  private async *think(): AsyncGenerator<AgentEvent, ThinkResult> {
    const systemPrompt = await this.composeSystemPrompt();
    const steered: string[] = [];
    while (this.steeringInputs.length > 0) {
      for (const message of this.takeUnconsumedSteering()) {
        await this.context.append(message);
        await this.hooks.onAfterInput?.(this.createHookContext(), message);
        steered.push(message.id);
      }
    }
    if (steered.length > 0) yield { type: "steer-consumed", messageIds: steered };
    const history = this.context.getMessages();
    const messages = this.fitToContextWindow(
      this.config.compaction ? await this.compactHistory(history, systemPrompt) : history,
      systemPrompt,
    );

    let text = "";
    let reasoning = "";
    let usage: TokenUsage | undefined;
    let providerMessage: AssistantMessage | undefined;
    const toolCalls: AgentMessageContent[] = [];

    const stream = await this.stream(
      this.model,
      toPiContext({ systemPrompt, messages, tools: this.tools.list() }),
      {
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
        ...(this.config.maxTokens !== undefined ? { maxTokens: this.config.maxTokens } : {}),
        ...(this.abortController?.signal ? { signal: this.abortController.signal } : {}),
      },
    );

    for await (const event of stream) {
      if (this.state.aborted) break;

      switch (event.type) {
        case "text_delta":
          text += event.delta;
          yield { type: "text-delta", delta: event.delta };
          break;
        case "thinking_delta":
          reasoning += event.delta;
          yield { type: "reasoning-delta", delta: event.delta };
          break;
        case "thinking_end":
          reasoning = event.content;
          yield { type: "reasoning-done", text: event.content };
          break;
        case "toolcall_start": {
          const toolCall = event.partial.content[event.contentIndex];
          if (toolCall?.type === "toolCall") {
            yield {
              type: "tool-call-start",
              toolCall: { id: toolCall.id, name: toolCall.name },
            };
          }
          break;
        }
        case "toolcall_delta": {
          const toolCall = event.partial.content[event.contentIndex];
          if (toolCall?.type === "toolCall") {
            yield { type: "tool-call-args-delta", toolCallId: toolCall.id, delta: event.delta };
          }
          break;
        }
        case "toolcall_end":
          toolCalls.push({
            type: "tool_call",
            id: event.toolCall.id,
            name: event.toolCall.name,
            arguments: event.toolCall.arguments,
          });
          yield {
            type: "tool-call-complete",
            toolCall: {
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments,
            },
          };
          break;
        case "done":
          providerMessage = event.message;
          usage = toTokenUsage(event.message.usage);
          break;
        case "error":
          if (event.reason === "aborted" || this.abortController?.signal.aborted) {
            this.state.aborted = true;
            break;
          }
          throw new Error(event.error.errorMessage || "Pi model request failed.");
        default:
          break;
      }
    }

    if (providerMessage) {
      text = getAssistantText(providerMessage);
      reasoning = getAssistantReasoning(providerMessage);
      usage = toTokenUsage(providerMessage.usage);
    }

    if (usage) {
      yield { type: "usage", usage };
    }

    return {
      text,
      reasoning,
      toolCalls,
      ...(usage ? { usage } : {}),
      ...(providerMessage ? { providerMessage } : {}),
    };
  }
}

const stringifyToolResult = (result: unknown): string => {
  return typeof result === "string" ? result : JSON.stringify(result);
};

export const createAgent = (options: AgentOptions): Agent => {
  return new Agent(options);
};
