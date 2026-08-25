import type { BackgroundTaskHandler } from "./types";

export class BackgroundTaskRegistry {
  private readonly handlers = new Map<string, BackgroundTaskHandler>();

  register<TPayload>(handler: BackgroundTaskHandler<TPayload>): void {
    this.handlers.set(handler.kind, handler as BackgroundTaskHandler);
  }

  get(kind: string): BackgroundTaskHandler | undefined {
    return this.handlers.get(kind);
  }
}
