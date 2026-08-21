import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

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
  contextWindow: 1024,
  maxTokens: 128,
};

const createFakeStream = (events, requests) => (model, context) => {
  requests.push({ model, context });
  return (async function* stream() {
    yield* events;
  })();
};

test("delegates model streaming to the Pi runtime", async () => {
  const requests = [];
  const agent = createAgent({
    config: { id: "fake-agent", maxIterations: 1 },
    model: fakeModel,
    stream: createFakeStream([{ type: "text_delta", delta: "hello" }], requests),
    persistence: createInMemoryAdapter(),
  });

  agent.addPromptSegment({ id: "system", priority: 1, content: "System prompt" });
  await agent.init();

  const events = [];
  for await (const event of agent.run("Hi")) {
    events.push(event);
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].model.id, "fake-model");
  assert.equal(requests[0].context.systemPrompt, "System prompt");
  assert.equal(requests[0].context.messages.at(-1)?.role, "user");
  assert.deepStrictEqual(events.at(-1)?.type, "done");
});

test("executes Pi tool calls through the runtime registry", async () => {
  let callCount = 0;
  const agent = createAgent({
    config: { id: "tool-agent", maxIterations: 2 },
    model: fakeModel,
    stream: () => {
      callCount += 1;
      if (callCount === 1) {
        return (async function* stream() {
          yield {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: { type: "toolCall", id: "call-1", name: "echo", arguments: { text: "ok" } },
            partial: { content: [] },
          };
        })();
      }
      return (async function* stream() {
        yield { type: "text_delta", delta: "done" };
      })();
    },
    persistence: createInMemoryAdapter(),
  });

  agent.registerTool({
    type: "function",
    name: "echo",
    description: "Echo text",
    parameters: v.object({ text: v.string() }),
    execute: ({ text }) => ({ text }),
  });
  await agent.init();

  const events = [];
  for await (const event of agent.run("call tool")) {
    events.push(event);
  }

  const toolResult = events.find((event) => event.type === "tool-result");
  assert.deepStrictEqual(toolResult?.result, { text: "ok" });
});
