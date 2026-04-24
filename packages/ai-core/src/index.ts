export { Agent, createAgent } from "./loop";
export type { AgentOptions } from "./loop";

export { ToolRegistry, createToolRegistry } from "./tools";
export { ContextManager, createContextManager } from "./context";
export { PromptComposer, createPromptComposer } from "./prompt";
export { InMemoryAdapter, createInMemoryAdapter } from "./persistence";
export { generateId, now } from "./utils";

export type {
  MaybePromise,
  MessageRole,
  AgentMessageContent,
  AgentMessage,
  TokenUsage,
  ToolDefinition,
  ProviderRequest,
  ProviderEvent,
  ProviderAdapter,
  AgentEvent,
  WebSearchStatus,
  WebSearchResult,
  LoopPhase,
  LoopState,
  HookContext,
  AgentHooks,
  ThinkResult,
  PromptSegment,
  PersistenceAdapter,
  AgentConfig,
} from "./types";

export { AgentConfigSchema, AgentMessageSchema } from "./types";
