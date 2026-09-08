export type EvaluationErrorCode = "save-failed" | "not-found" | "invalid-result";

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
