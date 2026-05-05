import assert from "node:assert/strict";
import test from "node:test";

import * as v from "valibot";

import { providerRequestToLocalChatRequest } from "../dist/index.js";

const providerRequest = {
  model: "qwen3.5-0.8b-onnx-opt",
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
  temperature: 0.7,
  maxTokens: 128,
};

test("converts provider request to local chat request", () => {
  const local = providerRequestToLocalChatRequest(providerRequest);

  assert.equal(local.modelId, "qwen3.5-0.8b-onnx-opt");
  assert.equal(local.systemPrompt, "You are Memora.");
  assert.equal(local.temperature, 0.7);
  assert.equal(local.maxTokens, 128);
  assert.deepEqual(local.messages[0].content, [{ type: "text", text: "hello" }]);
});

test("adds missing JSON Schema type for enum tool parameters", () => {
  const local = providerRequestToLocalChatRequest({
    ...providerRequest,
    tools: [
      {
        type: "function",
        name: "modify_text_file",
        description: "Modify text",
        parameters: v.object({
          operation: v.picklist(["write", "append"]),
        }),
        execute: () => ({}),
      },
    ],
  });

  assert.deepEqual(local.tools[0], {
    name: "modify_text_file",
    description: "Modify text",
    parameters: {
      type: "object",
      properties: {
        operation: {
          enum: ["write", "append"],
          type: "string",
        },
      },
      required: ["operation"],
    },
  });
});
