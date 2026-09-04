import { describe, expect, test, vi } from "vite-plus/test";

import { createLocalModelClient } from "../../src/lib/local-model/client";
import type { ModelWorkerFactory } from "../../src/lib/model-worker";

describe("local model client", () => {
  test("fails an unknown preload model before contacting a worker", async () => {
    const run = vi.fn();
    const client = createLocalModelClient({ run } as unknown as ModelWorkerFactory);

    const events = [];
    for await (const event of client.preloadModel("unknown-model")) events.push(event);

    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: "error",
        error: {
          code: "model-not-found",
          message: "Local model unknown-model was not found.",
        },
      },
      { type: "status", status: "failed" },
    ]);
  });
});
