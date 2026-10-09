import type { AgentMessage } from "@memora/ai-core";

/**
 * History to keep when an earlier user message is edited and resent. The stored history keeps
 * tool calls, tool results, and images, so it is cut before the replayed message; user
 * messages share their ID with the displayed message. Without a match (no replay, or a
 * history saved before IDs were shared) the text-only history rebuilt by the page is used.
 */
export const historyBeforeReplay = (
  stored: unknown,
  request: { history: AgentMessage[]; replayFrom?: string },
): AgentMessage[] => {
  if (!request.replayFrom || !Array.isArray(stored)) return request.history;
  const index = stored.findIndex(
    (message: unknown) => (message as { id?: unknown } | null)?.id === request.replayFrom,
  );
  return index < 0 ? request.history : (stored.slice(0, index) as AgentMessage[]);
};
