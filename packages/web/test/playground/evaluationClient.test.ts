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

const TRACE = { sessionId: "eval-s", runId: "run-1", fallbackTrims: "unknown" } as const;

describe("evaluationClient.runAgent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    instances.length = 0;
    vi.stubGlobal("SharedWorker", FakeSharedWorker as unknown as typeof SharedWorker);
  });

  const agentIdentity = {
    adapter: "memora-web",
    model: "model-a",
    promptRevision: "abc",
    tools: [],
    settings: {},
  };
  const judgeIdentity = { judge: "none", model: "none", promptVersion: "none" };

  it("serves relayed agent and judge calls with the registered adapters", async () => {
    const answer = vi.fn(async () => ({ answer: "Because." }));
    const judge = vi.fn(async () => ({ rawOutput: "ok" }));
    const onProgress = vi.fn();
    const { evaluationClient } = await import("@/lib/playground/evaluationClient");
    const running = evaluationClient.runAgent(
      {
        questions: [],
        corpus: { fileLectures: {}, cues: {}, revisions: {} } as never,
        agent: { identity: agentIdentity, answer } as never,
        judge: { identity: judgeIdentity, judge } as never,
        concurrency: 2,
      },
      { onProgress },
    );
    const port = instances[0].port;
    const run = port.messages[0] as { id: string };
    expect(run).toMatchObject({
      type: "run-agent",
      agent: agentIdentity,
      judge: judgeIdentity,
      concurrency: 2,
    });

    port.onmessage?.({
      data: {
        id: "a1",
        type: "adapter-request",
        runId: run.id,
        adapter: "agent",
        question: { questionId: "q1", question: "Why?" },
      },
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({
          type: "adapter-result",
          targetId: "a1",
          value: { answer: "Because." },
        }),
      ),
    );
    expect(answer).toHaveBeenCalledWith(
      { questionId: "q1", question: "Why?" },
      expect.any(AbortSignal),
    );

    port.onmessage?.({
      data: { id: "j1", type: "adapter-request", runId: run.id, adapter: "judge", input: {} },
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({
          type: "adapter-result",
          targetId: "j1",
          value: { rawOutput: "ok" },
        }),
      ),
    );

    port.onmessage?.({
      data: { id: run.id, type: "agent-progress", progress: { completed: 1 } },
    } as MessageEvent);
    expect(onProgress).toHaveBeenCalledWith({ completed: 1 });
    port.onmessage?.({
      data: { id: run.id, type: "agent-result", result: { kind: "agent" } },
    } as MessageEvent);
    await expect(running).resolves.toEqual({ kind: "agent" });
  });

  it("aborts the adapter call when the worker cancels it, and cancels the run on abort", async () => {
    // Imported after the module reset, so it is the class the client sees.
    const { AgentAttemptError } = await import("@memora/evaluation");
    let seen: AbortSignal | undefined;
    const answer = vi.fn(
      (_question: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          seen = signal;
          signal.addEventListener("abort", () => reject(new AgentAttemptError("Canceled.", TRACE)));
        }),
    );
    const controller = new AbortController();
    const { evaluationClient } = await import("@/lib/playground/evaluationClient");
    void evaluationClient
      .runAgent(
        {
          questions: [],
          corpus: {} as never,
          agent: { identity: agentIdentity, answer } as never,
          judge: { identity: judgeIdentity, judge: vi.fn() } as never,
        },
        { signal: controller.signal },
      )
      .catch(() => {});
    const port = instances[0].port;
    const run = port.messages[0] as { id: string };
    port.onmessage?.({
      data: { id: "a1", type: "adapter-request", runId: run.id, adapter: "agent", question: {} },
    } as MessageEvent);
    await vi.waitFor(() => expect(seen).toBeDefined());

    port.onmessage?.({ data: { id: "c1", type: "model-cancel", targetId: "a1" } } as MessageEvent);
    expect(seen?.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual(
        expect.objectContaining({
          type: "adapter-result",
          targetId: "a1",
          error: "Canceled.",
          trace: TRACE,
        }),
      ),
    );

    controller.abort();
    expect(port.messages).toContainEqual(
      expect.objectContaining({ type: "cancel", targetId: run.id }),
    );
  });
});
