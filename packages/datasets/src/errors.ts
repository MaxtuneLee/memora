export type DatasetErrorCode =
  | "aborted"
  | "invalid-manifest"
  | "in-use"
  | "network"
  | "not-installed"
  | "quota"
  | "unsupported";

export class DatasetError extends Error {
  readonly code: DatasetErrorCode;
  readonly cause?: unknown;

  constructor(code: DatasetErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DatasetError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export function toDatasetError(error: unknown, fallback: DatasetErrorCode): DatasetError {
  if (error instanceof DatasetError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new DatasetError("aborted", "The dataset operation was canceled.", { cause: error });
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new DatasetError("quota", "There is not enough browser storage for this dataset.", {
      cause: error,
    });
  }
  return new DatasetError(
    fallback,
    error instanceof Error ? error.message : "Dataset operation failed.",
    {
      cause: error,
    },
  );
}
