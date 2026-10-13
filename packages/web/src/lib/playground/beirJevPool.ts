import { createJevReranker, type JevDataset } from "@memora/evaluation";

interface Slot {
  workerId: number;
  phase: string;
  startIndex: number | null;
  completedTexts: number;
  lastWorkerEventAt: number | null;
  backend: string;
}
export class BeirJevPool {
  private readonly scorer;
  private readonly slots: Slot[];
  private readonly busy = new Set<number>();
  private readonly controller = new AbortController();
  private readonly onProgress: (state: Slot, event: string) => void;
  private dataset: JevDataset = "scifact";
  constructor(options: {
    apiKey: string;
    workerCount: number;
    onProgress: (state: Slot, event: string) => void;
  }) {
    this.scorer = createJevReranker({
      apiKey: options.apiKey,
      baseUrl: "/api/playground/typesafe",
    });
    this.onProgress = options.onProgress;
    this.slots = Array.from({ length: options.workerCount }, (_, workerId) => ({
      workerId,
      phase: "idle",
      startIndex: null,
      completedTexts: 0,
      lastWorkerEventAt: null,
      backend: "remote-api",
    }));
  }
  setDataset(dataset: JevDataset): void {
    this.dataset = dataset;
  }
  progress(): Slot[] {
    return this.slots.map((s) => ({ ...s }));
  }
  async scorePair(
    query: string,
    document: string,
    _device: string,
    signal: AbortSignal,
    startIndex: number | null = null,
    recordStats = true,
  ) {
    const slot = this.slots.find((s) => !this.busy.has(s.workerId));
    if (!slot) throw new Error("No free Jev request slot.");
    this.busy.add(slot.workerId);
    slot.phase = "requesting";
    slot.startIndex = startIndex;
    this.onProgress({ ...slot }, "dispatched");
    try {
      const value = await this.scorer.score(
        query,
        document,
        this.dataset,
        AbortSignal.any([signal, this.controller.signal]),
      );
      slot.phase = "completed";
      slot.lastWorkerEventAt = Date.now();
      if (recordStats) slot.completedTexts++;
      this.onProgress({ ...slot }, "api-response");
      return { ...value, workerId: slot.workerId };
    } catch (error) {
      slot.phase = "failed";
      this.onProgress({ ...slot }, "failed");
      throw error;
    } finally {
      this.busy.delete(slot.workerId);
    }
  }
  warmReranker(device: string, signal: AbortSignal) {
    return Promise.all(
      this.slots.map(() =>
        this.scorePair(
          "What is a panda?",
          "The giant panda is a bear native to China.",
          device,
          signal,
          null,
          false,
        ),
      ),
    );
  }
  dispose(): void {
    this.controller.abort();
  }
}

/** Reads only the saved TypeSafe credential; never exports or logs it. */
export async function readSavedJevKey(): Promise<string> {
  const [{ appStoreRegistry, appStoreOptions }, { providerCredentialsQuery$, readProviderApiKey }] =
    await Promise.all([import("@/livestore/store"), import("@/livestore/providerCredential")]);
  const release = appStoreRegistry.retain(appStoreOptions);
  try {
    const store = await appStoreRegistry.getOrLoadPromise(appStoreOptions);
    return readProviderApiKey(
      { id: "typesafe", baseUrl: "https://api.typesafe.ai" },
      store.query(providerCredentialsQuery$),
    );
  } finally {
    release();
  }
}
