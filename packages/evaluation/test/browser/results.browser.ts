import { describe, expect, it } from "vitest";
import { file, write } from "@memora/fs";
import type { Dataset, DatasetExample, MediaReference } from "@memora/datasets";

import {
  listEvaluationResults,
  readEvaluationResult,
  runEvaluation,
  saveEvaluationResult,
  type ModelAdapter,
} from "../../src/index";
import { opfsResultStorage } from "../../src/storage";
import { sampleEvaluationResult } from "../fixtures";

// OPFS persists across test cases within this browser session (unlike the in-memory
// storage the unit tests use), so each fixture call needs its own runId.
const result = (overrides: Parameters<typeof sampleEvaluationResult>[0] = {}) =>
  sampleEvaluationResult({ runId: crypto.randomUUID(), ...overrides });

function wav16(samples: number[]): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write4 = (offset: number, value: string) =>
    Array.from(value).forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  write4(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write4(8, "WAVE");
  write4(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write4(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return new Uint8Array(buffer);
}

function fakeDataset(examples: DatasetExample[]): Dataset {
  return {
    selection: {
      datasetId: "google/fleurs",
      revision: "70bb2e84b976b7e960aa89f1c648e09c59f894dd",
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

const mediaReference = (example: number): MediaReference => ({
  type: "media",
  mediaType: "audio",
  field: "audio",
  shard: 0,
  example,
  samplingRate: 16_000,
});

describe("evaluation result persistence through real OPFS", () => {
  it("saves, lists and reopens a result as if the page had been refreshed", async () => {
    const saved = result();
    await saveEvaluationResult(saved);

    const summaries = await listEvaluationResults();
    expect(summaries.some((summary) => summary.runId === saved.runId)).toBe(true);

    // A fresh call with no in-memory reference to `saved`, standing in for the page
    // having reloaded and the user reopening a previously saved result.
    const reopened = await readEvaluationResult(saved.runId);
    expect(reopened).toEqual(saved);
  });

  it("keeps a canceled partial result distinguishable after reopening", async () => {
    const base = result();
    const saved = result({
      status: "canceled",
      examples: [],
      summary: { ...base.summary, succeeded: 0, canceled: true },
    });
    await saveEvaluationResult(saved);
    const reopened = await readEvaluationResult(saved.runId);
    expect(reopened.status).toBe("canceled");
    expect(reopened.summary.canceled).toBe(true);
  });

  it("reports a save failure explicitly instead of appearing saved", async () => {
    const failing = {
      write: () => Promise.reject(new DOMException("no space", "QuotaExceededError")),
      readText: (path: string) => opfsResultStorage.readText(path),
      list: (path: string) => opfsResultStorage.list(path),
      exists: (path: string) => opfsResultStorage.exists(path),
    };
    await expect(saveEvaluationResult(result(), { storage: failing })).rejects.toMatchObject({
      code: "save-failed",
    });
  });

  it("skips a corrupted result file without breaking the list, and reports it precisely on direct read", async () => {
    const good = result();
    await saveEvaluationResult(good);
    await write("/memora/evaluations/corrupted-run.json", "{ not valid json", { overwrite: true });

    const summaries = await listEvaluationResults();
    expect(summaries.some((summary) => summary.runId === good.runId)).toBe(true);
    expect(summaries.every((summary) => summary.runId !== "corrupted-run")).toBe(true);

    await expect(readEvaluationResult("corrupted-run")).rejects.toMatchObject({
      code: "invalid-result",
    });
  });

  it("reports a clear not-found error for a run that was never saved", async () => {
    await expect(readEvaluationResult("never-saved-run")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("writes exactly one JSON document per run, downloadable as-is", async () => {
    const saved = result();
    await saveEvaluationResult(saved);
    const raw = await file(`/memora/evaluations/${saved.runId}.json`).text();
    expect(JSON.parse(raw)).toEqual(saved);
  });

  it("persists and reopens a result produced by a real evaluation run, not a hand-built object", async () => {
    const examples: DatasetExample[] = [
      { id: 1, audio: mediaReference(0), transcription: "hello world" },
      { id: 2, audio: mediaReference(1), transcription: "good day" },
    ];
    const model: ModelAdapter = {
      identity: {
        modelId: "fake-asr",
        modelRevision: { status: "unknown" },
        adapter: "fake",
        runtime: "test",
        inference: { language: "hi" },
      },
      async initialize() {},
      async predict(input) {
        expect(input.sampleRate).toBe(16_000);
        return input.example.transcription as string;
      },
    };

    const produced = await runEvaluation({ dataset: fakeDataset(examples), model });
    expect(produced.status).toBe("completed");
    expect(produced.summary).toMatchObject({ total: 2, succeeded: 2, failed: 0 });

    await saveEvaluationResult(produced);
    const summaries = await listEvaluationResults();
    expect(summaries.some((summary) => summary.runId === produced.runId)).toBe(true);

    // Reopened with no in-memory reference to `produced`, standing in for a page refresh.
    const reopened = await readEvaluationResult(produced.runId);
    expect(reopened).toEqual(produced);
  });
});
