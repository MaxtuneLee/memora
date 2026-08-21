import {
  Type,
  type AssistantMessage,
  type Context,
  type Message,
  type Tool,
} from "@earendil-works/pi-ai";
import { toJsonSchema } from "@valibot/to-json-schema";

import type { AgentMessage, AgentMessageContent, TokenUsage, ToolDefinition } from "./types";

const zeroUsage = (): AssistantMessage["usage"] => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});

const toPiContent = (content: AgentMessageContent) => {
  switch (content.type) {
    case "text":
      return { type: "text" as const, text: content.text };
    case "image":
      return { type: "image" as const, mimeType: content.mimeType, data: content.data };
    default:
      return null;
  }
};

const toPiMessage = (message: AgentMessage): Message[] => {
  if (message.providerMessage) {
    return [message.providerMessage];
  }

  const timestamp = message.createdAt;
  const textAndImages = message.content.flatMap((content) => {
    const converted = toPiContent(content);
    return converted ? [converted] : [];
  });
  const toolCalls = message.content.filter(
    (content): content is Extract<AgentMessageContent, { type: "tool_call" }> =>
      content.type === "tool_call",
  );
  const toolResults = message.content.filter(
    (content): content is Extract<AgentMessageContent, { type: "tool_result" }> =>
      content.type === "tool_result",
  );

  if (message.role === "tool" || toolResults.length > 0) {
    return toolResults.map((result) => ({
      role: "toolResult" as const,
      toolCallId: result.id,
      toolName: result.name,
      content: [{ type: "text" as const, text: stringifyResult(result.result) }],
      isError: result.isError ?? false,
      timestamp,
    }));
  }

  if (message.role === "assistant") {
    const assistantContent: AssistantMessage["content"] = [
      ...(message.reasoning ? [{ type: "thinking" as const, thinking: message.reasoning }] : []),
      ...textAndImages.flatMap((content) =>
        content.type === "text" ? [{ type: "text" as const, text: content.text }] : [],
      ),
      ...toolCalls.map((toolCall) => ({
        type: "toolCall" as const,
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      })),
    ];
    return [
      {
        role: "assistant" as const,
        content: assistantContent,
        api: "memora-legacy",
        provider: "memora-legacy",
        model: "memora-legacy",
        usage: zeroUsage(),
        stopReason: toolCalls.length > 0 ? "toolUse" : "stop",
        timestamp,
      },
    ];
  }

  return [
    {
      role: "user" as const,
      content: textAndImages.length === 1 && textAndImages[0]?.type === "text"
        ? textAndImages[0].text
        : textAndImages,
      timestamp,
    },
  ];
};

const stringifyResult = (result: unknown): string => {
  return typeof result === "string" ? result : JSON.stringify(result);
};

const toPiTool = (tool: ToolDefinition): Tool => {
  const schema = toJsonSchema(tool.parameters) as Record<string, unknown>;
  delete schema["$schema"];
  return {
    name: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(schema),
  };
};

export const toPiContext = (input: {
  systemPrompt: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
}): Context => {
  return {
    ...(input.systemPrompt ? { systemPrompt: input.systemPrompt } : {}),
    messages: input.messages.flatMap(toPiMessage),
    ...(input.tools.length > 0 ? { tools: input.tools.map(toPiTool) } : {}),
  };
};

export const toTokenUsage = (usage: AssistantMessage["usage"]): TokenUsage => {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
  };
};

export const toAgentMessageContent = (message: AssistantMessage): AgentMessageContent[] => {
  const result: AgentMessageContent[] = [];
  for (const content of message.content) {
    switch (content.type) {
      case "text":
        result.push({ type: "text", text: content.text });
        break;
      case "toolCall":
        result.push({
          type: "tool_call",
          id: content.id,
          name: content.name,
          arguments: content.arguments,
        });
        break;
      default:
        break;
    }
  }
  return result;
};

export const getAssistantText = (message: AssistantMessage): string => {
  return message.content
    .filter((content): content is Extract<AssistantMessage["content"][number], { type: "text" }> => content.type === "text")
    .map((content) => content.text)
    .join("");
};

export const getAssistantReasoning = (message: AssistantMessage): string => {
  return message.content
    .filter(
      (content): content is Extract<AssistantMessage["content"][number], { type: "thinking" }> =>
        content.type === "thinking",
    )
    .map((content) => content.thinking)
    .join("");
};
