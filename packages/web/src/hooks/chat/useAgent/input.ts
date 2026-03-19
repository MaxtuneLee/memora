import type { AgentMessage } from "@memora/ai-core";

import type { ChatMessage, ChatTurnInput } from "./types";

export const normalizeTurnInput = (
  input: string | ChatTurnInput,
): ChatTurnInput => {
  if (typeof input === "string") {
    return {
      text: input,
      images: [],
    };
  }

  return {
    text: input.text,
    images: input.images ?? [],
  };
};

export const buildAgentInput = (
  input: ChatTurnInput,
  messageId: string,
): string | AgentMessage => {
  if (input.images.length === 0) {
    return input.text;
  }

  return {
    id: messageId,
    role: "user",
    createdAt: Date.now(),
    content: [
      ...(input.text
        ? [
            {
              type: "text" as const,
              text: input.text,
            },
          ]
        : []),
      ...input.images.map((image) => ({
        type: "image" as const,
        mimeType: image.attachment.mimeType,
        data: image.data,
      })),
    ],
  };
};

export const toAgentHistoryMessages = (
  messages: ChatMessage[],
): AgentMessage[] => {
  return messages.flatMap((message, index) => {
    const content: AgentMessage["content"] = [];
    const normalizedText = message.content.trim();

    if (normalizedText.length > 0) {
      content.push({
        type: "text",
        text: message.content,
      });
    }

    if (content.length === 0) {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        content,
        createdAt: Date.now() + index,
      },
    ];
  });
};
