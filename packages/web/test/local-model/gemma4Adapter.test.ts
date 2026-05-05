import { describe, expect, test } from "vite-plus/test";

import {
  buildGemmaGenerationConfig,
  buildGemmaMessages,
  parseGemmaToolCall,
  __private__,
} from "../../src/workers/local-model/chat/gemma4";

describe("gemma4 adapter helpers", () => {
  test("uses string content for text-only messages without local system prompt injection", async () => {
    const messages = await buildGemmaMessages({
      systemPrompt: "You are Memora.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "summarize" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ],
      tools: [],
    });

    expect(messages[0]?.content).toBe("summarize");
    expect(messages[1]?.content).toBe("done");
  });

  test("adds thinking marker when requested", () => {
    expect(buildGemmaGenerationConfig({ reasoningMode: "thinking" })).toMatchObject({
      reasoningPrompt: "<|think|>",
    });
  });

  test("parses JSON native tool call fallback", () => {
    expect(parseGemmaToolCall('{"name":"search","arguments":{"query":"memora"}}')).toEqual({
      name: "search",
      arguments: { query: "memora" },
    });
  });

  test("keeps gemma native template path and only falls back for trim array errors", () => {
    const calls: Array<{ messages: unknown; options?: Record<string, unknown> }> = [];
    const processor = {
      apply_chat_template(messages: unknown, options?: Record<string, unknown>) {
        calls.push({ messages, options });
        if (calls.length === 1) {
          throw new Error("Unknown ArrayValue filter: trim");
        }
        return "prompt";
      },
    };

    expect(
      __private__.buildGemmaPrompt(processor as never, [
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "tool_result", result: { ok: true } },
          ],
        },
      ]),
    ).toBe("prompt");

    expect(calls[1]?.messages).toEqual([
      {
        role: "user",
        content: 'hello\n{"ok":true}',
      },
    ]);
    expect(calls[1]?.options).toMatchObject({
      enable_thinking: false,
      add_generation_prompt: true,
    });
  });

  test("maps reasoning mode to Gemma template thinking flag", () => {
    const templateOptions: Array<Record<string, unknown> | undefined> = [];
    const processor = {
      apply_chat_template(_messages: unknown, options?: Record<string, unknown>) {
        templateOptions.push(options);
        return "prompt";
      },
    };

    __private__.buildGemmaPrompt(processor as never, [{ role: "user", content: "hello" }], {
      reasoningMode: "thinking",
    });
    __private__.buildGemmaPrompt(processor as never, [{ role: "user", content: "hello" }], {
      reasoningMode: "non-thinking",
    });

    expect(templateOptions[0]).toMatchObject({
      enable_thinking: true,
      add_generation_prompt: true,
    });
    expect(templateOptions[1]).toMatchObject({
      enable_thinking: false,
      add_generation_prompt: true,
    });
  });

  test("passes OpenAI-style function tools to the native template", () => {
    const toolCalls: unknown[] = [];
    const processor = {
      apply_chat_template(_messages: unknown, options?: Record<string, unknown>) {
        toolCalls.push(options?.tools);
        return "prompt";
      },
    };

    expect(
      __private__.buildGemmaPrompt(
        processor as never,
        [{ role: "user", content: "hello" }],
        {
          tools: [
            {
              name: "search_notes",
              description: "Search notes",
              parameters: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
          ],
        },
      ),
    ).toBe("prompt");

    expect(toolCalls[0]).toEqual([
      {
        type: "function",
        function: {
          name: "search_notes",
          description: "Search notes",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      },
    ]);
  });

  test("parses native chat-template tool calls", () => {
    expect(
      parseGemmaToolCall('<|tool_call>call:search_notes{query:<|"|>memora<|"|>}<tool_call|>'),
    ).toEqual({
      name: "search_notes",
      arguments: { query: "memora" },
    });
  });

  test("maps tool history to reference-style tool fields", async () => {
    const messages = await buildGemmaMessages({
      systemPrompt: "",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "checking" },
            { type: "tool_call", id: "1", name: "vision", arguments: { prompt: "look" } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool_result",
              id: "1",
              name: "vision",
              result: { description: "scene" },
            },
          ],
        },
      ],
      tools: [],
    });

    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: "checking",
      tool_calls: [{ id: "1", function: { name: "vision", arguments: { prompt: "look" } } }],
    });
    expect(messages[1]).toMatchObject({
      role: "tool",
      name: "vision",
      tool_call_id: "1",
      content: '{"description":"scene"}',
    });
  });

  test("builds OpenAI-style tool result messages for Gemma template follow-scan", async () => {
    const messages = await buildGemmaMessages({
      systemPrompt: "",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "tool_call", id: "call-1", name: "list_chat_sessions", arguments: { limit: 1 } },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool_result",
              id: "call-1",
              name: "list_chat_sessions",
              result: { sessions: [{ title: "Test" }] },
            },
          ],
        },
      ],
      tools: [],
    });

    expect(messages).toEqual([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call-1",
            function: { name: "list_chat_sessions", arguments: { limit: 1 } },
          },
        ],
      },
      {
        role: "tool",
        name: "list_chat_sessions",
        tool_call_id: "call-1",
        content: '{"sessions":[{"title":"Test"}]}',
      },
    ]);
  });
});
