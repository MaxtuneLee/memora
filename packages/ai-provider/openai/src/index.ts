import { toJsonSchema } from "@valibot/to-json-schema";

import type { ProviderAdapter, ProviderRequest, ToolDefinition } from "@memora/ai-core";

import { parseResponsesStream, parseSSEStream } from "./stream";
import { transformChatCompletionsMessages, transformResponsesInput } from "./transform";
import type {
  ApiFormat,
  LLMRequestPayload,
  LLMToolDefinition,
  ResponsesBuiltinToolDefinition,
  ResponsesFunctionToolDefinition,
  ResponsesRequestPayload,
  ResponsesToolDefinition,
} from "./types";

export type { ApiFormat } from "./types";
export type {
  LLMImageContent,
  LLMMessage,
  LLMRequestPayload,
  LLMTextContent,
  LLMToolCall,
  LLMToolDefinition,
  ResponsesBuiltinToolDefinition,
  ResponsesFunctionCall,
  ResponsesFunctionCallOutput,
  ResponsesFunctionToolDefinition,
  ResponsesInputImage,
  ResponsesInputItem,
  ResponsesInputMessage,
  ResponsesInputText,
  ResponsesRequestPayload,
  ResponsesToolDefinition,
} from "./types";
export { parseResponsesStream, parseSSEStream } from "./stream";
export { transformChatCompletionsMessages, transformResponsesInput } from "./transform";

const DEFAULT_REASONING = {
  effort: "none",
} as const;

export interface OpenAIProviderConfig {
  endpoint: string;
  apiKey?: string;
  apiFormat?: ApiFormat;
  builtinTools?: ResponsesBuiltinToolDefinition[];
}

export const createOpenAIProvider = (config: OpenAIProviderConfig): ProviderAdapter => {
  return {
    async *stream(request: ProviderRequest, options?: { signal?: AbortSignal }) {
      const endpoint = config.endpoint.trim();
      if (!endpoint) {
        throw new Error("Missing OpenAI provider endpoint.");
      }

      const apiFormat = config.apiFormat ?? "chat-completions";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.apiKey?.trim()) {
        headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
      }

      const payload =
        apiFormat === "responses"
          ? createResponsesPayload(request, config.builtinTools ?? [])
          : createChatCompletionsPayload(request);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LLM request failed: ${response.status} ${response.statusText} ${text}`);
      }

      if (apiFormat === "responses") {
        yield* parseResponsesStream(response);
      } else {
        yield* parseSSEStream(response);
      }
    },
  };
};

export const createChatCompletionsPayload = (request: ProviderRequest): LLMRequestPayload => {
  const messages = transformChatCompletionsMessages(request.messages);
  const tools = toChatCompletionsTools(request.tools);

  const payload: LLMRequestPayload = {
    model: request.model,
    messages: request.systemPrompt
      ? [{ role: "system", content: request.systemPrompt }, ...messages]
      : messages,
    stream: true,
    reasoning: DEFAULT_REASONING,
    stream_options: { include_usage: true },
    ...(tools.length > 0 ? { tools } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
  };

  return payload;
};

export const createResponsesPayload = (
  request: ProviderRequest,
  builtinTools: ResponsesBuiltinToolDefinition[] = [],
): ResponsesRequestPayload => {
  const functionTools = toResponsesTools(request.tools);
  const tools: ResponsesToolDefinition[] = [...functionTools, ...builtinTools];

  return {
    model: request.model,
    input: transformResponsesInput(request.messages),
    stream: true,
    instructions: request.systemPrompt,
    reasoning: DEFAULT_REASONING,
    ...(tools.length > 0 ? { tools } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_output_tokens: request.maxTokens } : {}),
  };
};

const toChatCompletionsTools = (tools: ToolDefinition[]): LLMToolDefinition[] => {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: schemaToJsonSchema(tool.parameters),
    },
  }));
};

const toResponsesTools = (tools: ToolDefinition[]): ResponsesFunctionToolDefinition[] => {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: schemaToJsonSchema(tool.parameters),
    strict: true,
  }));
};

const enforceStrictSchema = (obj: Record<string, unknown>): Record<string, unknown> => {
  if (obj.type === "object") {
    obj.additionalProperties = false;
    const props = obj.properties as Record<string, unknown> | undefined;
    if (props) {
      const allKeys = Object.keys(props);
      const existing = (obj.required as string[]) ?? [];
      const missing = allKeys.filter((key) => !existing.includes(key));
      if (missing.length > 0) {
        obj.required = [...existing, ...missing];
      }
      for (const val of Object.values(props)) {
        if (val && typeof val === "object") {
          enforceStrictSchema(val as Record<string, unknown>);
        }
      }
    }
  }
  return obj;
};

const schemaToJsonSchema = (schema: ToolDefinition["parameters"]): Record<string, unknown> => {
  const jsonSchema = toJsonSchema(schema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return enforceStrictSchema(jsonSchema);
};
