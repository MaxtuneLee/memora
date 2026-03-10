import type { AgentEvent, WebSearchStatus } from "./types";

// ─── Chat Completions SSE types ───

interface SSEChunkDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
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
  choices?: Array<{
    index: number;
    delta: SSEChunkDelta;
    finish_reason: string | null;
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

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<AgentEvent> {
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let currentText = "";
  let reasoningText = "";
  const pendingToolCalls = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

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
          for (const [, tc] of pendingToolCalls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.arguments);
            } catch {
              parsedArgs = {};
            }
            yield {
              type: "tool-call-complete",
              toolCall: { id: tc.id, name: tc.name, arguments: parsedArgs },
            };
          }
          return;
        }

        let chunk: SSEChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        if (delta.reasoning_content) {
          reasoningText += delta.reasoning_content;
          yield { type: "reasoning-delta", delta: delta.reasoning_content };
        }

        if (delta.content) {
          if (reasoningText) {
            yield { type: "reasoning-done", text: reasoningText };
            reasoningText = "";
          }
          currentText += delta.content;
          yield { type: "text-delta", delta: delta.content };
        }

        if (delta.tool_calls) {
          if (reasoningText) {
            yield { type: "reasoning-done", text: reasoningText };
            reasoningText = "";
          }
          for (const tc of delta.tool_calls) {
            const idx = tc.index;

            if (tc.id) {
              pendingToolCalls.set(idx, {
                id: tc.id,
                name: tc.function?.name ?? "",
                arguments: tc.function?.arguments ?? "",
              });
              yield {
                type: "tool-call-start",
                toolCall: { id: tc.id, name: tc.function?.name ?? "" },
              };
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

        if (choice.finish_reason === "tool_calls") {
          for (const [idx, tc] of pendingToolCalls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.arguments);
            } catch {
              parsedArgs = {};
            }
            yield {
              type: "tool-call-complete",
              toolCall: { id: tc.id, name: tc.name, arguments: parsedArgs },
            };
            pendingToolCalls.delete(idx);
          }
        }
      }
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

export async function* parseResponsesStream(
  response: Response,
): AsyncGenerator<AgentEvent> {
  const pendingFunctionCalls = new Map<
    string,
    { callId: string; name: string; arguments: string }
  >();

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
          pendingFunctionCalls.set(callId, {
            callId,
            name,
            arguments: event.item?.arguments ?? "",
          });
          yield {
            type: "tool-call-start",
            toolCall: { id: callId, name },
          };
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
          const callId = event.item?.call_id ?? itemId;
          const fc = pendingFunctionCalls.get(callId);
          const args = event.item?.arguments ?? fc?.arguments ?? "{}";
          const name = event.item?.name ?? fc?.name ?? "";

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
          const callId = event.item_id ?? "";
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
