import { createOpfsTaskStorage } from "./taskStorage";
import { BackgroundTaskRegistry } from "./taskRegistry";
import type {
  BackgroundTask,
  BackgroundTaskContext,
  BackgroundTaskError,
  BackgroundTaskStorage,
  EnqueueTaskInput,
} from "./types";

const RETRY_DELAYS = [5_000, 30_000, 300_000];

const toTaskError = (error: unknown): BackgroundTaskError => ({
  code: error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "task-failed",
  message: error instanceof Error ? error.message : String(error),
  retryable: !(error instanceof DOMException && error.name === "AbortError"),
});

export class BackgroundTaskQueue {
  readonly registry = new BackgroundTaskRegistry();
  private readonly storage: BackgroundTaskStorage;
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly listeners = new Set<() => void>();
  private readonly controllers = new Map<string, AbortController>();
  private channel: BroadcastChannel | null = null;
  private running = false;
  private pumping = false;

  constructor(storage: BackgroundTaskStorage = createOpfsTaskStorage()) {
    this.storage = storage;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (const task of await this.storage.load()) {
      this.tasks.set(task.id, { ...task, state: task.state === "running" ? "queued" : task.state });
    }
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("memora-background-tasks");
      this.channel.onmessage = () => void this.reloadAndPump();
    }
    await this.persist();
    void this.pump();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.channel?.close();
    this.channel = null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTasks(): BackgroundTask[] {
    return [...this.tasks.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  async enqueue<TPayload>(input: EnqueueTaskInput<TPayload>): Promise<BackgroundTask<TPayload>> {
    const existing = [...this.tasks.values()].find(
      (task) =>
        task.dedupeKey === input.dedupeKey && !["succeeded", "cancelled"].includes(task.state),
    );
    if (existing) return existing as BackgroundTask<TPayload>;
    const now = Date.now();
    const task: BackgroundTask<TPayload> = {
      id: crypto.randomUUID(),
      kind: input.kind,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
      priority: input.priority ?? "background",
      resourceGroup: input.resourceGroup ?? "default",
      state: "queued",
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAfter: input.runAfter ?? now,
      dependsOn: input.dependsOn ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    await this.persist();
    void this.pump();
    return task;
  }

  async cancel(predicate: (task: BackgroundTask) => boolean): Promise<void> {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (!predicate(task) || ["succeeded", "failed", "cancelled"].includes(task.state)) continue;
      task.state = "cancelled";
      task.updatedAt = now;
      this.controllers.get(task.id)?.abort();
    }
    await this.persist();
  }

  private async reloadAndPump(): Promise<void> {
    for (const task of await this.storage.load()) this.tasks.set(task.id, task);
    void this.pump();
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.getTasks());
    this.channel?.postMessage({ type: "tasks-updated" });
    this.listeners.forEach((listener) => listener());
  }

  private canRun(task: BackgroundTask): boolean {
    if (task.state !== "queued" || task.runAfter > Date.now()) return false;
    return task.dependsOn.every((id) => this.tasks.get(id)?.state === "succeeded");
  }

  private async pump(): Promise<void> {
    if (!this.running || this.pumping) return;
    this.pumping = true;
    try {
      while (this.running) {
        const task = this.getTasks()
          .filter((candidate) => this.canRun(candidate))
          .sort(
            (left, right) => Number(right.priority === "user") - Number(left.priority === "user"),
          )[0];
        if (!task) break;
        await this.runTask(task);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runTask(task: BackgroundTask): Promise<void> {
    const handler = this.registry.get(task.kind);
    if (!handler) {
      task.state = "failed";
      task.error = {
        code: "missing-handler",
        message: `No handler registered for ${task.kind}.`,
        retryable: false,
      };
      task.updatedAt = Date.now();
      await this.persist();
      return;
    }
    const controller = new AbortController();
    this.controllers.set(task.id, controller);
    task.state = "running";
    task.attempt += 1;
    task.updatedAt = Date.now();
    await this.persist();
    const context: BackgroundTaskContext = {
      signal: controller.signal,
      task,
      reportProgress: () => undefined,
      enqueue: (input) => this.enqueue(input),
    };
    try {
      await handler.run(task.payload, context);
      task.state = "succeeded";
      task.error = undefined;
    } catch (error) {
      const taskError = toTaskError(error);
      task.error = taskError;
      if (taskError.code === "cancelled") task.state = "cancelled";
      else if (taskError.retryable && task.attempt < task.maxAttempts) {
        task.state = "queued";
        task.runAfter =
          Date.now() + RETRY_DELAYS[Math.min(task.attempt - 1, RETRY_DELAYS.length - 1)];
      } else task.state = "failed";
    } finally {
      task.updatedAt = Date.now();
      this.controllers.delete(task.id);
      await this.persist();
    }
  }
}

export const createBackgroundTaskQueue = (storage?: BackgroundTaskStorage): BackgroundTaskQueue =>
  new BackgroundTaskQueue(storage);
