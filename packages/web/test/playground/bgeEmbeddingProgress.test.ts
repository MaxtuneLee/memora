import { expect, test, vi } from "vite-plus/test";
import type { LocalEmbeddingEvent } from "@memora/local-model-runtime";

vi.mock("@/lib/model-worker", () => ({ modelWorkerFactory: {} }));
import {
  BgeEmbeddingClient,
  type BgeWorkerUpdate,
} from "../../src/lib/playground/bgeEmbeddingClient";

test("forwards worker status and heartbeat before inference finishes", async () => {
  let finish: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const updates: BgeWorkerUpdate[] = [];
  const client = new BgeEmbeddingClient({
    async *run(): AsyncGenerator<LocalEmbeddingEvent> {
      yield { type: "status", status: "queued" };
      yield { type: "status", status: "running" };
      yield { type: "embedding-progress", stage: "running", elapsedMs: 5000, textCount: 1 };
      await waiting;
      yield { type: "embedding-complete", dimension: 2, values: [0.1, 0.2] };
    },
  });
  const result = client.embed("bge-m3", ["text"], (update) => updates.push(update));
  await vi.waitFor(() => expect(updates).toHaveLength(3));
  expect(updates.map((u) => u.type)).toEqual(["status", "status", "embedding-progress"]);
  expect(updates[2]).toMatchObject({ elapsedMs: 5000, textCount: 1 });
  finish?.();
  expect((await result)[0]).toHaveLength(2);
});
