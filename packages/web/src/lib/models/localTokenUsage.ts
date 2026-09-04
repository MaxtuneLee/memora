import type { LocalChatEvent } from "@memora/local-model-runtime";

export interface LocalTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LocalModelUsageTotals extends LocalTokenUsage {
  totalCommands?: number;
  allInputTokens?: number;
  allOutputTokens?: number;
}

export const normalizeLocalModelUsageTotals = (value: unknown): LocalModelUsageTotals | null => {
  const usage = normalizeLocalTokenUsage(value);
  if (!usage) return null;
  const totalCommands = (value as LocalModelUsageTotals).totalCommands;
  const allInputTokens = (value as LocalModelUsageTotals).allInputTokens;
  const allOutputTokens = (value as LocalModelUsageTotals).allOutputTokens;
  const valid = (count: unknown): count is number =>
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  const validAllTokens =
    valid(allInputTokens) &&
    valid(allOutputTokens) &&
    allInputTokens >= usage.inputTokens &&
    allOutputTokens >= usage.outputTokens &&
    Number.isSafeInteger(allInputTokens + allOutputTokens);
  return {
    ...usage,
    ...(typeof totalCommands === "number" &&
    Number.isSafeInteger(totalCommands) &&
    totalCommands >= 0
      ? { totalCommands }
      : {}),
    allInputTokens: validAllTokens ? allInputTokens : usage.inputTokens,
    allOutputTokens: validAllTokens ? allOutputTokens : usage.outputTokens,
  };
};

export const normalizeLocalTokenUsage = (value: unknown): LocalTokenUsage | null => {
  if (!value || typeof value !== "object") return null;
  const usage = value as Partial<LocalTokenUsage>;
  const valid = (count: unknown): count is number =>
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  if (
    !valid(usage.inputTokens) ||
    !valid(usage.outputTokens) ||
    !Number.isSafeInteger(usage.inputTokens + usage.outputTokens)
  )
    return null;
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
};

export async function* trackLocalTokenUsage(
  events: AsyncGenerator<LocalChatEvent>,
  record: (usage: LocalTokenUsage) => void,
  signal?: AbortSignal,
): AsyncGenerator<LocalChatEvent> {
  let usage: LocalTokenUsage | null = null;
  let failed = false;
  for await (const event of events) {
    if (event.type === "usage") usage = normalizeLocalTokenUsage(event);
    if (
      event.type === "error" ||
      (event.type === "status" && (event.status === "failed" || event.status === "aborted"))
    )
      failed = true;
    yield event;
  }
  // Workers finish through iterator completion; usage events are cumulative per request.
  if (usage && !failed && !signal?.aborted) {
    try {
      record(usage);
    } catch {
      // Statistics must never interrupt an otherwise successful model response.
      console.warn("Could not save local model token usage.");
    }
  }
}
