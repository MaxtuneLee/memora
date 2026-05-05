import assert from "node:assert/strict";
import test from "node:test";

import { createLocalModelTaskQueue } from "../dist/index.js";

const createTask = (requestId, priority) => ({
  requestId,
  priority,
  task: {
    kind: "chat.generate",
    input: {
      modelId: "qwen3.5-0.8b-onnx-opt",
      systemPrompt: "",
      messages: [],
      tools: [],
    },
  },
});

test("dequeues interactive work before background work", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("background-1", "background"));
  queue.enqueue(createTask("interactive-1", "interactive"));

  assert.equal(queue.dequeue()?.requestId, "interactive-1");
  assert.equal(queue.dequeue()?.requestId, "background-1");
});

test("preserves insertion order within one priority", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("interactive-1", "interactive"));
  queue.enqueue(createTask("interactive-2", "interactive"));

  assert.equal(queue.dequeue()?.requestId, "interactive-1");
  assert.equal(queue.dequeue()?.requestId, "interactive-2");
});

test("removes queued task by request id", () => {
  const queue = createLocalModelTaskQueue();
  queue.enqueue(createTask("a", "background"));
  queue.enqueue(createTask("b", "background"));

  assert.equal(queue.remove("a"), true);
  assert.equal(queue.dequeue()?.requestId, "b");
  assert.equal(queue.remove("missing"), false);
});
