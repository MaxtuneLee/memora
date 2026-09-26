import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

import { createAgent, createInMemoryAdapter, rebaseCompaction } from "../dist/index.js";

const fakeModel = {
  id: "fake-model",
  name: "Fake Model",
  api: "memora-test",
  provider: "memora-test",
  baseUrl: "memora://test",
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
};

const user = (id, text = "question") => ({
  id,
  role: "user",
  content: [{ type: "text", text }],
  createdAt: 1,
});
const assistant = (id, text, extra = {}) => ({
  id,
  role: "assistant",
  content: [{ type: "text", text }],
  createdAt: 1,
  ...extra,
});
const image = (data) => ({ type: "image", mimeType: "image/png", data });

const textOf = (message) =>
  typeof message.content === "string"
    ? message.content
    : message.content.map((block) => block.text ?? block.thinking ?? "").join("");

const answer = () =>
  (async function* stream() {
    yield { type: "text_delta", delta: "hello" };
  })();

test("compacts older turns once and keeps the request prefix stable afterwards", async () => {
  const requests = [];
  const persistence = createInMemoryAdapter();
  const agent = createAgent({
    config: { id: "compact", maxIterations: 1, compaction: true },
    model: fakeModel,
    stream: (_model, context) => {
      requests.push(context);
      return answer();
    },
    persistence,
  });
  await agent.init();
  const history = [];
  for (let turn = 1; turn <= 6; turn++) {
    history.push({
      ...user(`u${turn}`),
      content: [{ type: "text", text: "question" }, ...(turn <= 2 ? [image(`img${turn}`)] : [])],
    });
    history.push(assistant(`a${turn}`, "y".repeat(20_000), { reasoning: "earlier thought" }));
  }
  await agent.replaceHistory(history);

  for await (const _event of agent.run("next one")) {
    // drain
  }
  for await (const _event of agent.run("next two")) {
    // drain
  }

  assert.equal(requests.length, 2);
  const [first, second] = requests;
  const assistantTexts = first.messages.filter((m) => m.role === "assistant").map(textOf);
  // Turns 1–4 are compacted; turns 5 and 6 are inside the three protected user turns.
  for (const [index, text] of assistantTexts.slice(0, 4).entries()) {
    assert.ok(text.includes(`recall ID: a${index + 1}`), `turn ${index + 1} not compacted`);
    assert.ok(text.length < 2_000);
  }
  assert.equal(assistantTexts[4], "y".repeat(20_000));
  assert.equal(assistantTexts[5], "y".repeat(20_000));
  // Completed turns lose their replayed reasoning.
  assert.ok(first.messages.every((m) => !m.content?.some?.((block) => block.type === "thinking")));
  // The newest image is kept; the older one becomes a recallable placeholder.
  const userMessages = first.messages.filter((m) => m.role === "user");
  assert.ok(textOf(userMessages[0]).includes("image/png image omitted, recall ID: u1"));
  assert.ok(userMessages[1].content.some((block) => block.type === "image"));

  // The next turn stays under the watermark, so it only appends to the same prefix.
  assert.deepStrictEqual(second.messages.slice(0, first.messages.length), first.messages);
  assert.ok(await persistence.load("compact", "compaction"));
});

test("does not compact in the middle of a tool round", async () => {
  const requests = [];
  const agent = createAgent({
    config: { id: "mid-round", maxIterations: 1, compaction: true },
    model: fakeModel,
    stream: (_model, context) => {
      requests.push(context);
      return answer();
    },
    persistence: createInMemoryAdapter(),
  });
  await agent.init();
  const history = [];
  for (let turn = 1; turn <= 6; turn++)
    history.push(user(`u${turn}`), assistant(`a${turn}`, "y".repeat(20_000)));
  history.push(
    {
      id: "call",
      role: "assistant",
      content: [{ type: "tool_call", id: "t1", name: "search", arguments: {} }],
      createdAt: 1,
    },
    {
      id: "result",
      role: "tool",
      content: [{ type: "tool_result", id: "t1", name: "search", result: "found" }],
      createdAt: 1,
    },
  );
  await agent.replaceHistory(history);
  // A user message right after tool results joins the open tool round.
  for await (const _event of agent.run(user("u7"))) {
    // drain
  }
  assert.ok(requests.length >= 1);
  assert.equal(agent.context.getCompaction().compactedThrough, undefined);
});

test("shortens a large tool result on first send and recalls the original", async () => {
  const requests = [];
  const original = `${"z".repeat(20_000)}END`;
  let call = 0;
  const agent = createAgent({
    config: { id: "recall", maxIterations: 3, compaction: true },
    model: fakeModel,
    stream: (_model, context) => {
      requests.push(context);
      call += 1;
      const toolCall =
        call === 1
          ? { type: "toolCall", id: "call-1", name: "search", arguments: {} }
          : call === 2
            ? {
                type: "toolCall",
                id: "call-2",
                name: "recall_message",
                arguments: { id: "call-1" },
              }
            : undefined;
      return (async function* stream() {
        if (toolCall) {
          yield { type: "toolcall_end", contentIndex: 0, toolCall, partial: { content: [] } };
          return;
        }
        yield { type: "text_delta", delta: "done" };
      })();
    },
    persistence: createInMemoryAdapter(),
  });
  agent.registerTool({
    type: "function",
    name: "search",
    description: "Search",
    parameters: v.object({}),
    execute: () => original,
  });
  await agent.init();
  for await (const _event of agent.run("find it")) {
    // drain
  }

  assert.ok(requests[0].tools.some((tool) => tool.name === "recall_message"));
  const sent = requests[1].messages.at(-1);
  assert.equal(sent.role, "toolResult");
  assert.ok(textOf(sent).includes("recall ID: call-1"));
  assert.ok(textOf(sent).endsWith("END"));
  assert.ok(textOf(sent).length < 8_000);

  const recalled = textOf(requests[2].messages.at(-1));
  assert.ok(recalled.startsWith("z".repeat(7_000)));
  assert.ok(recalled.includes("Showing characters 0–7000 of 20003"));
  // The stored history keeps the original for later recalls.
  const stored = agent.context.getMessages().find((m) => m.role === "tool");
  assert.equal(stored.content[0].result, original);
});

test("rebases compaction IDs after the history is cut", () => {
  const messages = [user("u1"), assistant("a1", "x"), user("u2")];
  assert.deepStrictEqual(
    rebaseCompaction({ compactedThrough: "a1", strippedThrough: "a9" }, messages),
    { compactedThrough: "a1", strippedThrough: "u2" },
  );
  assert.deepStrictEqual(rebaseCompaction({ compactedThrough: "a9" }, []), {});
  assert.deepStrictEqual(rebaseCompaction(null, messages), {});
});
