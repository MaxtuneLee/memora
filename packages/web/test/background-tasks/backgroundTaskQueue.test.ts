import { describe, expect, test } from "vite-plus/test";

import {
  createBackgroundTaskQueue,
  createMemoryTaskStorage,
  type BackgroundTaskHandler,
} from "@/lib/background-tasks";

describe("background task queue", () => {
  test("deduplicates tasks and runs dependencies in order", async () => {
    const queue = createBackgroundTaskQueue(createMemoryTaskStorage());
    const events: string[] = [];
    const first: BackgroundTaskHandler<{ value: string }> = {
      kind: "test.first",
      run: async ({ value }) => {
        events.push(value);
      },
    };
    const second: BackgroundTaskHandler<{ value: string }> = {
      kind: "test.second",
      run: async ({ value }) => {
        events.push(value);
      },
    };
    queue.registry.register(first);
    queue.registry.register(second);
    await queue.start();
    const firstTask = await queue.enqueue({
      kind: first.kind,
      payload: { value: "first" },
      dedupeKey: "same",
    });
    const duplicate = await queue.enqueue({
      kind: first.kind,
      payload: { value: "duplicate" },
      dedupeKey: "same",
    });
    await queue.enqueue({
      kind: second.kind,
      payload: { value: "second" },
      dedupeKey: "second",
      dependsOn: [firstTask.id],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(duplicate.id).toBe(firstTask.id);
    expect(events).toEqual(["first", "second"]);
    await queue.stop();
  });

  test("recovers a running task as queued after restart", async () => {
    const storage = createMemoryTaskStorage([
      {
        id: "recover-me",
        kind: "test.recover",
        payload: {},
        dedupeKey: "recover-me",
        priority: "background",
        resourceGroup: "default",
        state: "running",
        attempt: 1,
        maxAttempts: 3,
        runAfter: 0,
        dependsOn: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    const queue = createBackgroundTaskQueue(storage);
    queue.registry.register({ kind: "test.recover", run: async () => undefined });
    await queue.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queue.getTask("recover-me")?.state).toBe("succeeded");
    await queue.stop();
  });
});
