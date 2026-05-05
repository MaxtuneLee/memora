import assert from "node:assert/strict";
import test from "node:test";

import { createLocalProvider } from "../dist/index.js";

const providerRequest = {
  model: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "You are Memora.",
  messages: [
    {
      id: "user-1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
      createdAt: 1,
    },
  ],
  tools: [],
};

test("logs local chat request details when debug is enabled", async () => {
  const logEntries = [];
  const client = {
    async *streamChat() {
      yield { type: "status", status: "completed" };
    },
  };
  const provider = createLocalProvider({
    client,
    debug: true,
    logger: {
      info: (...args) => {
        logEntries.push(args);
      },
    },
    reasoningMode: "thinking",
  });

  for await (const _event of provider.stream(providerRequest)) {
    void _event;
  }

  assert.equal(logEntries.length, 1);
  assert.equal(logEntries[0][0], "[local-model] chat request");
  assert.deepEqual(logEntries[0][1], {
    modelId: "qwen3.5-0.8b-onnx-opt",
    reasoningMode: "thinking",
    messageCount: 1,
    toolCount: 0,
    hasSystemPrompt: true,
    temperature: undefined,
    maxTokens: undefined,
  });
});
