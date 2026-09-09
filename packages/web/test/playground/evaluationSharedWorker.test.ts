import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EvaluationWorkerRequest } from "@/lib/playground/evaluationWorkerProtocol";
import { NEMOTRON_MODEL_ID } from "@/lib/playground/nemotron/sessionManager";

const { createNemotronModelAdapter, openDataset, runEvaluation } = vi.hoisted(() => ({
  createNemotronModelAdapter: vi.fn(),
  openDataset: vi.fn(),
  runEvaluation: vi.fn(),
}));

vi.mock("@memora/datasets", () => ({ openDataset }));
vi.mock("@memora/evaluation", () => ({ runEvaluation }));
vi.mock("@/lib/playground/nemotron/modelAdapter", () => ({ createNemotronModelAdapter }));

class TestMessagePort {
  onmessage: ((event: MessageEvent<EvaluationWorkerRequest>) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly postMessage = vi.fn((message: unknown) => {
    this.messages.push(message);
  });
  readonly start = vi.fn();
}

const connectWorker = async (): Promise<TestMessagePort> => {
  const scope: { onconnect?: (event: MessageEvent) => void } = {};
  vi.stubGlobal("self", scope);
  await import("@/workers/evaluation.shared-worker");
  const port = new TestMessagePort();
  scope.onconnect?.({ ports: [port] } as unknown as MessageEvent);
  return port;
};

const runRequest = (modelId: string): EvaluationWorkerRequest => ({
  id: "evaluation-1",
  type: "run",
  selection: {
    datasetId: "known-dataset",
    revision: "known-revision",
    configuration: "default",
    split: "test",
  },
  modelId,
  language: "en",
});

describe("evaluation shared worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    openDataset.mockResolvedValue({ close: vi.fn() });
  });

  it("runs a Nemotron model id through the Nemotron adapter", async () => {
    const adapter = {
      identity: {
        modelId: NEMOTRON_MODEL_ID,
        modelRevision: { status: "unknown" },
        adapter: "nemotron-rnnt",
        runtime: "onnxruntime-web",
        inference: {},
      },
      predict: vi.fn().mockResolvedValue("a known transcript"),
    };
    createNemotronModelAdapter.mockReturnValue(adapter);
    runEvaluation.mockImplementation(async ({ model }) => ({
      transcript: await model.predict({
        pcm: new Float32Array([0.25]),
        sampleRate: 16_000,
        example: {},
      }),
    }));
    const port = await connectWorker();

    port.onmessage?.({ data: runRequest(NEMOTRON_MODEL_ID) } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual({
        id: "evaluation-1",
        type: "result",
        result: { transcript: "a known transcript" },
      }),
    );

    expect(createNemotronModelAdapter).toHaveBeenCalledOnce();
    expect(adapter.predict).toHaveBeenCalledOnce();
  });

  it("keeps Whisper on the host model-request protocol", async () => {
    runEvaluation.mockImplementation(async ({ model }) => {
      await model.initialize?.();
      return {
        transcript: await model.predict({
          pcm: new Float32Array([0.25]),
          sampleRate: 16_000,
          example: {},
        }),
      };
    });
    const port = await connectWorker();

    port.onmessage?.({ data: runRequest("onnx-community/whisper-small") } as MessageEvent);
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    const preload = port.messages[0] as { id: string };
    expect(preload).toMatchObject({
      type: "model-request",
      operation: "preload",
      modelId: "onnx-community/whisper-small",
    });

    port.onmessage?.({
      data: { id: "reply-1", type: "model-result", targetId: preload.id, prediction: "" },
    } as MessageEvent);
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));
    const transcribe = port.messages[1] as { id: string };
    expect(transcribe).toMatchObject({
      type: "model-request",
      operation: "transcribe",
      modelId: "onnx-community/whisper-small",
      language: "en",
      pcm: new Float32Array([0.25]),
    });

    port.onmessage?.({
      data: {
        id: "reply-2",
        type: "model-result",
        targetId: transcribe.id,
        prediction: "whisper transcript",
      },
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual({
        id: "evaluation-1",
        type: "result",
        result: { transcript: "whisper transcript" },
      }),
    );

    expect(createNemotronModelAdapter).not.toHaveBeenCalled();
  });
});
