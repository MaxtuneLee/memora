import assert from "node:assert/strict";
import test from "node:test";

import { createRemotePiRuntime } from "../dist/index.mjs";

const baseUrlFor = (baseUrl, apiFormat) =>
  createRemotePiRuntime({
    id: "remote",
    name: "Remote",
    baseUrl,
    apiFormat,
    selectedModelId: "m",
    models: [
      {
        id: "m",
        name: "m",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1000,
        maxTokens: 100,
      },
    ],
  }).model.baseUrl;

test("accepts a base URL with or without the API version", () => {
  for (const url of ["https://rightapi.ai", "https://rightapi.ai/v1/"]) {
    assert.equal(baseUrlFor(url, "chat-completions"), "https://rightapi.ai/v1");
    assert.equal(baseUrlFor(url, "responses"), "https://rightapi.ai/v1");
    assert.equal(baseUrlFor(url, "anthropic-messages"), "https://rightapi.ai");
  }
  assert.equal(
    baseUrlFor("https://generativelanguage.googleapis.com", "gemini"),
    "https://generativelanguage.googleapis.com/v1beta",
  );
  assert.equal(
    baseUrlFor("https://dashscope.aliyuncs.com/compatible-mode/v1", "chat-completions"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  );
});
