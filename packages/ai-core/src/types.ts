import * as v from "valibot";

export type MaybePromise<T> = T | Promise<T>;

export const MessageRoleSchema = v.picklist(["user", "assistant", "system", "tool"]);
export type MessageRole = v.InferOutput<typeof MessageRoleSchema>;

export const TextContentSchema = v.object({
  type: v.literal("text"),
  text: v.string(),
});

export const ImageContentSchema = v.object({
  type: v.literal("image"),
  mimeType: v.string(),
  data: v.string(),
});

export const FileContentSchema = v.object({
  type: v.literal("file"),
  mimeType: v.string(),
  data: v.string(),
  name: v.string(),
});

export const ToolCallContentSchema = v.object({
  type: v.literal("tool_call"),
  id: v.string(),
  name: v.string(),
  arguments: v.record(v.string(), v.unknown()),
});

export const ToolResultContentSchema = v.object({
  type: v.literal("tool_result"),
  id: v.string(),
  name: v.string(),
  result: v.unknown(),
  isError: v.optional(v.boolean()),
});

export const AgentMessageContentSchema = v.variant("type", [
  TextContentSchema,
  ImageContentSchema,
  FileContentSchema,
  ToolCallContentSchema,
  ToolResultContentSchema,
]);
export type AgentMessageContent = v.InferOutput<typeof AgentMessageContentSchema>;

export const AgentMessageSchema = v.object({
  id: v.string(),
  role: MessageRoleSchema,
  content: v.array(AgentMessageContentSchema),
  createdAt: v.number(),
  reasoning: v.optional(v.string()),
});
export type AgentMessage = v.InferOutput<typeof AgentMessageSchema>;

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  type: "function";
  name: string;
  description: string;
  parameters: v.GenericSchema<TParams>;
  execute: (params: TParams) => MaybePromise<TResult>;
}

export type WebSearchStatus = "in_progress" | "searching" | "completed";

export interface WebSearchResult {
  title?: string;
  url?: string;
}

export type ProviderEvent =
  | { type: "status"; status: string }
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-done"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool-call-start"; toolCall: { id: string; name: string } }
  | { type: "tool-call-args-delta"; toolCallId: string; delta: string }
  | {
      type: "tool-call-complete";
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
    }
  | {
      type: "web-search";
      status: WebSearchStatus;
      itemId: string;
      queries?: string[];
      results?: WebSearchResult[];
    }
  | { type: "error"; error: Error };

export interface ProviderRequest {
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderAdapter {
  stream: (
    request: ProviderRequest,
    options?: { signal?: AbortSignal },
  ) => AsyncGenerator<ProviderEvent>;
}

export type AgentEvent =
  | ProviderEvent
  | {
      type: "tool-result";
      toolCall: { id: string; name: string };
      result: unknown;
      isError: boolean;
    }
  | { type: "done"; message: AgentMessage; usage?: TokenUsage };

export type LoopPhase = "input" | "think" | "action" | "observation" | "complete" | "error";

export interface LoopState {
  phase: LoopPhase;
  iteration: number;
  agentId: string;
  aborted: boolean;
}

export interface HookContext {
  state: LoopState;
  messages: AgentMessage[];
  getRelevantContext: () => MaybePromise<string[]>;
}

export interface ThinkResult {
  text: string;
  reasoning: string;
  toolCalls: AgentMessageContent[];
  usage?: TokenUsage;
}

export interface AgentHooks {
  onAfterInput?: (ctx: HookContext, message: AgentMessage) => MaybePromise<void>;
  onBeforeThink?: (ctx: HookContext) => MaybePromise<void>;
  onAfterThink?: (ctx: HookContext, result: ThinkResult) => MaybePromise<void>;
  onBeforeAction?: (ctx: HookContext, toolCall: AgentMessageContent) => MaybePromise<void>;
  onAfterAction?: (
    ctx: HookContext,
    toolCall: AgentMessageContent,
    result: unknown,
  ) => MaybePromise<void>;
  onBeforeObservation?: (ctx: HookContext, observation: AgentMessage) => MaybePromise<void>;
  onAfterObservation?: (ctx: HookContext, observation: AgentMessage) => MaybePromise<void>;
  onError?: (ctx: HookContext, error: Error) => MaybePromise<void>;
  onComplete?: (ctx: HookContext, finalMessage: AgentMessage) => MaybePromise<void>;
}

export interface PromptSegment {
  id: string;
  priority: number;
  content: string | (() => MaybePromise<string>);
}

export interface PersistenceAdapter {
  save: (agentId: string, key: string, data: unknown) => MaybePromise<void>;
  load: <T = unknown>(agentId: string, key: string) => MaybePromise<T | null>;
  remove: (agentId: string, key: string) => MaybePromise<void>;
  list: (agentId: string) => MaybePromise<string[]>;
  grep: (
    agentId: string,
    pattern: string,
  ) => MaybePromise<Array<{ key: string; matches: string[] }>>;
}

export const AgentConfigSchema = v.object({
  id: v.string(),
  model: v.string(),
  maxToolResultChars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(100)), 8000),
  maxContextChars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000)), 100000),
  temperature: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  maxIterations: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 10),
});
export type AgentConfig = v.InferInput<typeof AgentConfigSchema>;
