import type { AgentConfig, AgentMessage } from "@memora/ai-core";
import type { RemotePiProviderConfig } from "@memora/ai-provider-pi";
import type { ChatMessage, AgentStatus, ThinkingStep } from "@/hooks/chat/useAgent/types";
import type {
  ResolvedReferenceScope,
  WriteApprovalRequest,
  WriteApprovalDecision,
} from "@/lib/chat/tools/shared";

export type DeliveryMode = "pending" | "steer";
export interface AgentSubmission {
  id: string;
  input: AgentMessage;
  message: ChatMessage;
  mode: DeliveryMode;
  config: AgentConfig;
  provider: Omit<RemotePiProviderConfig, "onUsage">;
  prompts: Array<{ id: string; priority: number; content: string }>;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  scope: ResolvedReferenceScope;
}
export interface SessionSnapshot {
  sessionId: string;
  revision: number;
  messages: ChatMessage[];
  acceptedSubmissionIds?: string[];
  activeRunId?: string;
  activeMessageId?: string;
  pending: Array<{ id: string; text: string; message: ChatMessage }>;
  status: AgentStatus;
  thinkingSteps: ThinkingStep[];
  thinkingCollapsed: boolean;
  error?: string;
  outcome?: "completed" | "failed" | "aborted" | "interrupted";
  approval?: { id: string; request: WriteApprovalRequest };
  iterations?: number;
}
export type AgentCommand =
  | { type: "subscribe"; sessionId: string; storage?: "memory" }
  | { type: "unsubscribe"; sessionId: string }
  | { type: "submit"; sessionId: string; submission: AgentSubmission; storage?: "memory" }
  | { type: "abort"; sessionId: string; runId: string }
  | {
      type: "reset";
      sessionId: string;
      messages: ChatMessage[];
      history: AgentMessage[];
      /** Keep the stored history before this message; `history` is the fallback. */
      replayFrom?: string;
    }
  | { type: "patch-message"; sessionId: string; message: ChatMessage }
  | { type: "steer-pending"; sessionId: string; submissionId: string }
  | { type: "delete"; sessionId: string }
  | { type: "approval"; sessionId: string; approvalId: string; decision: WriteApprovalDecision }
  | { type: "host-ready" }
  | { type: "checkpoint" }
  | { type: "disconnect" }
  | { type: "tool-result"; callId: string; result?: unknown; error?: string }
  | { type: "request-approval"; callId: string; request: WriteApprovalRequest }
  | { type: "memory-updated"; sessionId: string };
export type AgentRequest = AgentCommand & { requestId: string };
export type AgentResponse =
  | { type: "reply"; requestId: string; error?: string }
  | { type: "snapshot"; snapshot: SessionSnapshot }
  | {
      type: "tool";
      callId: string;
      runId: string;
      sessionId: string;
      name: string;
      args: Record<string, unknown>;
      scope: ResolvedReferenceScope;
    }
  | { type: "approval-result"; callId: string; decision: WriteApprovalDecision }
  | { type: "cancel-tool"; callId: string }
  | { type: "memory-updated"; sessionId: string }
  | { type: "running"; sessionIds: string[] }
  | { type: "finished"; sessionId: string; title: string };
