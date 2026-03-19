import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import {
  listChatSessions,
  loadChatSession,
} from "@/lib/chat/chatSessionStorage";

export const createSessionTools = (): ToolDefinition[] => {
  return [
    {
      type: "function",
      name: "list_chat_sessions",
      description:
        "List recently updated chat sessions with titles, timestamps, message counts, and previews.",
      parameters: v.object({
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 10),
      }),
      execute: async (params: unknown) => {
        const payload = params as { limit?: number };
        const sessions = await listChatSessions();
        const limit = Math.min(payload.limit ?? 10, 50);
        return sessions.slice(0, limit);
      },
    },
    {
      type: "function",
      name: "read_chat_session",
      description:
        "Read historical messages from a specific chat session. Use list_chat_sessions first to get a session id.",
      parameters: v.object({
        session_id: v.string(),
        max_messages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 50),
      }),
      execute: async (params: unknown) => {
        const payload = params as { session_id: string; max_messages?: number };
        const session = await loadChatSession(payload.session_id);
        if (!session) {
          return { error: `Session '${payload.session_id}' was not found` };
        }

        const maxMessages = Math.min(payload.max_messages ?? 50, 200);
        const messages = session.messages
          .filter((message) => {
            return (
              message.content.trim().length > 0 ||
              (message.widgets?.length ?? 0) > 0
            );
          })
          .slice(-maxMessages);

        return {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          totalMessages: session.messages.length,
          messages,
        };
      },
    },
  ];
};
