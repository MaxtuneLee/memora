export { Agent, createAgent } from "./loop";
export type { AgentOptions } from "./loop";

export { ToolRegistry, createToolRegistry } from "./tools";
export { COMPACTION_KEY, ContextManager, createContextManager } from "./context";
export { CACHE_TTL_MS, RECALL_TOOL_NAME, rebaseCompaction } from "./compaction";
export type { CompactionState } from "./compaction";
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
  ModelStream,
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

export { toPiTool } from "./pi";
