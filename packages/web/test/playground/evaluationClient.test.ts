import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { reserve, release } = vi.hoisted(() => ({
  reserve: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/playground/datasetClient", () => ({ datasetClient: { reserve, release } }));

class FakePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly postMessage = vi.fn((message: unknown) => {
    this.messages.push(message);
  });
  readonly start = vi.fn();
}

const instances: { port: FakePort }[] = [];

class FakeSharedWorker {
  readonly port = new FakePort();
  constructor() {
    instances.push(this);
  }
}

const selection = {
  datasetId: "google/fleurs",
  revision: "abc123",
  configuration: "hi_in",
  split: "test",
};

describe("evaluationClient.run", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    instances.length = 0;
    release.mockResolvedValue(null);
    vi.stubGlobal("SharedWorker", FakeSharedWorker as unknown as typeof SharedWorker);
  });

  it("reserves the split before asking the worker to run, and releases it once the run resolves", async () => {
    let resolveReserve: (value: null) => void = () => undefined;
    reserve.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolveReserve = resolve;
        }),
    );

    const { evaluationClient } = await import("@/lib/playground/evaluationClient");
    const runPromise = evaluationClient.run(selection, "model-a", "en");

    await vi.waitFor(() => expect(reserve).toHaveBeenCalledWith(selection));
    expect(instances[0]?.port.messages).toHaveLength(0);

    resolveReserve(null);
    await vi.waitFor(() => expect(instances[0]?.port.messages).toHaveLength(1));
    const run = instances[0]?.port.messages[0] as { id: string };
    expect(run).toMatchObject({ type: "run", selection, modelId: "model-a", language: "en" });
    expect(release).not.toHaveBeenCalled();

    instances[0]?.port.onmessage?.({
      data: { id: run.id, type: "result", result: { transcript: "ok" } },
    } as MessageEvent);

    await expect(runPromise).resolves.toEqual({ transcript: "ok" });
    expect(release).toHaveBeenCalledWith(selection);
  });

  it("releases the reservation and rejects a run that was already aborted before it resolved", async () => {
    reserve.mockResolvedValue(null);
    const controller = new AbortController();
    controller.abort();

    const { evaluationClient } = await import("@/lib/playground/evaluationClient");
    await expect(
      evaluationClient.run(selection, "model-a", "en", { signal: controller.signal }),
    ).rejects.toThrow(/aborted/i);

    await vi.waitFor(() => expect(release).toHaveBeenCalledWith(selection));
    expect(instances[0]?.port.messages).toHaveLength(0);
  });

  it("releases the reservation when the run rejects", async () => {
    reserve.mockResolvedValue(null);

    const { evaluationClient } = await import("@/lib/playground/evaluationClient");
    const runPromise = evaluationClient.run(selection, "model-a", "en");

    await vi.waitFor(() => expect(instances[0]?.port.messages).toHaveLength(1));
    const run = instances[0]?.port.messages[0] as { id: string };

    instances[0]?.port.onmessage?.({
      data: { id: run.id, type: "error", message: "boom" },
    } as MessageEvent);

    await expect(runPromise).rejects.toThrow("boom");
    expect(release).toHaveBeenCalledWith(selection);
  });
});
