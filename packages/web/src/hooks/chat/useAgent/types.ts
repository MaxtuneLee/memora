import type {
  AgentConfig,
  PersistenceAdapter,
  PromptSegment,
  TokenUsage,
  ToolDefinition,
} from "@memora/ai-core";

import type { ChatImageAttachment, ChatInputImage } from "@/lib/chat/chatImageAttachments";
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
  mode?: "pending" | "steer";
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
  sessionStorage?: "memory";
  providerConfig?: Omit<import("@memora/ai-provider-pi").RemotePiProviderConfig, "onUsage">;
  getReferenceScope?: () => import("@/lib/chat/tools/shared").ResolvedReferenceScope;
  deliveryMode?: "pending" | "steer";
  sessionId: string;
  initialMessages?: ChatMessage[];
  config: Partial<AgentConfig>;
  persistence?: PersistenceAdapter;
  tools?: Partial<ToolDefinition>[];
  promptSegments?: PromptSegment[];
}

export interface UseAgentReturn {
  messages: ChatMessage[];
  /** Messages waiting for the current run to finish, in send order. */
  pendingMessages: Array<{ id: string; text: string }>;
  pendingWriteApproval: import("@/lib/chat/tools/shared").WriteApprovalRequest | null;
  resolveWriteApproval: (decision: import("@/lib/chat/tools/shared").WriteApprovalDecision) => void;
  isStreaming: boolean;
  status: AgentStatus;
  thinkingSteps: ThinkingStep[];
  thinkingCollapsed: boolean;
  iterationLimitPrompt: IterationLimitPrompt | null;
  error: Error | null;
  send: (input: string | ChatTurnInput, options?: RunTurnOptions) => Promise<void>;
  continueAfterIterationLimit: () => Promise<void>;
  dismissIterationLimitPrompt: () => void;
  abort: () => void;
  reset: (options?: {
    messages?: ChatMessage[];
    contextMessages?: ChatMessage[];
    replayFrom?: string;
  }) => Promise<void>;
  updateMessage: (messageId: string, updater: (message: ChatMessage) => ChatMessage) => void;
  /** Insert a queued message into the running reply as a steer. */
  steerPending: (submissionId: string) => void;
  saveMemory: (key: string, value: unknown) => Promise<void>;
  loadMemory: <T = unknown>(key: string) => Promise<T | null>;
}
