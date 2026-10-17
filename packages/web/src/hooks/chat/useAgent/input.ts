import type { AgentMessage } from "@memora/ai-core";

import type { ChatMessage, ChatMessageQuote, ChatTurnInput } from "./types";

export const normalizeTurnInput = (input: string | ChatTurnInput): ChatTurnInput => {
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

// How a quoted selection reaches the model, ahead of the user's message.
const formatQuoteForModel = (quote: ChatMessageQuote): string => {
  return `<quoted_text source="${quote.label.replace(/"/g, "'")}">\n${quote.text}\n</quoted_text>\nThe user attached this text to the message below. "This" or "here" refers to it.`;
};

export const withQuoteForModel = (text: string, quote: ChatMessageQuote | undefined): string => {
  return quote ? `${formatQuoteForModel(quote)}\n\n${text}` : text;
};

export const toAgentHistoryMessages = (messages: ChatMessage[]): AgentMessage[] => {
  return messages.flatMap((message, index) => {
    const content: AgentMessage["content"] = [];
    const normalizedText = message.content.trim();

    if (normalizedText.length > 0 || message.quote) {
      content.push({
        type: "text",
        text: withQuoteForModel(message.content, message.quote),
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
