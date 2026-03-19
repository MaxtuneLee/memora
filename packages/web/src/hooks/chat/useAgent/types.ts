import type {
  AgentConfig,
  AgentHooks,
  MessageTransformer,
  PersistenceAdapter,
  PromptSegment,
  ResponseTransformer,
  TokenUsage,
  ToolDefinition,
} from "@memora/ai-core";

import type {
  ChatImageAttachment,
  ChatInputImage,
} from "@/lib/chat/chatImageAttachments";
import type { ChatWidget } from "@/lib/chat/showWidget";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
  widgets?: ChatWidget[];
  thinkingSteps?: ThinkingStep[];
  usage?: TokenUsage;
}

export interface ChatTurnInput {
  text: string;
  images: ChatInputImage[];
}

export interface RunTurnOptions {
  existingUserMessage?: ChatMessage;
  userMessageContent?: string;
}

export interface IterationLimitPrompt {
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

export interface UseAgentOptions {
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

export interface UseAgentReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  status: AgentStatus;
  thinkingSteps: ThinkingStep[];
  thinkingCollapsed: boolean;
  iterationLimitPrompt: IterationLimitPrompt | null;
  error: Error | null;
  send: (
    input: string | ChatTurnInput,
    options?: RunTurnOptions,
  ) => Promise<void>;
  continueAfterIterationLimit: () => Promise<void>;
  dismissIterationLimitPrompt: () => void;
  abort: () => void;
  reset: (options?: {
    messages?: ChatMessage[];
    contextMessages?: ChatMessage[];
  }) => Promise<void>;
  updateMessage: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => void;
  saveMemory: (key: string, value: unknown) => Promise<void>;
  loadMemory: <T = unknown>(key: string) => Promise<T | null>;
}
