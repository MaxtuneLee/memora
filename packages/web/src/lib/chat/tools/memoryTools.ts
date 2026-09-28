import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import { extractNoticeChangesWithAI, hasNoticeChanges } from "@/lib/chat/noticeExtractor";
import {
  applyGlobalMemoryNoticeChanges,
  loadGlobalMemoryData,
} from "@/lib/settings/personalityStorage";

import type { CreateChatToolsOptions } from "./shared";

const globalMemoryNotices: NonNullable<CreateChatToolsOptions["memoryNotices"]> = {
  list: async () => (await loadGlobalMemoryData())?.notices ?? [],
  apply: async (changes) => {
    const { updated, memory } = await applyGlobalMemoryNoticeChanges(changes);
    return { updated, noticeCount: memory.notices.length };
  },
};

export const createMemoryTools = (options: CreateChatToolsOptions): ToolDefinition[] => {
  const memoryNotices = options.memoryNotices ?? globalMemoryNotices;
  return [
    {
      type: "function",
      name: "remember_user_preference",
      description:
        "Store a durable user communication preference in long-term memory, or change or remove one listed under Stable User Preferences when the user changes or withdraws it. Use only for future-facing interaction preferences, not one-off task instructions.",
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
        try {
          const runtime = options.getMemoryExtractionRuntime?.() ?? null;
          if (!runtime) {
            return {
              updated: false,
              noticeCount: 0,
              message: "Memory extraction is unavailable because AI settings are incomplete.",
            };
          }

          const notices = await memoryNotices.list();
          const changes = await extractNoticeChangesWithAI({
            runtime,
            userMessage: payload.user_request,
            assistantMessage: payload.assistant_reply,
            notices,
          });
          if (!hasNoticeChanges(changes)) {
            return {
              updated: false,
              noticeCount: notices.length,
              message: "No preference to add, change, or remove.",
            };
          }

          const result = await memoryNotices.apply(changes);
          if (result.updated) {
            options.onMemoryUpdated?.();
          }

          return {
            updated: result.updated,
            noticeCount: result.noticeCount,
            message: payload.reason,
          };
        } catch {
          return {
            updated: false,
            noticeCount: 0,
            message:
              "Memory extraction failed. Check the model selected for Memory preferences in settings.",
          };
        }
      },
    },
  ];
};
