import * as v from "valibot";

// ─── Primitives ───

export type MaybePromise<T> = T | Promise<T>;

export const MessageRoleSchema = v.picklist(["user", "assistant", "system", "tool"]);
export type MessageRole = v.InferOutput<typeof MessageRoleSchema>;

// ─── Agent Messages (internal representation) ───

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

// ─── LLM Messages (OpenAI-compatible format) ───

export interface LLMTextContent {
  type: "text";
  text: string;
}

export interface LLMImageContent {
  type: "image_url";
  image_url: { url: string };
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | Array<LLMTextContent | LLMImageContent>;
  reasoning_content?: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolDefinition {
  type: "function" | string;
  function?: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMRequestPayload {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  stream: true;
  stream_options?: {
    include_usage?: boolean;
  };
  temperature?: number;
  max_tokens?: number;
}

// ─── Responses API (OpenAI /v1/responses) ───

export type ApiFormat = "chat-completions" | "responses";

export interface ResponsesInputText {
  type: "input_text";
  text: string;
}

export interface ResponsesInputImage {
  type: "input_image";
  image_url: string;
}

export interface ResponsesInputMessage {
  role: "user" | "assistant" | "system" | "developer";
  content: string | Array<ResponsesInputText | ResponsesInputImage>;
  type?: "message";
}

export interface ResponsesFunctionCall {
  type: "function_call";
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface ResponsesFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCall
  | ResponsesFunctionCallOutput;

export interface ResponsesFunctionToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface ResponsesBuiltinToolDefinition {
  type: "web_search_preview" | "file_search" | "code_interpreter" | string;
  [key: string]: unknown;
}

export type ResponsesToolDefinition =
  | ResponsesFunctionToolDefinition
  | ResponsesBuiltinToolDefinition;

export interface ResponsesRequestPayload {
  model: string;
  input: ResponsesInputItem[];
  tools?: ResponsesToolDefinition[];
  stream: true;
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// ─── Tool System ───

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  type: "function" | string;
  name: string;
  description: string;
  parameters: v.GenericSchema<TParams>;
  execute: (params: TParams) => MaybePromise<TResult>;
}

// ─── Stream Events ───

export type WebSearchStatus = "in_progress" | "searching" | "completed";

export type AgentEvent =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | { type: "reasoning-done"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "tool-call-start"; toolCall: { id: string; name: string } }
  | {
      type: "tool-call-args-delta";
      toolCallId: string;
      delta: string;
    }
  | {
      type: "tool-call-complete";
      toolCall: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      };
    }
  | {
      type: "tool-result";
      toolCall: { id: string; name: string };
      result: unknown;
      isError: boolean;
    }
  | { type: "web-search"; status: WebSearchStatus; itemId: string }
  | {
      type: "output-item-added";
      itemType: string;
      itemId: string;
      item: Record<string, unknown>;
    }
  | {
      type: "output-item-done";
      itemType: string;
      itemId: string;
      item: Record<string, unknown>;
    }
  | { type: "thinking"; text: string }
  | { type: "status"; status: string }
  | { type: "error"; error: Error }
  | { type: "done"; message: AgentMessage; usage?: TokenUsage };

// ─── Loop State ───

export type LoopPhase = "input" | "think" | "action" | "observation" | "complete" | "error";

export interface LoopState {
  phase: LoopPhase;
  iteration: number;
  agentId: string;
  aborted: boolean;
}

// ─── Lifecycle Hooks ───

export interface HookContext {
  state: LoopState;
  messages: AgentMessage[];
  getRelevantContext: () => MaybePromise<string[]>;
}

export interface AgentHooks {
  onAfterInput?: (ctx: HookContext, message: AgentMessage) => MaybePromise<void>;
  onBeforeThink?: (ctx: HookContext) => MaybePromise<void>;
  onAfterThink?: (
    ctx: HookContext,
    result: { text: string; toolCalls: AgentMessageContent[] },
  ) => MaybePromise<void>;
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

// ─── Message Transformer ───

export type MessageTransformer = (
  messages: AgentMessage[],
  context: { tools: ToolDefinition[] },
) => MaybePromise<LLMMessage[]>;

export interface ThinkResult {
  text: string;
  reasoning: string;
  toolCalls: AgentMessageContent[];
  usage?: TokenUsage;
}

export type ResponseTransformer = (events: AgentEvent[]) => MaybePromise<ThinkResult>;

// ─── Prompt Composer ───

export interface PromptSegment {
  id: string;
  priority: number;
  content: string | (() => MaybePromise<string>);
}

// ─── Persistence ───

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

// ─── Agent Config ───

export const AgentConfigSchema = v.object({
  id: v.string(),
  model: v.string(),
  endpoint: v.string(),
  apiKey: v.optional(v.string()),
  apiFormat: v.optional(v.picklist(["chat-completions", "responses"]), "chat-completions"),
  builtinTools: v.optional(v.array(v.record(v.string(), v.unknown()))),
  maxToolResultChars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(100)), 8000),
  maxContextChars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1000)), 100000),
  temperature: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
  maxTokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  maxIterations: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 10),
});
export type AgentConfig = v.InferInput<typeof AgentConfigSchema>;
