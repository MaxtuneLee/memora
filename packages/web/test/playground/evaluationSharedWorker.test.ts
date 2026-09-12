import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { EvaluationWorkerRequest } from "@/lib/playground/evaluationWorkerProtocol";

const { openDataset, runEvaluation } = vi.hoisted(() => ({
  openDataset: vi.fn(),
  runEvaluation: vi.fn(),
}));

vi.mock("@memora/datasets", () => ({ openDataset }));
vi.mock("@memora/evaluation", () => ({ runEvaluation }));

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

const runThroughHostModelRequestProtocol = async (modelId: string) => {
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

  port.onmessage?.({ data: runRequest(modelId) } as MessageEvent);
  await vi.waitFor(() => expect(port.messages).toHaveLength(1));
  const preload = port.messages[0] as { id: string };
  expect(preload).toMatchObject({
    type: "model-request",
    operation: "preload",
    modelId,
  });

  port.onmessage?.({
    data: { id: "reply-1", type: "model-result", targetId: preload.id, prediction: "" },
  } as MessageEvent);
  await vi.waitFor(() => expect(port.messages).toHaveLength(2));
  const transcribe = port.messages[1] as { id: string };
  expect(transcribe).toMatchObject({
    type: "model-request",
    operation: "transcribe",
    modelId,
    language: "en",
    pcm: new Float32Array([0.25]),
  });

  port.onmessage?.({
    data: {
      id: "reply-2",
      type: "model-result",
      targetId: transcribe.id,
      prediction: "known transcript",
    },
  } as MessageEvent);
  await vi.waitFor(() =>
    expect(port.messages).toContainEqual({
      id: "evaluation-1",
      type: "result",
      result: { transcript: "known transcript" },
    }),
  );
};

describe("evaluation shared worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    openDataset.mockResolvedValue({ close: vi.fn() });
  });

  it("routes Whisper through the host model-request protocol", async () => {
    await runThroughHostModelRequestProtocol("onnx-community/whisper-small");
  });

  it("routes Nemotron through the same host model-request protocol as Whisper", async () => {
    await runThroughHostModelRequestProtocol("nemotron-3.5-asr-streaming-0.6b-int4");
  });
});
