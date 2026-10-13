import type { Tool } from "@earendil-works/pi-ai";

import type { CompactionParameters, CompactionState } from "./compaction";
import type { AgentMessage, AgentMessageContent, TokenUsage } from "./types";

export type ModelPurpose = "reply" | "summary";

/**
 * Raw records the loop hands to `AgentOptions.trace`. They know nothing about sessions: the
 * caller adds the envelope (session, Run, sequence, timestamp). `turn` counts model calls in
 * the Run; 0 is before the first one.
 */
export type TraceRecord = TraceRecordBody & { turn: number };

export type TraceRecordBody =
  | {
      /** A steer message entered the history for this turn's model call. */
      type: "input.applied";
      messageId: string;
    }
  | {
      /** The first time a message enters the history; a tool message holds the stored results. */
      type: "message.added";
      message: AgentMessage;
    }
  | {
      type: "context.compacted";
      layer: "microcompact" | "cold" | "summary";
      trigger: "watermark" | "cache-expired";
      before: CompactionState;
      after: CompactionState;
      tokensBefore: number;
      tokensAfter: number;
      parameters: CompactionParameters;
      /** Set when a recap written while the user was away is shown before the new input. */
      recap?: { id: string; text: string };
      /** The summary text is `after.summary.text` when it succeeded. */
      summary?: { outcome: "succeeded" } | { outcome: "failed"; error: string; failures: number };
    }
  | {
      /** Fallback trimming dropped the oldest messages from this request. */
      type: "context.trimmed";
      purpose: ModelPurpose;
      droppedMessageIds: string[];
      tokensBefore: number;
      tokensAfter: number;
      contextWindow: number;
    }
  | {
      /** Captured right before the provider call, after compaction and trimming. */
      type: "model.request";
      purpose: ModelPurpose;
      /** IDs of the messages sent, in order. Summaries, recaps, and the summary instruction use synthetic IDs. */
      messageIds: string[];
      /** Present when compaction is on: re-render with `projectHistory(history, compaction, parameters)`. */
      compaction?: CompactionState;
      parameters?: CompactionParameters;
      /** The summary instruction appended as the last message. */
      instruction?: string;
      model: { api: string; provider: string; id: string };
      settings: { temperature?: number; maxTokens?: number };
      /** Only when it differs from the previous request in the Run. */
      systemPrompt?: string;
      /** Only when they differ from the previous request in the Run. */
      tools?: Tool[];
    }
  | {
      type: "model.response";
      purpose: ModelPurpose;
      text: string;
      reasoning: string;
      toolCalls: AgentMessageContent[];
      usage?: TokenUsage;
      finishReason?: string;
      durationMs: number;
      error?: string;
    }
  | {
      type: "tool.started";
      toolCallId: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool.settled";
      toolCallId: string;
      name: string;
      /** Characters in the raw result before the stored cap. */
      rawLength: number;
      result: unknown;
      isError: boolean;
      durationMs: number;
    }
  | {
      /** Earlier records the callback threw on and were lost. */
      type: "trace.gap";
      dropped: number;
      reason: string;
    };

export type TraceRecordType = TraceRecord["type"];

export type TraceCallback = (record: TraceRecord) => void;
