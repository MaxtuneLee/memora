import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AgentAttemptError } from "@memora/evaluation";

import type { EvaluationWorkerRequest } from "@/lib/playground/evaluationWorkerProtocol";

const { openDataset, runEvaluation, runAgentEvaluation } = vi.hoisted(() => ({
  openDataset: vi.fn(),
  runEvaluation: vi.fn(),
  runAgentEvaluation: vi.fn(),
}));

vi.mock("@memora/datasets", () => ({ openDataset }));
vi.mock("@memora/evaluation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@memora/evaluation")>()),
  runEvaluation,
  runAgentEvaluation,
}));

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

describe("agent evaluation in the shared worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const agent = {
    adapter: "memora-web",
    model: "model-a",
    promptRevision: "abc",
    tools: ["search_transcript"],
    settings: { personality: "none" },
  };
  const judge = { judge: "none", model: "none", promptVersion: "none" };
  const runAgent = {
    id: "agent-run-1",
    type: "run-agent",
    questions: [],
    corpus: { fileLectures: {}, cues: {}, revisions: {} },
    agent,
    judge,
    concurrency: 2,
  } as unknown as EvaluationWorkerRequest;

  it("relays the agent and the judge through the Window", async () => {
    runAgentEvaluation.mockImplementation(async (options) => {
      const signal = new AbortController().signal;
      const answer = await options.agent.answer({ questionId: "q1", question: "Why?" }, signal);
      const verdict = await options.judge.judge({ answer: answer.answer }, signal);
      return { identities: [options.agent.identity, options.judge.identity], answer, verdict };
    });
    const port = await connectWorker();

    port.onmessage?.({ data: runAgent } as MessageEvent);
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    const answerRequest = port.messages[0] as { id: string };
    expect(answerRequest).toMatchObject({
      type: "adapter-request",
      runId: "agent-run-1",
      adapter: "agent",
      question: { questionId: "q1", question: "Why?" },
    });
    expect(runAgentEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 2, questions: [] }),
    );

    port.onmessage?.({
      data: {
        id: "r1",
        type: "adapter-result",
        targetId: answerRequest.id,
        value: { answer: "Because." },
      },
    } as MessageEvent);
    await vi.waitFor(() => expect(port.messages).toHaveLength(2));
    const judgeRequest = port.messages[1] as { id: string };
    expect(judgeRequest).toMatchObject({
      type: "adapter-request",
      adapter: "judge",
      input: { answer: "Because." },
    });

    port.onmessage?.({
      data: { id: "r2", type: "adapter-result", targetId: judgeRequest.id, value: { ok: true } },
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual({
        id: "agent-run-1",
        type: "agent-result",
        result: {
          identities: [agent, judge],
          answer: { answer: "Because." },
          verdict: { ok: true },
        },
      }),
    );
  });

  it("rejects the adapter call with the Window's error and, on abort, cancels it and keeps its Trace", async () => {
    let seen: unknown;
    let late: unknown;
    runAgentEvaluation.mockImplementation(async (options) => {
      await options.agent
        .answer({ questionId: "q1", question: "Why?" }, new AbortController().signal)
        .catch((error: Error) => (seen = error.message));
      const controller = new AbortController();
      const pending = options.agent.answer(
        { questionId: "q2", question: "How?" },
        controller.signal,
      );
      controller.abort();
      late = await pending.catch((error: unknown) => error);
      return {};
    });
    const port = await connectWorker();

    port.onmessage?.({ data: runAgent } as MessageEvent);
    await vi.waitFor(() => expect(port.messages).toHaveLength(1));
    const first = port.messages[0] as { id: string };
    port.onmessage?.({
      data: { id: "r1", type: "adapter-result", targetId: first.id, error: "Provider refused." },
    } as MessageEvent);

    await vi.waitFor(() => expect(port.messages).toHaveLength(3));
    expect(seen).toBe("Provider refused.");
    const second = port.messages[1] as { id: string };
    expect(port.messages[2]).toMatchObject({ type: "model-cancel", targetId: second.id });

    // The Window answers the canceled call once it has deleted the session and read its Trace.
    const trace = { sessionId: "eval-s", runId: "run-1", fallbackTrims: "unknown" };
    port.onmessage?.({
      data: { id: "r2", type: "adapter-result", targetId: second.id, error: "Aborted.", trace },
    } as MessageEvent);
    await vi.waitFor(() =>
      expect(port.messages).toContainEqual({ id: "agent-run-1", type: "agent-result", result: {} }),
    );
    expect(late).toBeInstanceOf(AgentAttemptError);
    expect(late).toMatchObject({ message: "Aborted.", trace });
  });
});
