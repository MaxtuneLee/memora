import { describe, expect, it } from "vitest";
import type { Dataset, DatasetExample, MediaReference } from "@memora/datasets";

import { runEvaluation, type ModelAdapter } from "../src/index";

const audio = (example: number): MediaReference => ({
  type: "media",
  mediaType: "audio",
  field: "audio",
  shard: 0,
  example,
  samplingRate: 16_000,
});

function wav16(samples: number[]): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) =>
    Array.from(value).forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  write(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return new Uint8Array(buffer);
}

function dataset(examples: DatasetExample[]): Dataset {
  return {
    selection: {
      datasetId: "google/fleurs",
      revision: "abc123",
      configuration: "hi_in",
      split: "test",
    },
    features: { audio: { type: "audio", samplingRate: 16_000 }, transcription: { type: "string" } },
    length: examples.length,
    async *[Symbol.asyncIterator]() {
      yield* examples;
    },
    async *batches() {
      yield examples;
    },
    async readMedia(reference) {
      return { bytes: wav16([reference.example + 1]), mimeType: "audio/wav" };
    },
    close() {},
  };
}

const identity = {
  modelId: "fake-asr",
  modelRevision: { status: "unknown" as const },
  adapter: "fake",
  runtime: "test",
  inference: { language: "hi" },
};

describe("runEvaluation", () => {
  it("continues after an example error and aggregates only successful examples", async () => {
    let call = 0;
    const adapter: ModelAdapter = {
      identity,
      async initialize() {},
      async predict(input) {
        call += 1;
        if (call === 2) throw new Error("decoder unavailable");
        expect(input.sampleRate).toBe(16_000);
        return call === 1 ? "hello world" : "good night";
      },
    };

    const result = await runEvaluation({
      dataset: dataset([
        { id: 1, audio: audio(0), transcription: "hello world" },
        { id: 2, audio: audio(1), transcription: "ignored" },
        { id: 3, audio: audio(2), transcription: "good day" },
      ]),
      model: adapter,
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toMatchObject({ total: 3, succeeded: 2, failed: 1, canceled: false });
    expect(result.summary.wer).toMatchObject({ value: 0.25, edits: 1, referenceUnits: 4 });
    expect(result.examples[1]).toMatchObject({
      status: "failed",
      error: { message: "decoder unavailable" },
    });
    expect(result.modelInitializationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns a canceled partial result and does not start another example", async () => {
    const controller = new AbortController();
    let calls = 0;
    const adapter: ModelAdapter = {
      identity,
      async predict() {
        calls += 1;
        controller.abort();
        return "one";
      },
    };

    const result = await runEvaluation({
      dataset: dataset([
        { id: 1, audio: audio(0), transcription: "one" },
        { id: 2, audio: audio(1), transcription: "two" },
      ]),
      model: adapter,
      signal: controller.signal,
    });

    expect(calls).toBe(1);
    expect(result.status).toBe("canceled");
    expect(result.summary).toMatchObject({ total: 2, succeeded: 0, failed: 0, canceled: true });
  });
});
