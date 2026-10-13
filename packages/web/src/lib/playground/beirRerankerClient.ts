import type {
  BeirRerankerProfile,
  LocalModelEvent,
  LocalModelExecutionBackend,
} from "@memora/local-model-runtime";
import type { ModelWorkerFactory } from "../model-worker/factory";

export class BeirRerankerClient {
  private readonly factory: Pick<ModelWorkerFactory, "run">;
  private readonly profile: BeirRerankerProfile;
  constructor(factory: Pick<ModelWorkerFactory, "run">, profile: BeirRerankerProfile = "m3") {
    this.profile = profile;
    this.factory = factory;
  }

  async score(
    query: string,
    document: string,
    device: LocalModelExecutionBackend,
    signal: AbortSignal,
    onEvent: (event: LocalModelEvent) => void,
  ): Promise<{
    logit: number;
    scoringMs: number;
    backend: LocalModelExecutionBackend;
  }> {
    let result: Extract<LocalModelEvent, { type: "reranker-complete" }> | undefined;
    const timeout = AbortSignal.timeout(1_200_000);
    for await (const event of this.factory.run("embedding", {
      priority: "background",
      signal: AbortSignal.any([signal, timeout]),
      task: { kind: "reranker.score", input: { query, document, device, profile: this.profile } },
    })) {
      onEvent(event);
      if (event.type === "error")
        throw new Error(event.error.message + " " + (event.error.detail ?? ""));
      if (event.type === "reranker-complete") result = event;
    }
    signal.throwIfAborted();
    if (
      !result ||
      !Number.isFinite(result.logit) ||
      !Number.isFinite(result.scoringMs) ||
      result.scoringMs < 0 ||
      result.backend !== device
    )
      throw new Error("The shared reranker worker returned invalid scores or backend.");
    return { logit: result.logit, scoringMs: result.scoringMs, backend: result.backend };
  }
}
