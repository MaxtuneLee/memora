import { expect, it, vi } from "vite-plus/test";
import { createModelWorkerFactory } from "@/lib/model-worker/factory";

it("keeps one connection per worker pool across a synchronous root remount", async () => {
  const created: Array<{ name: string }> = [];
  let closed = 0;
  class MockSharedWorker {
    port = {
      addEventListener: () => {},
      postMessage: () => {},
      start: () => {},
      close: () => {
        closed += 1;
      },
    };
    constructor(_url: URL, options: { name: string }) {
      created.push({ name: options.name });
    }
    addEventListener() {}
  }
  vi.stubGlobal("SharedWorker", MockSharedWorker);
  try {
    const factory = createModelWorkerFactory();
    const firstCleanup = factory.mount();
    firstCleanup();
    const secondCleanup = factory.mount();
    expect(created.map((worker) => worker.name).sort()).toEqual([
      "memora-model-asr",
      "memora-model-chat",
      "memora-model-embedding",
      "memora-model-formula",
      "memora-vector-db",
    ]);
    secondCleanup();
    await Promise.resolve();
    expect(closed).toBe(5);
  } finally {
    vi.unstubAllGlobals();
  }
});
