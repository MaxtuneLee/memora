import type {
  AgentMessage,
  AgentMessageContent,
  AgentEvent,
  LLMMessage,
  LLMTextContent,
  LLMImageContent,
  LLMToolCall,
  MessageTransformer,
  ResponseTransformer,
  ThinkResult,
  ToolDefinition,
  ResponsesInputItem,
  ResponsesInputText,
  ResponsesInputImage,
} from "./types";

export class TransformPipeline {
  private transformers: MessageTransformer[] = [];
  private responseTransformers: ResponseTransformer[] = [];

  use(transformer: MessageTransformer): void {
    this.transformers.push(transformer);
  }

  useResponse(transformer: ResponseTransformer): void {
    this.responseTransformers.push(transformer);
  }

  async run(messages: AgentMessage[], context: { tools: ToolDefinition[] }): Promise<LLMMessage[]> {
    if (this.transformers.length > 0) {
      let result: LLMMessage[] = [];
      for (const transformer of this.transformers) {
        result = await transformer(messages, context);
        // eslint-disable-next-line no-param-reassign
        messages = messages;
      }
      return result;
    }

    return defaultTransform(messages);
  }

  async runResponse(events: AgentEvent[]): Promise<ThinkResult> {
    if (this.responseTransformers.length > 0) {
      let result = defaultResponseTransform(events);
      for (const transformer of this.responseTransformers) {
        result = await transformer(events);
      }
      return result;
    }

    return defaultResponseTransform(events);
  }
}

const contentToLLM = (content: AgentMessageContent): LLMTextContent | LLMImageContent | null => {
  switch (content.type) {
    case "text":
      return { type: "text", text: content.text };
    case "image":
      return {
        type: "image_url",
        image_url: { url: `data:${content.mimeType};base64,${content.data}` },
      };
    case "file":
      return { type: "text", text: `[File: ${content.name}]\n${content.data}` };
    default:
      return null;
  }
};

const defaultTransform = (messages: AgentMessage[]): LLMMessage[] => {
  const result: LLMMessage[] = [];

  for (const msg of messages) {
    const toolCalls = msg.content.filter(
      (c): c is AgentMessageContent & { type: "tool_call" } => c.type === "tool_call",
    );
    const toolResults = msg.content.filter(
      (c): c is AgentMessageContent & { type: "tool_result" } => c.type === "tool_result",
    );
    const otherContent = msg.content.filter(
      (c) => c.type !== "tool_call" && c.type !== "tool_result",
    );

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        result.push({
          role: "tool",
          content: typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result),
          tool_call_id: tr.id,
          name: tr.name,
        });
      }
      continue;
    }

    const llmContent: Array<LLMTextContent | LLMImageContent> = [];
    for (const c of otherContent) {
      const converted = contentToLLM(c);
      if (converted) llmContent.push(converted);
    }

    const llmToolCalls: LLMToolCall[] = toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));

    const llmMsg: LLMMessage = {
      role: msg.role as LLMMessage["role"],
    };

    if (llmContent.length === 1 && llmContent[0].type === "text") {
      llmMsg.content = llmContent[0].text;
    } else if (llmContent.length > 0) {
      llmMsg.content = llmContent;
    }

    if (llmToolCalls.length > 0) {
      llmMsg.tool_calls = llmToolCalls;
    }

    if (msg.reasoning) {
      llmMsg.reasoning_content = msg.reasoning;
    }

    result.push(llmMsg);
  }

  return result;
};

const defaultResponseTransform = (events: AgentEvent[]): ThinkResult => {
  let text = "";
  let reasoning = "";
  const toolCalls: AgentMessageContent[] = [];

  for (const event of events) {
    switch (event.type) {
      case "text-delta":
        text += event.delta;
        break;
      case "reasoning-done":
        reasoning = event.text;
        break;
      case "reasoning-delta":
        break;
      case "tool-call-complete":
        toolCalls.push({
          type: "tool_call",
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
        });
        break;
    }
  }

  return { text, reasoning, toolCalls };
};

// ─── Responses API transform ───

const contentToResponses = (
  content: AgentMessageContent,
): ResponsesInputText | ResponsesInputImage | null => {
  switch (content.type) {
    case "text":
      return { type: "input_text", text: content.text };
    case "image":
      return {
        type: "input_image",
        image_url: `data:${content.mimeType};base64,${content.data}`,
      };
    case "file":
      return { type: "input_text", text: `[File: ${content.name}]\n${content.data}` };
    default:
      return null;
  }
};

export const responsesTransform = (messages: AgentMessage[]): ResponsesInputItem[] => {
  const result: ResponsesInputItem[] = [];

  const toolResultMap = new Map<string, { result: unknown; isError?: boolean }>();
  for (const msg of messages) {
    for (const c of msg.content) {
      if (c.type === "tool_result") {
        toolResultMap.set(c.id, { result: c.result, isError: c.isError });
      }
    }
  }

  for (const msg of messages) {
    const toolCalls = msg.content.filter(
      (c): c is AgentMessageContent & { type: "tool_call" } => c.type === "tool_call",
    );
    const toolResults = msg.content.filter(
      (c): c is AgentMessageContent & { type: "tool_result" } => c.type === "tool_result",
    );
    const otherContent = msg.content.filter(
      (c) => c.type !== "tool_call" && c.type !== "tool_result",
    );

    if (toolResults.length > 0 && toolCalls.length === 0) {
      continue;
    }

    const responsesContent: Array<ResponsesInputText | ResponsesInputImage> = [];
    for (const c of otherContent) {
      const converted = contentToResponses(c);
      if (converted) responsesContent.push(converted);
    }

    if (responsesContent.length > 0) {
      const role =
        msg.role === "tool" ? "user" : (msg.role as "user" | "assistant" | "system" | "developer");
      if (responsesContent.length === 1 && responsesContent[0].type === "input_text") {
        result.push({
          role,
          content: responsesContent[0].text,
          type: "message",
        });
      } else {
        result.push({
          role,
          content: responsesContent,
          type: "message",
        });
      }
    }

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const fcId = tc.id.startsWith("fc_") ? tc.id : `fc_${tc.id}`;
        result.push({
          type: "function_call",
          id: fcId,
          call_id: fcId,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
          status: "completed",
        });

        const tr = toolResultMap.get(tc.id);
        if (tr) {
          result.push({
            type: "function_call_output",
            call_id: fcId,
            output: typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result),
          });
        }
      }
    }
  }

  return result;
};

export const createTransformPipeline = (): TransformPipeline => {
  return new TransformPipeline();
};
