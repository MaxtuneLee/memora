import { describe, expect, test } from "vite-plus/test";

import { summarizeBackgroundTasks } from "@/lib/background-tasks";

describe("background task diagnostics", () => {
  test("summarizes state, kind, queue age, and failures", () => {
    const summary = summarizeBackgroundTasks([
      {
        id: "one",
        kind: "content.extract",
        payload: {},
        dedupeKey: "one",
        priority: "background",
        resourceGroup: "document-parser",
        state: "queued",
        attempt: 0,
        maxAttempts: 3,
        runAfter: 0,
        dependsOn: [],
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: "two",
        kind: "content.index.lexical",
        payload: {},
        dedupeKey: "two",
        priority: "background",
        resourceGroup: "io",
        state: "failed",
        attempt: 3,
        maxAttempts: 3,
        runAfter: 0,
        dependsOn: [],
        createdAt: 20,
        updatedAt: 30,
        error: { code: "task-failed", message: "boom", retryable: false },
      },
    ]);
    expect(summary).toMatchObject({
      total: 2,
      oldestQueuedAt: 10,
      byState: { queued: 1, failed: 1 },
      byKind: { "content.extract": 1, "content.index.lexical": 1 },
    });
    expect(summary.failed[0]?.error?.message).toBe("boom");
  });
});
