import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

import { createAgent, createInMemoryAdapter } from "../dist/index.js";

const createFakeProvider = (events, requests) => ({
  async *stream(request) {
    requests.push(request);
    for (const event of events) {
      yield event;
    }
  },
});

test("delegates model streaming to provider", async () => {
  const requests = [];
  const agent = createAgent({
    config: { id: "fake-agent", model: "fake-model", maxIterations: 1 },
    provider: createFakeProvider([{ type: "text-delta", delta: "hello" }], requests),
    persistence: createInMemoryAdapter(),
  });

  agent.addPromptSegment({ id: "system", priority: 1, content: "System prompt" });
  await agent.init();

  const events = [];
  for await (const event of agent.run("Hi")) {
    events.push(event);
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, "fake-model");
  assert.equal(requests[0].systemPrompt, "System prompt");
  assert.equal(requests[0].messages.at(-1)?.role, "user");
  assert.deepStrictEqual(events.at(-1)?.type, "done");
});

test("executes provider tool calls through runtime registry", async () => {
  const agent = createAgent({
    config: { id: "tool-agent", model: "fake-model", maxIterations: 2 },
    provider: createFakeProvider(
      [
        { type: "tool-call-start", toolCall: { id: "call-1", name: "echo" } },
        { type: "tool-call-args-delta", toolCallId: "call-1", delta: '{"text":"ok"}' },
        {
          type: "tool-call-complete",
          toolCall: { id: "call-1", name: "echo", arguments: { text: "ok" } },
        },
        { type: "text-delta", delta: "done" },
      ],
      [],
    ),
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
