import type { LocalReasoningMode } from "@memora/local-model-runtime";

import type { ChatMessage as AgentChatMessage } from "@/hooks/chat/useAgent";
import { localModelClient } from "@/lib/local-model";

const TITLE_SYSTEM_PROMPT = `You write short chat titles for a conversation list.
Return only the title. No quotes. No punctuation at the end.
Use the same language as the user's main message when possible.
Keep it under 6 words.`;

const MAX_CONTEXT_CHARS = 1600;
const MAX_TITLE_CHARS = 48;

const normalizeTitle = (value: string): string | null => {
  const title = value
    .replace(/^\s*["'“”‘’]+/, "")
    .replace(/["'“”‘’]+\s*$/, "")
    .replace(/[.。!！?？:：,，;；]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return null;
  return title.length > MAX_TITLE_CHARS ? title.slice(0, MAX_TITLE_CHARS).trim() : title;
};

const truncateForPrompt = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_CONTEXT_CHARS) return normalized;
  return normalized.slice(0, MAX_CONTEXT_CHARS).trim();
};

const buildConversationExcerpt = (messages: AgentChatMessage[]): string => {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(0, 4)
    .map((message) => `${message.role}: ${truncateForPrompt(message.content)}`)
    .join("\n");
};

export const generateChatSessionTitle = async ({
  messages,
  modelId,
  reasoningMode = "non-thinking",
  signal,
}: {
  messages: AgentChatMessage[];
  modelId: string;
  reasoningMode?: LocalReasoningMode;
  signal?: AbortSignal;
}): Promise<string | null> => {
  const excerpt = buildConversationExcerpt(messages);
  if (!excerpt) return null;

  let output = "";
  for await (const event of localModelClient.streamChat(
    {
      modelId,
      systemPrompt: TITLE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create a concise title for this conversation:\n${excerpt}`,
            },
          ],
        },
      ],
      tools: [],
      reasoningMode,
      temperature: 0.2,
      maxTokens: 24,
    },
    {
      priority: "background",
      signal,
    },
  )) {
    if (event.type === "text-delta") {
      output += event.delta;
    }
  }

  return normalizeTitle(output);
};
