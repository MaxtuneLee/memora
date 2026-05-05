import { describe, expect, test } from "vite-plus/test";

import {
  applyChatTemplate,
  getDecodedTokenDelta,
  runTextGeneration,
} from "../../src/workers/local-model/chat/generation";

describe("applyChatTemplate", () => {
  test("falls back to text content when the model template rejects array trim", () => {
    const calls: unknown[] = [];
    const processor = {
      apply_chat_template(messages: unknown) {
        calls.push(messages);
        if (calls.length === 1) {
          throw new Error("Unknown ArrayValue filter: trim");
        }
        return "prompt";
      },
    };

    expect(
      applyChatTemplate({
        processor,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "hello" },
              { type: "tool_result", result: { ok: true } },
            ],
          },
        ],
      }),
    ).toBe("prompt");
    expect(calls[1]).toEqual([
      {
        role: "user",
        content: 'hello\n{"ok":true}',
      },
    ]);
  });

  test("passes OpenAI-style function tools to the chat template", () => {
    const calls: unknown[] = [];
    const processor = {
      apply_chat_template(_messages: unknown, options?: Record<string, unknown>) {
        calls.push(options?.tools);
        return "prompt";
      },
    };

    expect(
      applyChatTemplate({
        processor,
        messages: [{ role: "user", content: "hello" }],
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
      }),
    ).toBe("prompt");

    expect(calls[0]).toEqual([
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

  test("adds missing schema types for enum parameters before templating", () => {
    const calls: unknown[] = [];
    const processor = {
      apply_chat_template(_messages: unknown, options?: Record<string, unknown>) {
        calls.push(options?.tools);
        return "prompt";
      },
    };

    expect(
      applyChatTemplate({
        processor,
        messages: [{ role: "user", content: "hello" }],
        tools: [
          {
            name: "modify_text_file",
            description: "Modify text",
            parameters: {
              type: "object",
              properties: {
                operation: {
                  enum: ["write", "append"],
                },
              },
              required: ["operation"],
            },
          },
        ],
      }),
    ).toBe("prompt");

    expect(calls[0]).toEqual([
      {
        type: "function",
        function: {
          name: "modify_text_file",
          description: "Modify text",
          parameters: {
            type: "object",
            properties: {
              operation: {
                enum: ["write", "append"],
                type: "string",
              },
            },
            required: ["operation"],
          },
        },
      },
    ]);
  });

  test("computes incremental text from decoded token history", () => {
    const tokenizer = {
      decode(tokens: bigint[]) {
        return tokens.join("") === "12" ? "你好" : "你";
      },
    };

    expect(
      getDecodedTokenDelta({
        tokenizer,
        tokenIds: [1n],
        emittedText: "",
      }),
    ).toEqual({ delta: "你", text: "你" });
    expect(
      getDecodedTokenDelta({
        tokenizer,
        tokenIds: [1n, 2n],
        emittedText: "你",
      }),
    ).toEqual({ delta: "好", text: "你好" });
  });

  test("does not emit unstable replacement characters while token text is incomplete", () => {
    const tokenizer = {
      decode(tokens: bigint[]) {
        const joined = tokens.join("");
        if (joined === "1") return "1";
        if (joined === "12") return "1�";
        if (joined === "123") return "1�";
        if (joined === "1234") return "1👦";
        return "";
      },
    };

    let emittedText = "";
    const deltas = [[1n], [1n, 2n], [1n, 2n, 3n], [1n, 2n, 3n, 4n]].map((tokenIds) => {
      const decoded = getDecodedTokenDelta({ tokenizer, tokenIds, emittedText });
      emittedText = decoded.text;
      return decoded.delta;
    });

    expect(deltas).toEqual(["1", "", "", "👦"]);
    expect(emittedText).toBe("1👦");
  });

  test("streams normal text even when tools are available", async () => {
    const emitted: string[] = [];
    const tokenizer = Object.assign(
      (_prompt: string) => {
        return { input_ids: { dims: [1, 1] } };
      },
      {
        all_special_ids: [],
        decode(tokens: bigint[]) {
          const joined = tokens.join("");
          if (joined === "0") return "";
          if (joined === "1") return "你";
          if (joined === "12") return "你好";
          return "";
        },
      },
    );
    const processor = {
      tokenizer,
      apply_chat_template() {
        return "prompt";
      },
    };
    const model = {
      async generate(input: { streamer?: { put: (tokens: bigint[][]) => void; end: () => void } }) {
        input.streamer?.put([[0n]]);
        input.streamer?.put([[1n]]);
        input.streamer?.put([[2n]]);
        input.streamer?.end();
      },
    };

    const result = await runTextGeneration({
      processor,
      model,
      messages: [],
      generationConfig: {},
      tools: [{ name: "search" }],
      toolStreamingMode: "json",
      emit(event) {
        if (event.type === "text-delta") {
          emitted.push(event.delta);
        }
      },
      canceled: () => false,
    });

    expect(emitted).toEqual(["你", "好"]);
    expect(result).toEqual({
      text: "你好",
      streamedVisibleText: true,
    });
  });

  test("keeps generated text available when text deltas are suppressed", async () => {
    const emitted: string[] = [];
    const tokenizer = Object.assign(
      (_prompt: string) => {
        return { input_ids: { dims: [1, 1] } };
      },
      {
        all_special_ids: [],
        decode(tokens: bigint[]) {
          const joined = tokens.join("");
          if (joined === "0") return "";
          if (joined === "1") return "你";
          if (joined === "12") return "你好";
          return "";
        },
      },
    );
    const processor = {
      tokenizer,
      apply_chat_template() {
        return "prompt";
      },
    };
    const model = {
      async generate(input: { streamer?: { put: (tokens: bigint[][]) => void; end: () => void } }) {
        input.streamer?.put([[0n]]);
        input.streamer?.put([[1n]]);
        input.streamer?.put([[2n]]);
        input.streamer?.end();
      },
    };

    const result = await runTextGeneration({
      processor,
      model,
      messages: [],
      generationConfig: {},
      suppressTextDeltas: true,
      emit(event) {
        if (event.type === "text-delta") {
          emitted.push(event.delta);
        }
      },
      canceled: () => false,
    });

    expect(emitted).toEqual([]);
    expect(result).toEqual({
      text: "你好",
      streamedVisibleText: false,
    });
  });
});
