import type { AgentEvent, TokenUsage, WebSearchStatus } from "./types";

// ─── Chat Completions SSE types ───

interface SSEChunkDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
  reasoning_details?: Array<{
    text?: string;
    [key: string]: unknown;
  }>;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface SSEChunk {
  id?: string;
  object?: string;
  provider?: string;
  usage?: Record<string, unknown>;
  choices?: Array<{
    index: number;
    delta: SSEChunkDelta;
    finish_reason: string | null;
    native_finish_reason?: string | null;
  }>;
}

// ─── Responses API SSE types ───

interface ResponsesSSEEvent {
  type: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  delta?: string;
  text?: string;
  usage?: Record<string, unknown>;
  part?: Record<string, unknown>;
  item?: {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    status?: string;
    content?: Array<{ type?: string; text?: string; annotations?: unknown[] }>;
    queries?: string[];
    results?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  response?: {
    id?: string;
    status?: string;
    usage?: Record<string, unknown>;
    error?: { message?: string; code?: string };
    output?: Array<{
      type?: string;
      id?: string;
      call_id?: string;
      name?: string;
      arguments?: string;
      status?: string;
      content?: Array<{ type?: string; text?: string; annotations?: unknown[] }>;
      [key: string]: unknown;
    }>;
  };
}

const normalizeUsageValue = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
};

const normalizeTokenUsage = (value: unknown): TokenUsage | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const inputTokens = normalizeUsageValue(
    candidate.input_tokens ?? candidate.inputTokens ?? candidate.prompt_tokens,
  );
  const outputTokens = normalizeUsageValue(
    candidate.output_tokens ?? candidate.outputTokens ?? candidate.completion_tokens,
  );
  const totalTokens = normalizeUsageValue(candidate.total_tokens ?? candidate.totalTokens);

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
};

const normalizeChunkText = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value;
};

const extractReasoningText = (delta: SSEChunkDelta): string | undefined => {
  const reasoningContent = normalizeChunkText(delta.reasoning_content);
  if (reasoningContent) {
    return reasoningContent;
  }

  const reasoning = normalizeChunkText(delta.reasoning);
  if (reasoning) {
    return reasoning;
  }

  if (!Array.isArray(delta.reasoning_details)) {
    return undefined;
  }

  const reasoningDetails = delta.reasoning_details
    .map((detail) => normalizeChunkText(detail.text))
    .filter((text): text is string => text !== undefined)
    .join("");

  return reasoningDetails || undefined;
};

export async function* parseSSEStream(response: Response): AsyncGenerator<AgentEvent> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let reasoningText = "";
  const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();

  const flushReasoning = (): AgentEvent[] => {
    if (!reasoningText) {
      return [];
    }

    const text = reasoningText;
    reasoningText = "";
    return [{ type: "reasoning-done", text }];
  };

  const finalizePendingToolCalls = (): AgentEvent[] => {
    const events: AgentEvent[] = [];

    for (const [idx, tc] of pendingToolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.arguments);
      } catch {
        parsedArgs = {};
      }

      events.push({
        type: "tool-call-complete",
        toolCall: { id: tc.id, name: tc.name, arguments: parsedArgs },
      });
      pendingToolCalls.delete(idx);
    }

    return events;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);

        if (data === "[DONE]") {
          for (const event of flushReasoning()) {
            yield event;
          }
          for (const event of finalizePendingToolCalls()) {
            yield event;
          }
          return;
        }

        let chunk: SSEChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }

        const usage = normalizeTokenUsage(chunk.usage);
        if (usage) {
          yield { type: "usage", usage };
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        const reasoningDelta = extractReasoningText(delta);

        if (reasoningDelta) {
          reasoningText += reasoningDelta;
          yield { type: "reasoning-delta", delta: reasoningDelta };
        }

        if (delta.content) {
          for (const event of flushReasoning()) {
            yield event;
          }
          yield { type: "text-delta", delta: delta.content };
        }

        if (delta.tool_calls) {
          for (const event of flushReasoning()) {
            yield event;
          }
          for (const tc of delta.tool_calls) {
            const idx = tc.index;

            if (tc.id) {
              const initialArguments = tc.function?.arguments ?? "";
              pendingToolCalls.set(idx, {
                id: tc.id,
                name: tc.function?.name ?? "",
                arguments: initialArguments,
              });
              yield {
                type: "tool-call-start",
                toolCall: { id: tc.id, name: tc.function?.name ?? "" },
              };
              if (initialArguments) {
                yield {
                  type: "tool-call-args-delta",
                  toolCallId: tc.id,
                  delta: initialArguments,
                };
              }
            } else {
              const pending = pendingToolCalls.get(idx);
              if (pending) {
                if (tc.function?.name) {
                  pending.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  pending.arguments += tc.function.arguments;
                  yield {
                    type: "tool-call-args-delta",
                    toolCallId: pending.id,
                    delta: tc.function.arguments,
                  };
                }
              }
            }
          }
        }

        if (choice.finish_reason) {
          for (const event of flushReasoning()) {
            yield event;
          }
        }

        if (choice.finish_reason === "tool_calls") {
          for (const event of finalizePendingToolCalls()) {
            yield event;
          }
        }
      }
    }

    for (const event of flushReasoning()) {
      yield event;
    }
    for (const event of finalizePendingToolCalls()) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* readSSELines(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseResponsesStream(response: Response): AsyncGenerator<AgentEvent> {
  const pendingFunctionCalls = new Map<
    string,
    { itemId: string; callId: string; name: string; arguments: string }
  >();
  const pendingFunctionCallItemIds = new Map<string, string>();

  let currentEventType = "";
  let reasoningText = "";

  for await (const line of readSSELines(response)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) continue;

    if (trimmed.startsWith("event:")) {
      currentEventType = trimmed.slice(6).trim();
      continue;
    }

    if (trimmed.startsWith("id:")) continue;

    if (!trimmed.startsWith("data:")) continue;
    const eventData = trimmed.slice(5).trim();

    if (eventData === "[DONE]") {
      for (const [, fc] of pendingFunctionCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(fc.arguments);
        } catch {
          parsedArgs = {};
        }
        yield {
          type: "tool-call-complete",
          toolCall: { id: fc.callId, name: fc.name, arguments: parsedArgs },
        };
      }
      pendingFunctionCallItemIds.clear();
      return;
    }

    let event: ResponsesSSEEvent;
    try {
      event = JSON.parse(eventData);
    } catch {
      continue;
    }

    const eventType = currentEventType || event.type;
    currentEventType = "";

    switch (eventType) {
      case "response.created": {
        yield { type: "status", status: "created" };
        break;
      }

      case "response.in_progress": {
        yield { type: "status", status: "in_progress" };
        break;
      }

      case "response.output_text.delta": {
        if (event.delta) {
          yield { type: "text-delta", delta: event.delta };
        }
        break;
      }

      case "response.output_text.done": {
        break;
      }

      case "response.usage": {
        const usage = normalizeTokenUsage(event.usage ?? event.response?.usage);
        if (usage) {
          yield { type: "usage", usage };
        }
        break;
      }

      case "response.reasoning_summary_text.delta": {
        if (event.delta) {
          reasoningText += event.delta;
          yield { type: "reasoning-delta", delta: event.delta };
        }
        break;
      }

      case "response.reasoning_summary_text.done": {
        const text = event.text ?? reasoningText;
        yield { type: "reasoning-done", text };
        reasoningText = "";
        break;
      }

      case "response.output_item.added": {
        const itemType = event.item?.type ?? "";
        const itemId = event.item?.id ?? "";

        if (itemType === "function_call") {
          const callId = event.item?.call_id ?? itemId;
          const name = event.item?.name ?? "";
          const initialArguments = event.item?.arguments ?? "";
          pendingFunctionCalls.set(callId, {
            itemId,
            callId,
            name,
            arguments: initialArguments,
          });
          if (itemId) {
            pendingFunctionCallItemIds.set(itemId, callId);
          }
          yield {
            type: "tool-call-start",
            toolCall: { id: callId, name },
          };
          if (initialArguments) {
            yield {
              type: "tool-call-args-delta",
              toolCallId: callId,
              delta: initialArguments,
            };
          }
        } else {
          yield {
            type: "output-item-added",
            itemType,
            itemId,
            item: (event.item ?? {}) as Record<string, unknown>,
          };
        }
        break;
      }

      case "response.output_item.done": {
        const itemType = event.item?.type ?? "";
        const itemId = event.item?.id ?? "";

        if (itemType === "function_call") {
          const callId = event.item?.call_id ?? pendingFunctionCallItemIds.get(itemId) ?? itemId;
          const fc = pendingFunctionCalls.get(callId);
          const bufferedArgs = fc?.arguments ?? "";
          const args = event.item?.arguments ?? fc?.arguments ?? "{}";
          const name = event.item?.name ?? fc?.name ?? "";

          if (args && args !== bufferedArgs) {
            const delta = args.startsWith(bufferedArgs) ? args.slice(bufferedArgs.length) : args;

            if (delta) {
              if (fc) {
                fc.arguments = args;
              }
              yield {
                type: "tool-call-args-delta",
                toolCallId: callId,
                delta,
              };
            }
          }

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(args);
          } catch {
            parsedArgs = {};
          }

          yield {
            type: "tool-call-complete",
            toolCall: { id: callId, name, arguments: parsedArgs },
          };
          pendingFunctionCalls.delete(callId);
          if (fc?.itemId) {
            pendingFunctionCallItemIds.delete(fc.itemId);
          } else if (itemId) {
            pendingFunctionCallItemIds.delete(itemId);
          }
        } else {
          yield {
            type: "output-item-done",
            itemType,
            itemId,
            item: (event.item ?? {}) as Record<string, unknown>,
          };
        }
        break;
      }

      case "response.function_call_arguments.delta": {
        if (event.delta) {
          const callId = pendingFunctionCallItemIds.get(event.item_id ?? "") ?? event.item_id ?? "";
          const fc = pendingFunctionCalls.get(callId);
          if (fc) {
            fc.arguments += event.delta;
            yield {
              type: "tool-call-args-delta",
              toolCallId: fc.callId,
              delta: event.delta,
            };
          }
        }
        break;
      }

      case "response.function_call_arguments.done": {
        break;
      }

      case "response.web_search_call.in_progress":
      case "response.web_search_call.searching":
      case "response.web_search_call.completed": {
        const statusSuffix = eventType.split(".").pop() as WebSearchStatus;
        yield {
          type: "web-search",
          status: statusSuffix,
          itemId: event.item_id ?? event.item?.id ?? "",
        };
        break;
      }

      case "response.content_part.added":
      case "response.content_part.done": {
        break;
      }

      case "response.completed": {
        const usage = normalizeTokenUsage(event.response?.usage ?? event.usage);
        if (usage) {
          yield { type: "usage", usage };
        }
        for (const [, fc] of pendingFunctionCalls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(fc.arguments);
          } catch {
            parsedArgs = {};
          }
          yield {
            type: "tool-call-complete",
            toolCall: { id: fc.callId, name: fc.name, arguments: parsedArgs },
          };
        }
        pendingFunctionCalls.clear();
        pendingFunctionCallItemIds.clear();
        break;
      }

      case "response.failed": {
        const errorObj = event.response?.error as { message?: string; code?: string } | undefined;
        const msg = errorObj?.message ?? "Response generation failed";
        yield { type: "error", error: new Error(msg) };
        break;
      }

      default:
        break;
    }
  }
}
