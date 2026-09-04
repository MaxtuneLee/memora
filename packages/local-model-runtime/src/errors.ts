import type { LocalModelError, LocalModelErrorCode } from "./types";

export const createLocalModelError = (
  code: LocalModelErrorCode,
  message: string,
  detail?: string,
): LocalModelError => ({
  code,
  message,
  ...(detail ? { detail } : {}),
});

export const normalizeLocalModelError = (error: unknown): LocalModelError => {
  if (
    error &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    return error as LocalModelError;
  }

  if (error instanceof Error) {
    return createLocalModelError(
      "generation-failed",
      "Local model generation failed.",
      error.message,
    );
  }

  return createLocalModelError("generation-failed", "Local model generation failed.");
};
