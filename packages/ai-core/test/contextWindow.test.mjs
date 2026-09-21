import assert from "node:assert/strict";
import test from "node:test";
import { clampMaxTokensToContext } from "@earendil-works/pi-ai/api/simple-options";

import { createAgent, createInMemoryAdapter } from "../dist/index.js";

const fakeModel = {
  id: "fake-model",
  name: "Fake Model",
  api: "memora-test",
  provider: "memora-test",
  baseUrl: "memora://test",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
};

const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

// The usage a real turn reported right before the response ceiling collapsed to 1 token.
const exhaustedUsage = {
  input: 2920,
  output: 3653,
  cacheRead: 22272,
  cacheWrite: 0,
  totalTokens: 28845,
  cost: zeroCost,
};

const assistantTurn = (id, usage) => ({
  id,
  role: "assistant",
  content: [{ type: "text", text: "y".repeat(2000) }],
  createdAt: Number(id.slice(1)),
  providerMessage: {
    role: "assistant",
    content: [{ type: "text", text: "y".repeat(2000) }],
    api: "memora-test",
    provider: "memora-test",
    model: "fake-model",
    usage,
    stopReason: "stop",
    timestamp: Number(id.slice(1)),
  },
});

const userTurn = (id) => ({
  id,
  role: "user",
  content: [{ type: "text", text: "x".repeat(2000) }],
  createdAt: Number(id.slice(1)),
});

test("leaves room for a reply once a turn reports a context-filling usage", async () => {
  const requests = [];
  const agent = createAgent({
    config: { id: "fake-agent", maxIterations: 1 },
    model: fakeModel,
    stream: (model, context) => {
      requests.push(context);
      return (async function* stream() {
        yield { type: "text_delta", delta: "hello" };
      })();
    },
    persistence: createInMemoryAdapter(),
  });

  await agent.init();
  await agent.replaceHistory([
    userTurn("u1"),
    assistantTurn("a2", { ...zeroCost, ...exhaustedUsage }),
    userTurn("u3"),
    assistantTurn("a4", exhaustedUsage),
  ]);

  for await (const _event of agent.run("Hi")) {
    // drain
  }

  assert.equal(requests.length, 1);
  const ceiling = clampMaxTokensToContext(fakeModel, requests[0], fakeModel.maxTokens);
  assert.ok(ceiling >= 512, `response ceiling collapsed to ${ceiling} tokens`);
});
