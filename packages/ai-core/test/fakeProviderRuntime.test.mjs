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

test("steering messages enter the next model request in order, including after a final answer", async () => {
  const requests = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const agent = createAgent({
    config: { id: "steering", maxIterations: 3 },
    model: fakeModel,
    persistence: createInMemoryAdapter(),
    stream: (_model, context) => {
      requests.push(structuredClone(context));
      const call = requests.length;
      return (async function* () {
        if (call === 1) await gate;
        yield { type: "text_delta", delta: call === 1 ? "initial" : "revised" };
      })();
    },
  });
  await agent.init();
  const events = [];
  const running = (async () => {
    for await (const event of agent.run("start")) events.push(event);
  })();
  while (requests.length === 0) await new Promise((resolve) => setImmediate(resolve));
  for (const [id, text] of [
    ["s1", "add timestamps"],
    ["s2", "use Chinese"],
  ]) {
    assert.equal(
      agent.steer({ id, role: "user", content: [{ type: "text", text }], createdAt: 1 }),
      true,
    );
  }
  release();
  await running;
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests[1].messages
      .slice(-2)
      .map((message) =>
        typeof message.content === "string" ? message.content : message.content[0].text,
      ),
    ["add timestamps", "use Chinese"],
  );
  assert.equal(events.filter((event) => event.type === "done").length, 1);
  // The consumed steers are announced before the reply that answers them.
  const consumed = events.findIndex((event) => event.type === "steer-consumed");
  assert.deepEqual(events[consumed]?.messageIds, ["s1", "s2"]);
  assert.equal(
    events.findIndex((event) => event.type === "text-delta" && event.delta === "revised") >
      consumed,
    true,
  );
  assert.equal(agent.steer({ id: "late", role: "user", content: [], createdAt: 2 }), false);
});

test("abort preserves steering that has not reached a model call", async () => {
  const agent = createAgent({
    config: { id: "abort-steering" },
    model: fakeModel,
    persistence: createInMemoryAdapter(),
    stream: () =>
      (async function* () {
        yield { type: "text_delta", delta: "partial" };
      })(),
  });
  await agent.init();
  const iterator = agent.run("start");
  await iterator.next();
  agent.steer({
    id: "followup",
    role: "user",
    content: [{ type: "text", text: "keep this" }],
    createdAt: 1,
  });
  agent.abort();
  while (!(await iterator.next()).done) {}
  assert.deepEqual(
    agent.takeUnconsumedSteering().map((message) => message.id),
    ["followup"],
  );
});
