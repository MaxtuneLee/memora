import { describe, expect, test } from "vite-plus/test";

import {
  buildQwenGenerationConfig,
  buildQwenMessages,
  parseQwenToolCall,
} from "@memora/local-model-runtime/worker";

describe("qwen35 adapter helpers", () => {
  test("forwards the system prompt and preserves text and image content", () => {
    const messages = buildQwenMessages({
      systemPrompt: "You are Memora.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            { type: "image", mimeType: "image/png", data: "abc" },
          ],
        },
      ],
      tools: [],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "system",
      content: [{ type: "text", text: "You are Memora." }],
    });
    expect(messages[1]?.content).toEqual([
      { type: "text", text: "describe this" },
      { type: "image", mimeType: "image/png", data: "abc" },
    ]);
  });

  test("keeps Qwen tools out of the leading system message", () => {
    const messages = buildQwenMessages({
      systemPrompt: "You are Memora.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "search my notes" }],
        },
      ],
      tools: [
        {
          name: "search_notes",
          description: "Search notes",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
      ],
    });

    expect(messages).toEqual([
      { role: "system", content: [{ type: "text", text: "You are Memora." }] },
      { role: "user", content: [{ type: "text", text: "search my notes" }] },
    ]);
  });

  test("adds no system message for a blank system prompt", () => {
    const messages = buildQwenMessages({
      systemPrompt: "  ",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
    });

    expect(messages.map((message) => message.role)).toEqual(["user"]);
  });

  test("uses thinking config when requested", () => {
    expect(buildQwenGenerationConfig({ reasoningMode: "thinking" })).toMatchObject({
      temperature: 1,
      top_p: 0.95,
      presence_penalty: 1.5,
      max_new_tokens: 3072,
    });
  });

  test("uses a longer default output budget for chat", () => {
    expect(buildQwenGenerationConfig({})).toMatchObject({
      max_new_tokens: 2048,
    });
    expect(buildQwenGenerationConfig({ maxTokens: 128 })).toMatchObject({
      max_new_tokens: 128,
    });
  });

  test("parses JSON tool calls", () => {
    expect(parseQwenToolCall('{"name":"search","arguments":{"query":"memora"}}')).toEqual({
      name: "search",
      arguments: { query: "memora" },
    });
  });

  test("parses chat template tool calls", () => {
    expect(
      parseQwenToolCall('<|tool_call>call:search_notes{query:<|"|>memora<|"|>}<tool_call|>'),
    ).toEqual({
      name: "search_notes",
      arguments: { query: "memora" },
    });
  });

  test("parses XML-style tool calls commonly emitted by Qwen", () => {
    expect(
      parseQwenToolCall(
        "<tool_call>\n<function=read_chat_session>\n<parameter=session_id>\nchat_session_1\n<parameter=max_messages>\n20\n</tool_call>",
      ),
    ).toEqual({
      name: "read_chat_session",
      arguments: { session_id: "chat_session_1", max_messages: 20 },
    });
  });
});
