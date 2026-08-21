import assert from "node:assert/strict";
import test from "node:test";

import { createLocalPiRuntime } from "../dist/index.mjs";

const manifest = {
  id: "local-test",
  displayName: "Local Test",
  family: "test",
  task: "chat",
  modelId: "local-test",
  runtime: "transformers-js",
  device: "webgpu",
  pool: "chat",
  modalities: { input: ["text"], output: ["text"] },
  limits: { contextWindow: 1024, maxOutputTokens: 64 },
  chat: {
    adapter: "test",
    supportsSystemPrompt: true,
    supportsStreaming: true,
    supportsReasoning: false,
    reasoningModes: ["non-thinking"],
    defaultReasoningMode: "non-thinking",
    supportsTools: false,
    toolCalling: { mode: "native", streamingArgs: false, requiresToolResultTemplate: false },
  },
};

test("exposes a local worker as a Pi model runtime", async () => {
  const requests = [];
  const runtime = createLocalPiRuntime({
    manifest,
    client: {
      async *streamChat(request) {
        requests.push(request);
        yield { type: "text-delta", delta: "hello" };
      },
    },
  });

  const stream = await runtime.stream(
    runtime.model,
    {
      systemPrompt: "Be concise.",
      messages: [{ role: "user", content: "Hi", timestamp: 1 }],
    },
  );
  const events = [];
  for await (const event of stream) events.push(event);

  assert.equal(requests[0].modelId, "local-test");
  assert.equal(requests[0].systemPrompt, "Be concise.");
  assert.equal(events.find((event) => event.type === "text_delta")?.delta, "hello");
  assert.equal(events.at(-1)?.type, "done");
});
