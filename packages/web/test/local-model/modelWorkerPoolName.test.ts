import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { getModelWorkerPool } from "../../src/workers/model-worker/poolName";

const runtime = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@memora/local-model-runtime/worker", () => ({
  runLocalModelTask: vi.fn(),
  setLocalModelAssetCache: vi.fn(),
}));
vi.mock("../../src/workers/local-model/cache", () => ({ opfsLocalModelAssetCache: {} }));
vi.mock("../../src/workers/model-worker/sharedRuntime", () => ({
  startSharedModelWorkerRuntime: runtime.start,
}));

beforeEach(() => {
  vi.resetModules();
  runtime.start.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

test("recognizes existing pools and distinct benchmark worker names", () => {
  for (const pool of ["asr", "chat", "embedding", "formula"] as const) {
    expect(getModelWorkerPool(`memora-model-${pool}`)).toBe(pool);
    expect(getModelWorkerPool(`memora-beir-unique-session-1-${pool}`)).toBe(pool);
  }
  for (const name of ["", "embedding", "-embedding", "memora-model-unknown"]) {
    expect(getModelWorkerPool(name)).toBeNull();
  }
});

test("the real worker entry starts the embedding runtime for a scoped worker", async () => {
  vi.stubGlobal("self", { name: "memora-beir-test-session-0-embedding" });
  await import("../../src/workers/localModel.shared-worker");
  expect(runtime.start).toHaveBeenCalledWith("embedding", expect.any(Function));
});

test("the real worker entry rejects an unknown pool", async () => {
  vi.stubGlobal("self", { name: "memora-beir-test-session-0-unknown" });
  await expect(import("../../src/workers/localModel.shared-worker")).rejects.toThrow(
    "Unknown shared model worker name",
  );
  expect(runtime.start).not.toHaveBeenCalled();
});
