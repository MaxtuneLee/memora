import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

import { COMPACTION_PARAMETERS, createAgent, createInMemoryAdapter } from "../dist/index.js";

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

const user = (id, text = "question") => ({
  id,
  role: "user",
  content: [{ type: "text", text }],
  createdAt: 1,
});
const assistant = (id, text) => ({
  id,
  role: "assistant",
  content: [{ type: "text", text }],
  createdAt: 1,
});

const answer = (text = "hello") =>
  (async function* stream() {
    yield { type: "text_delta", delta: text };
  })();

const drain = async (agent, input) => {
  const events = [];
  for await (const event of agent.run(input)) events.push(event);
  return events;
};

const ofType = (records, type) => records.filter((record) => record.type === type);

/** A search tool whose result is 500 characters, stored under a 100-character cap. */
const toolAgent = (trace) => {
  let call = 0;
  const agent = createAgent({
    config: { id: "trace-tool", maxIterations: 2, maxToolResultChars: 100 },
    model: fakeModel,
    stream: () => {
      call += 1;
      if (call === 1)
        return (async function* stream() {
          yield {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: { type: "toolCall", id: "call-1", name: "search", arguments: { q: "x" } },
            partial: { content: [] },
          };
        })();
      return answer("done");
    },
    persistence: createInMemoryAdapter(),
    trace,
  });
  agent.addPromptSegment({ id: "system", priority: 1, content: "System prompt" });
  agent.registerTool({
    type: "function",
    name: "search",
    description: "Search",
    parameters: v.object({ q: v.string() }),
    execute: () => "r".repeat(500),
  });
  return agent;
};

test("records each message once and requests by ID, with prompt and tools only when changed", async () => {
  const records = [];
  const agent = toolAgent((record) => records.push(structuredClone(record)));
  await agent.init();
  await drain(agent, "find it");

  const added = ofType(records, "message.added").map((record) => record.message.id);
  assert.equal(new Set(added).size, added.length);
  assert.deepEqual(
    added,
    agent.context.getMessages().map((message) => message.id),
  );

  const requests = ofType(records, "model.request");
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.purpose, "reply");
    assert.deepEqual(request.model, {
      api: "memora-test",
      provider: "memora-test",
      id: "fake-model",
    });
    // Every message a request lists was recorded before it.
    const before = records.slice(0, records.indexOf(request));
    const known = new Set(ofType(before, "message.added").map((record) => record.message.id));
    assert.ok(request.messageIds.every((id) => known.has(id)));
  }
  assert.equal(requests[0].systemPrompt, "System prompt");
  assert.deepEqual(
    requests[0].tools.map((tool) => tool.name),
    ["search"],
  );
  assert.equal("systemPrompt" in requests[1], false);
  assert.equal("tools" in requests[1], false);
  assert.equal(requests[1].turn, 2);

  const responses = ofType(records, "model.response");
  assert.equal(responses[0].toolCalls[0].id, "call-1");
  assert.equal(responses[1].text, "done");
});

test("tool records carry the raw length and the stored result", async () => {
  const records = [];
  const agent = toolAgent((record) => records.push(structuredClone(record)));
  await agent.init();
  await drain(agent, "find it");

  const [started] = ofType(records, "tool.started");
  assert.deepEqual(
    { id: started.toolCallId, name: started.name, arguments: started.arguments },
    { id: "call-1", name: "search", arguments: { q: "x" } },
  );
  const [settled] = ofType(records, "tool.settled");
  assert.equal(settled.rawLength, 500);
  assert.ok(settled.result.startsWith("r".repeat(100)));
  assert.ok(settled.result.includes("[Truncated: showing 100 of 500 characters]"));
  assert.equal(settled.isError, false);
  const stored = agent.context.getMessages().find((message) => message.role === "tool");
  assert.equal(settled.result, stored.content[0].result);
});

test("records fallback trimming and leaves the dropped messages out of the request", async () => {
  const records = [];
  const agent = createAgent({
    config: { id: "trace-trim", maxIterations: 1 },
    model: fakeModel,
    stream: () => answer(),
    persistence: createInMemoryAdapter(),
    trace: (record) => records.push(structuredClone(record)),
  });
  await agent.init();
  await agent.replaceHistory([user("u1"), assistant("a2", "y".repeat(120_000)), user("u3")]);
  await drain(agent, user("u4"));

  const [trimmed] = ofType(records, "context.trimmed");
  assert.equal(trimmed.purpose, "reply");
  assert.deepEqual(trimmed.droppedMessageIds, ["a2"]);
  assert.ok(trimmed.tokensAfter < trimmed.tokensBefore);
  assert.equal(trimmed.contextWindow, 32768);
  const [request] = ofType(records, "model.request");
  assert.ok(records.indexOf(trimmed) < records.indexOf(request));
  assert.deepEqual(request.messageIds, ["u1", "u3", "u4"]);
  assert.equal(request.compaction, undefined);
});

test("records a microcompact with its rendering parameters before the request it shapes", async () => {
  const records = [];
  const agent = createAgent({
    config: { id: "trace-compact", maxIterations: 1, compaction: true },
    model: fakeModel,
    stream: () => answer(),
    persistence: createInMemoryAdapter(),
    trace: (record) => records.push(structuredClone(record)),
  });
  await agent.init();
  const history = [];
  for (let turn = 1; turn <= 6; turn++)
    history.push(user(`u${turn}`), assistant(`a${turn}`, "y".repeat(20_000)));
  await agent.replaceHistory(history);
  await drain(agent, user("u7", "next"));

  const [compacted] = ofType(records, "context.compacted");
  assert.equal(compacted.layer, "microcompact");
  assert.equal(compacted.trigger, "watermark");
  assert.deepEqual(compacted.before, {});
  assert.equal(compacted.after.compactedThrough, "a4");
  assert.ok(compacted.tokensAfter < compacted.tokensBefore);
  assert.deepEqual(compacted.parameters, COMPACTION_PARAMETERS);

  const [request] = ofType(records, "model.request");
  assert.ok(records.indexOf(compacted) < records.indexOf(request));
  assert.deepEqual(request.compaction, compacted.after);
  assert.deepEqual(request.parameters, COMPACTION_PARAMETERS);
  assert.deepEqual(request.messageIds, [
    ...history.map((message) => message.id),
    request.messageIds.at(-1),
  ]);
});

// User text is never shortened, so only a summary can bring this history under the watermark.
const summaryAgent = (compactionStream, records) =>
  createAgent({
    config: { id: "trace-summary", maxIterations: 1, compaction: true },
    model: fakeModel,
    stream: () => answer(),
    compactionModel: { model: { ...fakeModel, id: "summary-model" }, stream: compactionStream },
    persistence: createInMemoryAdapter(),
    trace: (record) => records.push(structuredClone(record)),
  });
const longUserHistory = () => {
  const history = [];
  for (let turn = 1; turn <= 6; turn++)
    history.push(user(`u${turn}`, "q".repeat(20_000)), assistant(`a${turn}`, "short answer"));
  return history;
};

test("records a summary as its own model call and the compaction it produced", async () => {
  const records = [];
  const agent = summaryAgent(() => answer("## Checkpoint"), records);
  await agent.init();
  await agent.replaceHistory(longUserHistory());
  await drain(agent, "next");

  const requests = ofType(records, "model.request");
  assert.deepEqual(
    requests.map((request) => request.purpose),
    ["summary", "reply"],
  );
  assert.equal(requests[0].model.id, "summary-model");
  assert.ok(requests[0].instruction.includes("compaction engine"));
  assert.equal(requests[0].messageIds.at(-1), "compaction-instruction");
  const [response] = ofType(records, "model.response");
  assert.equal(response.purpose, "summary");
  assert.equal(response.text, "## Checkpoint");

  const summary = ofType(records, "context.compacted").find((record) => record.layer === "summary");
  assert.deepEqual(summary.summary, { outcome: "succeeded" });
  assert.equal(summary.after.summary.text, "## Checkpoint");
  assert.deepEqual(summary.parameters, COMPACTION_PARAMETERS);
  assert.ok(records.indexOf(response) < records.indexOf(summary));
  assert.equal(requests[1].messageIds[0], "summary:a4");
  assert.deepEqual(requests[1].compaction, summary.after);
});

test("records a failed summary with the running failure count", async () => {
  const records = [];
  const agent = summaryAgent(
    () =>
      (async function* stream() {
        yield { type: "error", reason: "error", error: { errorMessage: "down" } };
      })(),
    records,
  );
  await agent.init();
  await agent.replaceHistory(longUserHistory());
  await drain(agent, "next");
  await drain(agent, "again");

  const failures = ofType(records, "context.compacted").filter(
    (record) => record.layer === "summary",
  );
  assert.deepEqual(
    failures.map((record) => record.summary),
    [
      { outcome: "failed", error: "down", failures: 1 },
      { outcome: "failed", error: "down", failures: 2 },
    ],
  );
  assert.deepEqual(failures[0].parameters, COMPACTION_PARAMETERS);
  const summaryResponses = ofType(records, "model.response").filter(
    (record) => record.purpose === "summary",
  );
  assert.deepEqual(
    summaryResponses.map((record) => record.error),
    ["down", "down"],
  );
});

test("records the cold layer with the recap text it appended, but not the recap's generation", async () => {
  const records = [];
  const agent = summaryAgent(() => answer("You were comparing river valleys."), records);
  await agent.init();
  const history = [];
  for (let turn = 1; turn <= 4; turn++)
    history.push(user(`u${turn}`), assistant(`a${turn}`, "y".repeat(10_000)));
  await agent.replaceHistory(history);
  await agent.generateRecap();
  assert.deepEqual(records, []);

  await drain(agent, { ...user("u5", "back"), createdAt: 1 + 6 * 60_000 });
  const [cold] = ofType(records, "context.compacted");
  assert.equal(cold.layer, "cold");
  assert.equal(cold.trigger, "cache-expired");
  assert.deepEqual(cold.recap, { id: "recap:u5", text: "You were comparing river valleys." });
  assert.deepEqual(cold.parameters, COMPACTION_PARAMETERS);
  const [request] = ofType(records, "model.request");
  assert.equal(request.messageIds.at(-2), "recap:u5");
});

test("a steer's input.applied lands in the turn that consumed it", async () => {
  const records = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const agent = createAgent({
    config: { id: "trace-steer", maxIterations: 3 },
    model: fakeModel,
    persistence: createInMemoryAdapter(),
    stream: () => {
      calls += 1;
      const call = calls;
      return (async function* () {
        if (call === 1) await gate;
        yield { type: "text_delta", delta: call === 1 ? "initial" : "revised" };
      })();
    },
    trace: (record) => records.push(structuredClone(record)),
  });
  await agent.init();
  const running = drain(agent, "start");
  while (calls === 0) await new Promise((resolve) => setImmediate(resolve));
  agent.steer(user("s1", "add timestamps"));
  release();
  await running;

  const [applied] = ofType(records, "input.applied");
  assert.deepEqual(
    { messageId: applied.messageId, turn: applied.turn },
    { messageId: "s1", turn: 2 },
  );
  const request = ofType(records, "model.request").find((record) => record.turn === 2);
  assert.ok(records.indexOf(applied) < records.indexOf(request));
  assert.equal(request.messageIds.at(-1), "s1");
});

const withoutIds = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "id" || key === "createdAt" || key === "timestamp" ? undefined : item,
    ),
  );

test("a throwing callback leaves events and history unchanged and reports the gap", async () => {
  const plain = toolAgent();
  await plain.init();
  const plainEvents = await drain(plain, "find it");

  const throwing = toolAgent(() => {
    throw new Error("disk full");
  });
  await throwing.init();
  const throwingEvents = await drain(throwing, "find it");

  assert.deepEqual(withoutIds(throwingEvents), withoutIds(plainEvents));
  assert.deepEqual(
    withoutIds(throwing.context.getMessages()),
    withoutIds(plain.context.getMessages()),
  );

  const records = [];
  let failures = 2;
  const flaky = toolAgent((record) => {
    if (failures-- > 0) throw new Error("disk full");
    records.push(record);
  });
  await flaky.init();
  await drain(flaky, "find it");
  assert.deepEqual(
    { type: records[0].type, dropped: records[0].dropped, reason: records[0].reason },
    { type: "trace.gap", dropped: 2, reason: "disk full" },
  );
});
