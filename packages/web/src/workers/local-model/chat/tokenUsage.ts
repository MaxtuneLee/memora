import type { LocalChatEvent } from "@memora/local-model-runtime";

export const createTokenUsageEvent = (
  inputIds: unknown,
  outputTokens: number,
): Extract<LocalChatEvent, { type: "usage" }> | null => {
  if (!inputIds || typeof inputIds !== "object") return null;
  const dims = (inputIds as { dims?: unknown }).dims;
  // Current local generation uses a single input sequence. Count actual tensor tokens.
  if (!Array.isArray(dims) || dims.length !== 2 || dims[0] !== 1) return null;
  const inputTokens: unknown = dims[1];
  if (
    typeof inputTokens !== "number" ||
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0 ||
    !Number.isSafeInteger(inputTokens + outputTokens)
  )
    return null;
  return { type: "usage", inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
};
