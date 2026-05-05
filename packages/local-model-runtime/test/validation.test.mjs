import assert from "node:assert/strict";
import test from "node:test";

import {
  builtInLocalModelManifests,
  getLocalModelManifest,
  validateLocalChatRequest,
} from "../dist/index.js";

const qwenRequest = {
  modelId: "qwen3.5-0.8b-onnx-opt",
  systemPrompt: "You are Memora.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    },
  ],
  tools: [],
};

test("exports initial manifests", () => {
  assert.deepEqual(
    builtInLocalModelManifests.map((manifest) => manifest.id),
    ["whisper-base-timestamped", "qwen3.5-0.8b-onnx-opt", "gemma-4-e2b-it-onnx"],
  );
});

test("looks up a manifest by id", () => {
  const manifest = getLocalModelManifest("qwen3.5-0.8b-onnx-opt");
  assert.equal(manifest?.modelId, "onnx-community/Qwen3.5-0.8B-ONNX-OPT");
});

test("validates supported chat content", () => {
  const result = validateLocalChatRequest(qwenRequest);
  assert.equal(result.ok, true);
});

test("rejects unsupported modality before generation", () => {
  const result = validateLocalChatRequest({
    ...qwenRequest,
    messages: [
      {
        role: "user",
        content: [{ type: "audio", mimeType: "audio/wav", data: "abc" }],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported-modality");
});

test("rejects unsupported reasoning mode", () => {
  const result = validateLocalChatRequest({
    ...qwenRequest,
    reasoningMode: "invalid-mode",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unsupported-reasoning");
});
