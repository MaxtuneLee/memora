import type { AttemptTrace } from "./agentTypes";

export type EvaluationErrorCode =
  | "save-failed"
  | "not-found"
  | "invalid-result"
  | "invalid-questions";

/** Thrown by an agent adapter for an attempt that failed after its session started. */
export class AgentAttemptError extends Error {
  readonly trace: AttemptTrace;

  constructor(message: string, trace: AttemptTrace, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentAttemptError";
    this.trace = trace;
  }
}

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;
  readonly cause?: unknown;

  constructor(code: EvaluationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EvaluationError";
    this.code = code;
    this.cause = options?.cause;
  }
}
