import assert from "node:assert/strict";
import test from "node:test";

import { createChatCompletionsPayload, createResponsesPayload } from "../dist/index.js";

const createRequest = () => ({
  model: "gpt-5-mini",
  systemPrompt: "You are Memora.",
  messages: [
    {
      id: "user-1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
      createdAt: 1,
    },
  ],
  tools: [],
});

test("includes reasoning effort in chat completions payload", () => {
  const payload = createChatCompletionsPayload(createRequest());

  assert.deepStrictEqual(payload.reasoning, {
    effort: "none",
  });
});

test("includes reasoning effort in responses payload", () => {
  const payload = createResponsesPayload(createRequest());

  assert.deepStrictEqual(payload.reasoning, {
    effort: "none",
  });
});
