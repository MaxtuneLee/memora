import assert from "node:assert/strict";
import test from "node:test";

import { localChatEventToProviderEvent } from "../dist/index.js";

test("maps local text events to provider events", () => {
  assert.deepEqual(localChatEventToProviderEvent({ type: "text-delta", delta: "hi" }), {
    type: "text-delta",
    delta: "hi",
  });
});

test("maps local tool events to provider events", () => {
  assert.deepEqual(
    localChatEventToProviderEvent({
      type: "tool-call-complete",
      toolCall: { id: "call_1", name: "search", arguments: { query: "memora" } },
    }),
    {
      type: "tool-call-complete",
      toolCall: { id: "call_1", name: "search", arguments: { query: "memora" } },
    },
  );
});

test("maps local errors to provider error events", () => {
  const event = localChatEventToProviderEvent({
    type: "error",
    error: { code: "unsupported-modality", message: "Images are not supported." },
  });

  assert.equal(event.type, "error");
  assert.equal(event.error.message, "Images are not supported.");
});
