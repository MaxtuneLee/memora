import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import { extractNoticeCandidatesWithAI } from "@/lib/chat/noticeExtractor";
import { upsertGlobalMemoryNotices } from "@/lib/settings/personalityStorage";

import type { CreateChatToolsOptions } from "./shared";

export const createMemoryTools = (
  options: CreateChatToolsOptions,
): ToolDefinition[] => {
  return [
    {
      type: "function",
      name: "remember_user_preference",
      description:
        "Store a durable user communication preference in long-term memory. Use only for future-facing interaction preferences, not one-off task instructions.",
      parameters: v.object({
        user_request: v.string(),
        assistant_reply: v.string(),
        reason: v.string(),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          user_request: string;
          assistant_reply: string;
          reason: string;
        };
        const extractionConfig = options.getMemoryExtractionConfig?.() ?? null;
        if (
          !extractionConfig?.endpoint ||
          !extractionConfig.apiKey ||
          !extractionConfig.model
        ) {
          return {
            updated: false,
            noticeCount: 0,
            message: "Memory extraction is unavailable because AI settings are incomplete.",
          };
        }

        try {
          const notices = await extractNoticeCandidatesWithAI({
            ...extractionConfig,
            userMessage: payload.user_request,
            assistantMessage: payload.assistant_reply,
          });
          if (notices.length === 0) {
            return {
              updated: false,
              noticeCount: 0,
              message: "No durable preference found.",
            };
          }

          const result = await upsertGlobalMemoryNotices(notices);
          if (result.updated) {
            options.onMemoryUpdated?.();
          }

          return {
            updated: result.updated,
            noticeCount: result.memory.notices.length,
            message: payload.reason,
          };
        } catch (error) {
          return {
            updated: false,
            noticeCount: 0,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
};
