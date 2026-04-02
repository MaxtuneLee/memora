import assert from "node:assert/strict";
import test from "node:test";

import { createAgent, createInMemoryAdapter } from "../dist/index.js";

const createStreamResponse = () => {
  return new Response(
    [
      'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ].join(""),
    {
      headers: { "Content-Type": "text/event-stream" },
    },
  );
};

const createResponsesStreamResponse = () => {
  return new Response(
    [
      'event: response.output_text.delta\ndata: {"delta":"ok"}\n\n',
      'event: response.completed\ndata: {}\n\n',
    ].join(""),
    {
      headers: { "Content-Type": "text/event-stream" },
    },
  );
};

test("includes reasoning effort in chat completions payload", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return createStreamResponse();
  };

  try {
    const agent = createAgent({
      config: {
        id: "chat-test",
        model: "gpt-5-mini",
        endpoint: "https://example.com/v1/chat/completions",
      },
      persistence: createInMemoryAdapter(),
    });

    await agent.init();

    for await (const _event of agent.run("hello")) {
      // Drain the stream so the request fully completes.
    }

    assert.deepStrictEqual(capturedBody?.reasoning, {
      effort: "none",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("includes reasoning effort in responses payload", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;

  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return createResponsesStreamResponse();
  };

  try {
    const agent = createAgent({
      config: {
        id: "responses-test",
        model: "gpt-5-mini",
        endpoint: "https://example.com/v1/responses",
        apiFormat: "responses",
      },
      persistence: createInMemoryAdapter(),
    });

    await agent.init();

    for await (const _event of agent.run("hello")) {
      // Drain the stream so the request fully completes.
    }

    assert.deepStrictEqual(capturedBody?.reasoning, {
      effort: "none",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
