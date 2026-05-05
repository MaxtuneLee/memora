import { InterruptableStoppingCriteria, TextStreamer } from "@huggingface/transformers";
import type { LocalChatEvent } from "@memora/local-model-runtime";

interface ProcessorLike {
  tokenizer?: unknown;
  apply_chat_template: (messages: unknown, options?: Record<string, unknown>) => unknown;
}

interface TemplateMessageLike {
  role?: unknown;
  content?: unknown;
}

interface TokenizerLike {
  (input: string, options?: Record<string, unknown>): Record<string, unknown>;
  decode: (tokens: bigint[], options?: Record<string, unknown>) => string;
}

interface GenerativeModelLike {
  generate: (input: Record<string, unknown>) => Promise<unknown>;
}

type StreamedToken = bigint | bigint[];

type ToolStreamingMode = "none" | "json";

interface ChatTemplateFunctionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

interface StreamingDecisionState {
  mode: "unknown" | "content" | "tool";
  pendingVisibleText: string;
  emittedText: string;
}

const SPECIAL_TOKENS = [
  "<eos>",
  "<bos>",
  "<end_of_turn>",
  "<start_of_turn>",
  "<|turn>",
  "<turn|>",
  "<|tool>",
  "<tool|>",
  "<|tool_call>",
  "<tool_call|>",
  "<|tool_response>",
  "<tool_response|>",
  "<|channel>",
  "<channel|>",
  "<|think|>",
  "<|image|>",
  "<|vision_start|>",
  "<|vision_end|>",
  "<|im_start|>",
  "<|im_end|>",
  "<|endoftext|>",
] as const;

const stripSpecialTokens = (text: string): string => {
  let result = text;
  for (const token of SPECIAL_TOKENS) {
    if (result.includes(token)) {
      result = result.split(token).join("");
    }
  }
  return result;
};

const contentItemToText = (content: unknown): string => {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";

  const record = content as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return record.text;
  if (record.type === "tool_result") return JSON.stringify(record.result);
  if (record.type === "tool_call") {
    return JSON.stringify({ name: record.name, arguments: record.arguments });
  }
  if (record.type === "image") return "[Image]";
  if (record.type === "audio") return "[Audio]";
  return "";
};

const normalizeTemplateMessagesToText = (messages: unknown[]): unknown[] => {
  return messages.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return message;

    const record = message as TemplateMessageLike;
    if (!Array.isArray(record.content)) return message;

    return {
      ...record,
      content: record.content.map(contentItemToText).filter(Boolean).join("\n"),
    };
  });
};

const isArrayTrimTemplateError = (error: unknown): boolean => {
  return error instanceof Error && error.message.includes("Unknown ArrayValue filter: trim");
};

export const applyChatTemplate = (input: {
  processor: ProcessorLike;
  messages: unknown[];
  tools?: unknown[];
}): string => {
  const tools = toChatTemplateTools(input.tools ?? []);
  const options = {
    tokenize: false,
    add_generation_prompt: true,
    ...(tools.length > 0 ? { tools } : {}),
  };

  try {
    const prompt = input.processor.apply_chat_template(input.messages, options);
    if (typeof prompt !== "string") {
      throw new Error("Local chat template did not return a prompt string.");
    }
    return prompt;
  } catch (error) {
    if (!isArrayTrimTemplateError(error)) throw error;

    const prompt = input.processor.apply_chat_template(
      normalizeTemplateMessagesToText(input.messages),
      options,
    );
    if (typeof prompt !== "string") {
      throw new Error("Local chat template did not return a prompt string.");
    }
    return prompt;
  }
};

export const toChatTemplateTools = (tools: unknown[]): ChatTemplateFunctionTool[] => {
  return tools.flatMap((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return [];
    const record = tool as Record<string, unknown>;
    if (record.type === "function" && record.function && typeof record.function === "object") {
      return [record as unknown as ChatTemplateFunctionTool];
    }
    if (typeof record.name !== "string" || !record.name.trim()) return [];
    return [
      {
        type: "function",
        function: {
          name: record.name,
          ...(typeof record.description === "string" ? { description: record.description } : {}),
          ...(record.parameters
            ? { parameters: normalizeChatTemplateSchema(record.parameters) }
            : {}),
        },
      },
    ];
  });
};

const normalizeChatTemplateSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(normalizeChatTemplateSchema);
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    normalized[key] = normalizeChatTemplateSchema(value);
  }

  if (normalized.type === undefined) {
    const inferredType = inferChatTemplateSchemaType(normalized);
    if (inferredType) {
      normalized.type = inferredType;
    }
  }

  return normalized;
};

const inferChatTemplateSchemaType = (schema: Record<string, unknown>): string | null => {
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  ) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  if (Array.isArray(schema.enum)) {
    return inferEnumSchemaType(schema.enum);
  }

  if (schema.const !== undefined) {
    return inferPrimitiveSchemaType(schema.const);
  }

  return null;
};

const inferEnumSchemaType = (values: unknown[]): string | null => {
  const definedValues = values.filter((value) => value !== null);
  if (definedValues.length === 0) return null;

  const types = new Set(definedValues.map(inferPrimitiveSchemaType));
  if (types.size !== 1) return null;
  return types.values().next().value ?? null;
};

const inferPrimitiveSchemaType = (value: unknown): string | null => {
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    default:
      return null;
  }
};

export const getDecodedTokenDelta = (input: {
  tokenizer: Pick<TokenizerLike, "decode">;
  tokenIds: bigint[];
  emittedText: string;
}): { delta: string; text: string } => {
  const decodedText = stripSpecialTokens(
    input.tokenizer.decode(input.tokenIds, {
      skip_special_tokens: false,
    }),
  );
  const replacementIndex = decodedText.indexOf("�");
  const text = replacementIndex === -1 ? decodedText : decodedText.slice(0, replacementIndex);

  if (!text.startsWith(input.emittedText)) {
    return { delta: "", text: input.emittedText };
  }

  return {
    delta: text.slice(input.emittedText.length),
    text,
  };
};

export const runTextGeneration = async (input: {
  processor: ProcessorLike;
  model: GenerativeModelLike;
  messages: unknown[];
  generationConfig: Record<string, unknown>;
  tools?: unknown[];
  toolStreamingMode?: ToolStreamingMode;
  suppressTextDeltas?: boolean;
  emit: (event: LocalChatEvent) => void;
  canceled: () => boolean;
}): Promise<{ text: string; streamedVisibleText: boolean }> => {
  const tokenizer = input.processor.tokenizer as TokenizerLike | undefined;
  if (!tokenizer) {
    throw new Error("Local chat processor does not expose a tokenizer.");
  }

  const prompt = applyChatTemplate({
    processor: input.processor,
    messages: input.messages,
    tools: input.tools,
  });

  const modelInputs = tokenizer(prompt, {
    add_special_tokens: false,
    return_tensor: true,
  });

  let generatedText = "";
  const generatedTokenIds: bigint[] = [];
  const streamingState: StreamingDecisionState = {
    mode: input.toolStreamingMode === "none" ? "content" : "unknown",
    pendingVisibleText: "",
    emittedText: "",
  };
  const stoppingCriteria = new InterruptableStoppingCriteria();
  const streamer = new TextStreamer(tokenizer as never, {
    skip_prompt: true,
    skip_special_tokens: false,
    token_callback_function: (tokens: bigint[]) => {
      if (input.canceled()) {
        stoppingCriteria.interrupt();
        return;
      }
      generatedTokenIds.push(...flattenStreamedTokens(tokens as StreamedToken[]));
      const decoded = getDecodedTokenDelta({
        tokenizer,
        tokenIds: generatedTokenIds,
        emittedText: generatedText,
      });
      generatedText = decoded.text;
      if (!decoded.delta || input.suppressTextDeltas) return;

      streamVisibleText({
        state: streamingState,
        delta: decoded.delta,
        rawText: generatedText,
        toolStreamingMode: input.toolStreamingMode ?? "none",
        emit: input.emit,
      });
    },
  });

  await input.model.generate({
    ...modelInputs,
    ...input.generationConfig,
    stopping_criteria: stoppingCriteria,
    streamer,
  });

  flushStreamingText(streamingState, input.emit);
  return {
    text: generatedText,
    streamedVisibleText: streamingState.emittedText.length > 0,
  };
};

const flattenStreamedTokens = (tokens: StreamedToken[]): bigint[] => {
  return tokens.flatMap((token) => (Array.isArray(token) ? token : [token]));
};

const streamVisibleText = (input: {
  state: StreamingDecisionState;
  delta: string;
  rawText: string;
  toolStreamingMode: ToolStreamingMode;
  emit: (event: LocalChatEvent) => void;
}): void => {
  if (!input.delta) return;

  if (input.state.mode === "content") {
    input.state.emittedText += input.delta;
    input.emit({ type: "text-delta", delta: input.delta });
    return;
  }

  if (input.state.mode === "tool") {
    return;
  }

  input.state.pendingVisibleText += input.delta;
  const nextMode = decideToolStreamingMode(input.toolStreamingMode, input.rawText);
  if (nextMode === "unknown") {
    return;
  }

  input.state.mode = nextMode;
  if (nextMode !== "content" || !input.state.pendingVisibleText) {
    input.state.pendingVisibleText = "";
    return;
  }

  input.state.emittedText += input.state.pendingVisibleText;
  input.emit({ type: "text-delta", delta: input.state.pendingVisibleText });
  input.state.pendingVisibleText = "";
};

const flushStreamingText = (
  state: StreamingDecisionState,
  emit: (event: LocalChatEvent) => void,
): void => {
  if (!state.pendingVisibleText) return;
  if (state.mode === "tool") {
    state.pendingVisibleText = "";
    return;
  }

  state.mode = "content";
  state.emittedText += state.pendingVisibleText;
  emit({ type: "text-delta", delta: state.pendingVisibleText });
  state.pendingVisibleText = "";
};

const decideToolStreamingMode = (
  toolStreamingMode: ToolStreamingMode,
  rawText: string,
): StreamingDecisionState["mode"] => {
  if (toolStreamingMode === "none") {
    return "content";
  }

  const trimmed = rawText.trimStart();
  if (!trimmed) {
    return "unknown";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("<|tool_call>")) {
    return "tool";
  }

  if ("<|tool_call>".startsWith(trimmed)) {
    return "unknown";
  }

  return "content";
};
