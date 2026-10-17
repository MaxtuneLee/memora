import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRemotePiRuntime } from "../dist/index.mjs";
import { parseProviderModel } from "../../../web/src/lib/settings/dialogHelpers.ts";
import { findModelsDevMetadata } from "../../../web/src/lib/models/modelsDevCatalog.ts";

const snapshot = JSON.parse(
  await readFile(new URL("../../../web/models-dev.snapshot.json", import.meta.url), "utf8"),
);
const lookup = (id) => findModelsDevMetadata(snapshot, "https://api.openai.com/v1", id);
const discovered = parseProviderModel(
  { id: "gpt-6-luna", object: "model", created: 0, owned_by: "openai" },
  lookup,
);
assert.ok(discovered);

async function capture(apiFormat, options = {}) {
  let payload;
  const runtime = createRemotePiRuntime({
    id: "test-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "capture-only",
    apiFormat,
    models: [discovered],
    selectedModelId: discovered.id,
  });
  const result = await runtime
    .stream(
      runtime.model,
      {
        messages: [{ role: "user", content: "Look up one item", timestamp: 0 }],
        tools: [
          {
            name: "lookup",
            description: "Look up one item",
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
      },
      {
        ...options,
        fetch: () => {
          throw new Error("Network must never be reached");
        },
        onPayload: (value) => {
          payload = value;
          throw new Error("capture-complete");
        },
      },
    )
    .result();
  assert.ok(payload, result.errorMessage);
  assert.match(result.errorMessage, /capture-complete/);
  return payload;
}

await test("Luna Chat Completions uses catalog limits and explicitly disables reasoning with functions", async () => {
  assert.equal(discovered.contextWindow, 1_050_000);
  assert.equal(discovered.maxTokens, 128_000);
  const payload = await capture("chat-completions");
  assert.equal(payload.reasoning_effort, "none");
  assert.equal(payload.max_completion_tokens, 128_000);
  assert.equal(payload.tools.length, 1);
  assert.equal(payload.max_tokens, undefined);
});

await test("Luna Responses preserves explicit reasoning alongside functions", async () => {
  const payload = await capture("responses", { reasoning: "high" });
  assert.equal(payload.reasoning.effort, "high");
  assert.equal(payload.max_output_tokens, 128_000);
  assert.equal(payload.tools.length, 1);
});
