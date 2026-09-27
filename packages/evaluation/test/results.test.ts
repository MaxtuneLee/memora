import { describe, expect, it } from "vitest";

import { EvaluationError } from "../src/errors";
import { listEvaluationResults, readEvaluationResult, saveEvaluationResult } from "../src/results";
import { MemoryResultStorage, sampleEvaluationResult as result } from "./fixtures";

describe("evaluation result persistence", () => {
  it("saves and reads back a completed result unchanged", async () => {
    const storage = new MemoryResultStorage();
    const saved = result();
    await saveEvaluationResult(saved, { storage });

    const read = await readEvaluationResult(saved.runId, { storage });
    expect(read).toEqual(saved);
  });

  it("saves and reads a canceled partial result", async () => {
    const storage = new MemoryResultStorage();
    const saved = result({ status: "canceled", examples: [] });
    await saveEvaluationResult(saved, { storage });

    const read = await readEvaluationResult(saved.runId, { storage });
    expect(read.status).toBe("canceled");
  });

  it("reports a save failure instead of silently succeeding", async () => {
    const storage = new MemoryResultStorage();
    storage.failWriteWith = new Error("disk full");

    await expect(saveEvaluationResult(result(), { storage })).rejects.toMatchObject({
      code: "save-failed",
    });
    expect(await storage.list("/")).toEqual([]);
  });

  it("lists saved results as lightweight summaries, newest first", async () => {
    const storage = new MemoryResultStorage();
    await saveEvaluationResult(
      result({ runId: "run-older", startedAt: "2026-01-01T00:00:00.000Z" }),
      { storage },
    );
    await saveEvaluationResult(
      result({ runId: "run-newer", startedAt: "2026-01-02T00:00:00.000Z" }),
      { storage },
    );

    const summaries = await listEvaluationResults({ storage });
    expect(summaries.map((summary) => summary.runId)).toEqual(["run-newer", "run-older"]);
    expect(summaries[0]).toMatchObject({
      dataset: { datasetId: "google/fleurs", configuration: "hi_in", split: "test" },
      status: "completed",
      summary: { total: 1, succeeded: 1 },
    });
  });

  it("skips a corrupted result instead of failing the whole list", async () => {
    const storage = new MemoryResultStorage();
    await saveEvaluationResult(result({ runId: "run-good" }), { storage });
    await storage.write("/memora/evaluations/run-bad.json", "{ not valid json");

    const summaries = await listEvaluationResults({ storage });
    expect(summaries.map((summary) => summary.runId)).toEqual(["run-good"]);
  });

  it("throws a typed error when reading a corrupted result directly", async () => {
    const storage = new MemoryResultStorage();
    await storage.write("/memora/evaluations/run-bad.json", "{ not valid json");

    await expect(readEvaluationResult("run-bad", { storage })).rejects.toMatchObject({
      code: "invalid-result",
    });
  });

  it("throws a typed error when the run was never saved", async () => {
    const storage = new MemoryResultStorage();
    await expect(readEvaluationResult("missing-run", { storage })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("EvaluationError", () => {
  it("carries a stable code and message", () => {
    const error = new EvaluationError("not-found", "No saved result.");
    expect(error.code).toBe("not-found");
    expect(error.message).toBe("No saved result.");
    expect(error.name).toBe("EvaluationError");
  });
});
