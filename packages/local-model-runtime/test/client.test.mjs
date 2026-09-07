import assert from "node:assert/strict";
import test from "node:test";

import { createLocalModelClient } from "../dist/index.js";

test("ASR keeps buffer ownership by default and transfers only when requested", async () => {
  const calls = [];
  const client = createLocalModelClient({
    async *run(pool, input) {
      calls.push({ pool, input });
      yield { type: "status", status: "completed" };
    },
  });
  const audio = new Float32Array([0.25, -0.25]);

  for await (const _event of client.transcribeAudio({
    modelId: "whisper-base-timestamped",
    audio,
    language: "hi",
  })) {
    // Consume the request.
  }
  for await (const _event of client.transcribeAudio(
    { modelId: "whisper-base-timestamped", audio, language: "hi" },
    { priority: "background", transferAudio: true },
  )) {
    // Consume the request.
  }

  assert.equal(calls[0].input.transfer, undefined);
  assert.deepEqual(calls[1].input.transfer, [audio.buffer]);
  assert.equal(calls[1].input.priority, "background");
});
