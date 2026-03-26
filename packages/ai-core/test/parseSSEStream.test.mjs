import assert from "node:assert/strict";
import test from "node:test";

import { parseSSEStream } from "../dist/index.js";

const createDataFrame = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

const createDoneFrame = () => "data: [DONE]\n\n";

const createResponse = (...frames) => {
  return new Response(frames.join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
};

const collectEvents = async (...frames) => {
  const events = [];

  for await (const event of parseSSEStream(createResponse(...frames))) {
    events.push(event);
  }

  return events;
};

test("parses reasoning_content before streamed content", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { reasoning_content: "先想" }, finish_reason: null }],
    }),
    createDataFrame({
      choices: [{ index: 0, delta: { content: "再答" }, finish_reason: null }],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "先想" },
    { type: "reasoning-done", text: "先想" },
    { type: "text-delta", delta: "再答" },
  ]);
});

test("parses OpenRouter reasoning and flushes it on DONE", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { reasoning: "现在" }, finish_reason: null }],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "现在" },
    { type: "reasoning-done", text: "现在" },
  ]);
});

test("parses reasoning_details when no direct reasoning field exists", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [
        {
          index: 0,
          delta: {
            reasoning_details: [
              { type: "reasoning.text", text: "我有" },
              { type: "reasoning.text", text: "7个文件" },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "我有7个文件" },
    { type: "reasoning-done", text: "我有7个文件" },
  ]);
});

test("prefers reasoning over reasoning_details without duplicating text", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [
        {
          index: 0,
          delta: {
            reasoning: "主通道",
            reasoning_details: [{ type: "reasoning.text", text: "备用通道" }],
          },
          finish_reason: null,
        },
      ],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "主通道" },
    { type: "reasoning-done", text: "主通道" },
  ]);
});

test("flushes reasoning before tool calls", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { reasoning: "先分析" }, finish_reason: null }],
    }),
    createDataFrame({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: {
                  name: "search_docs",
                  arguments: '{"query":"memora"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "先分析" },
    { type: "reasoning-done", text: "先分析" },
    { type: "tool-call-start", toolCall: { id: "call_1", name: "search_docs" } },
    {
      type: "tool-call-complete",
      toolCall: {
        id: "call_1",
        name: "search_docs",
        arguments: { query: "memora" },
      },
    },
  ]);
});

test("flushes reasoning when the stream ends without DONE", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { reasoning: "自然结束" }, finish_reason: null }],
    }),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "自然结束" },
    { type: "reasoning-done", text: "自然结束" },
  ]);
});

test("flushes reasoning when finish_reason arrives before DONE", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { reasoning: "到此为止" }, finish_reason: "stop" }],
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "reasoning-delta", delta: "到此为止" },
    { type: "reasoning-done", text: "到此为止" },
  ]);
});

test("emits usage from a usage-only tail chunk", async () => {
  const events = await collectEvents(
    createDataFrame({
      choices: [{ index: 0, delta: { content: "答案" }, finish_reason: null }],
    }),
    createDataFrame({
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        total_tokens: 5,
      },
    }),
    createDoneFrame(),
  );

  assert.deepStrictEqual(events, [
    { type: "text-delta", delta: "答案" },
    {
      type: "usage",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    },
  ]);
});
