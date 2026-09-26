import type { Agent, AgentEvent, AgentMessage } from "@memora/ai-core";
import type { ChatMessage } from "@/hooks/chat/useAgent/types";
import {
  parsePartialShowWidgetArguments,
  sanitizeShowWidgetArguments,
} from "@/lib/chat/showWidget";
import type { AgentSubmission, SessionSnapshot } from "./protocol";

export interface SessionRunner {
  run(input: AgentMessage): AsyncGenerator<AgentEvent>;
  steer: Agent["steer"];
  abort: () => void;
  takeUnconsumedSteering: () => AgentMessage[];
}
export interface SessionRuntimeOptions {
  snapshot: SessionSnapshot;
  createRunner: (submission: AgentSubmission) => Promise<SessionRunner>;
  save: (snapshot: SessionSnapshot) => Promise<void>;
  publish: (snapshot: SessionSnapshot) => void;
  /** Called when the queue has drained, with the submission that ran last. */
  onIdle?: (lastSubmission: AgentSubmission) => void;
}

/** One owner serializes each session; different instances run independently. */
export class SessionRuntime {
  snapshot: SessionSnapshot;
  private queue: AgentSubmission[] = [];
  private steering = new Map<string, AgentSubmission>();
  private startingSteering: AgentMessage[] = [];
  private accepted = new Set<string>();
  private runner?: SessionRunner;
  private draining = false;
  private stopped = false;
  private writes: Promise<void> = Promise.resolve();
  private rawWidgetArgs = new Map<string, string>();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private idleWaiters: Array<() => void> = [];

  private options: SessionRuntimeOptions;

  constructor(options: SessionRuntimeOptions) {
    this.options = options;
    this.snapshot = options.snapshot;
    this.accepted = new Set(options.snapshot.acceptedSubmissionIds ?? []);
  }

  replaceSnapshot(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    this.accepted = new Set(snapshot.acceptedSubmissionIds ?? []);
    this.options.publish(snapshot);
  }

  private publish(): void {
    clearTimeout(this.publishTimer);
    this.publishTimer = undefined;
    this.snapshot = { ...this.snapshot, revision: this.snapshot.revision + 1 };
    this.options.publish(this.snapshot);
  }

  async checkpoint(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const snapshot = structuredClone(this.snapshot);
    this.writes = this.writes.catch(() => {}).then(() => this.options.save(snapshot));
    await this.writes;
  }

  // Stream events arrive per token; coalesce them so each tab clones and renders at most ~20 snapshots/s.
  private changed(streaming = false): void {
    if (!streaming) this.publish();
    else this.publishTimer ??= setTimeout(() => this.publish(), 50);
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = undefined;
        void this.checkpoint().catch((error: unknown) => this.storageError(error));
      }, 250);
    }
  }

  private storageError(error: unknown): void {
    this.snapshot.error = `Could not save the session: ${error instanceof Error ? error.message : String(error)}`;
    this.publish();
  }

  async submit(submission: AgentSubmission): Promise<void> {
    if (this.accepted.has(submission.id)) return;
    this.accepted.add(submission.id);
    this.snapshot.acceptedSubmissionIds = [...this.accepted];
    this.snapshot.recap = undefined;
    if (submission.mode !== "steer" || !this.trySteer(submission)) {
      this.queue.push(submission);
      this.syncPending();
    }
    this.publish();
    // Save receipt before execution. Credentials and runtime configuration are never saved.
    try {
      await this.checkpoint();
    } catch (error) {
      this.storageError(error);
      throw error;
    }
    void this.drain();
  }

  /** Show a recap written while idle, unless work started in the meantime. */
  async setRecap(text: string): Promise<void> {
    if (this.snapshot.activeRunId || this.queue.length) return;
    this.snapshot.recap = text;
    this.publish();
    await this.checkpoint();
  }

  /** Move a queued message into the running task as a steer. Returns false when none runs. */
  async steerPending(submissionId: string): Promise<boolean> {
    const index = this.queue.findIndex((item) => item.id === submissionId);
    const item = this.queue[index];
    if (!item || !this.trySteer({ ...item, mode: "steer" })) return false;
    this.queue.splice(index, 1);
    this.syncPending();
    this.publish();
    await this.checkpoint();
    return true;
  }

  private trySteer(submission: AgentSubmission): boolean {
    const whileStarting =
      this.draining && Boolean(this.snapshot.activeRunId) && !this.runner && !this.stopped;
    if (!whileStarting && !this.runner?.steer(submission.input)) return false;
    if (whileStarting) this.startingSteering.push(submission.input);
    this.steering.set(submission.input.id, submission);
    this.snapshot.messages = [...this.snapshot.messages, submission.message];
    return true;
  }

  private syncPending(): void {
    this.snapshot.pending = this.queue.map((item) => ({
      id: item.id,
      text: item.message.content,
      message: item.message,
    }));
  }

  abort(runId: string): void {
    if (this.snapshot.activeRunId !== runId) return;
    this.stopped = true;
    this.runner?.abort();
  }

  async stopAll(): Promise<void> {
    this.queue = [];
    this.snapshot.pending = [];
    this.steering.clear();
    this.startingSteering = [];
    if (this.snapshot.activeRunId) this.abort(this.snapshot.activeRunId);
    if (this.draining) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    await this.checkpoint();
  }

  patchMessage(message: ChatMessage): void {
    // UI may attach a saved-library reference; it cannot replace live assistant output.
    this.snapshot.messages = this.snapshot.messages.map((current) =>
      current.id === message.id ? { ...current, attachments: message.attachments } : current,
    );
    this.changed();
  }

  private updateAssistant(update: (message: ChatMessage) => ChatMessage): void {
    this.snapshot.messages = this.snapshot.messages.map((message) =>
      message.id === this.snapshot.activeMessageId ? update(message) : message,
    );
  }

  private event(event: AgentEvent): void {
    switch (event.type) {
      case "text-delta":
        this.snapshot.status = { type: "generating" };
        this.snapshot.thinkingCollapsed = true;
        this.updateAssistant((message) => ({ ...message, content: message.content + event.delta }));
        break;
      case "reasoning-delta": {
        const steps = this.snapshot.thinkingSteps;
        const last = steps.at(-1);
        this.snapshot.thinkingSteps =
          last?.type === "reasoning" && last.status === "in_progress"
            ? [...steps.slice(0, -1), { ...last, text: last.text + event.delta }]
            : [
                ...steps,
                {
                  id: crypto.randomUUID(),
                  type: "reasoning",
                  text: event.delta,
                  status: "in_progress",
                },
              ];
        break;
      }
      case "reasoning-done":
        this.snapshot.thinkingSteps = this.snapshot.thinkingSteps.map((step) =>
          step.type === "reasoning" && step.status === "in_progress"
            ? { ...step, text: event.text, status: "done" }
            : step,
        );
        break;
      case "tool-call-start":
        this.snapshot.status = { type: "tool-calling", toolName: event.toolCall.name };
        this.snapshot.thinkingSteps = [
          ...this.snapshot.thinkingSteps,
          {
            id: event.toolCall.id,
            type: "tool-call",
            text: event.toolCall.name,
            status: "in_progress",
          },
        ];
        if (event.toolCall.name === "show_widget") this.rawWidgetArgs.set(event.toolCall.id, "");
        break;
      case "tool-call-args-delta":
        if (this.rawWidgetArgs.has(event.toolCallId)) {
          const raw = this.rawWidgetArgs.get(event.toolCallId) + event.delta;
          this.rawWidgetArgs.set(event.toolCallId, raw);
          const args = parsePartialShowWidgetArguments(raw);
          if (args) this.widget(event.toolCallId, args, "streaming");
        }
        break;
      case "tool-call-complete":
        if (event.toolCall.name === "show_widget") {
          const args = sanitizeShowWidgetArguments(event.toolCall.arguments);
          if (args) this.widget(event.toolCall.id, args, "streaming");
        }
        break;
      case "tool-result":
        this.snapshot.status = { type: "thinking" };
        this.snapshot.thinkingSteps = this.snapshot.thinkingSteps.map((step) =>
          step.id === event.toolCall.id ? { ...step, status: "done" } : step,
        );
        if (event.toolCall.name === "show_widget") {
          this.updateAssistant((message) => ({
            ...message,
            widgets: message.widgets?.map((widget) =>
              widget.toolCallId === event.toolCall.id
                ? {
                    ...widget,
                    phase: event.isError ? "error" : "ready",
                    ...(event.isError ? { errorMessage: String(event.result) } : {}),
                  }
                : widget,
            ),
          }));
        }
        break;
      case "steer-consumed": {
        // The reply so far ends at the steer; what the model writes next is a new reply below
        // it. A reply with nothing in it yet moves below the steer instead of staying empty.
        const current = this.snapshot.messages.find(
          (message) => message.id === this.snapshot.activeMessageId,
        );
        const empty =
          current && !current.content && !current.thinkingSteps?.length && !current.widgets?.length;
        if (!empty)
          this.updateAssistant((message) => ({
            ...message,
            thinkingSteps: this.snapshot.thinkingSteps.map((step) => ({ ...step, status: "done" })),
          }));
        const next: ChatMessage = empty
          ? current
          : { id: crypto.randomUUID(), role: "assistant", content: "" };
        this.snapshot.messages = [
          ...this.snapshot.messages.filter((message) => message.id !== next.id),
          next,
        ];
        this.snapshot.activeMessageId = next.id;
        this.snapshot.thinkingSteps = [];
        this.snapshot.thinkingCollapsed = false;
        this.snapshot.status = { type: "thinking" };
        break;
      }
      case "done":
        this.updateAssistant((message) => ({
          ...message,
          content:
            event.message.content
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("") || message.content,
        }));
        break;
      case "usage":
        this.updateAssistant((message) => ({
          ...message,
          usage: {
            inputTokens: (message.usage?.inputTokens ?? 0) + (event.usage.inputTokens ?? 0),
            outputTokens: (message.usage?.outputTokens ?? 0) + (event.usage.outputTokens ?? 0),
            totalTokens: (message.usage?.totalTokens ?? 0) + (event.usage.totalTokens ?? 0),
          },
        }));
        break;
      case "error": {
        this.snapshot.error = event.error.message;
        this.snapshot.outcome = "failed";
        const match = /Max iterations \((\d+)\) reached/.exec(event.error.message);
        if (match) this.snapshot.iterations = Number(match[1]);
        break;
      }
      default:
        break;
    }
    this.updateAssistant((message) => ({ ...message, thinkingSteps: this.snapshot.thinkingSteps }));
    this.changed(true);
  }

  private widget(
    id: string,
    args: Partial<ReturnType<typeof sanitizeShowWidgetArguments>>,
    phase: "streaming",
  ): void {
    if (!args) return;
    this.updateAssistant((message) => {
      const widget = {
        toolCallId: id,
        title: args.title ?? "",
        loadingMessages: args.loading_messages ?? [],
        widgetCode: args.widget_code ?? "",
        phase,
        ...(args.data_source ? { dataSourceName: args.data_source } : {}),
        ...(args.data_source_params ? { dataSourceParams: args.data_source_params } : {}),
        ...(args.data_files ? { dataFiles: args.data_files } : {}),
      };
      const widgets = message.widgets ?? [];
      return {
        ...message,
        widgets: widgets.some((item) => item.toolCallId === id)
          ? widgets.map((item) => (item.toolCallId === id ? widget : item))
          : [...widgets, widget],
      };
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    let last: AgentSubmission | undefined;
    try {
      while (this.queue.length) {
        const submission = this.queue.shift();
        if (!submission) break;
        last = submission;
        this.stopped = false;
        this.snapshot = {
          ...this.snapshot,
          activeRunId: submission.id,
          activeMessageId: crypto.randomUUID(),
          status: { type: "thinking" },
          thinkingSteps: [],
          thinkingCollapsed: false,
          error: undefined,
          outcome: undefined,
          iterations: undefined,
          pending: this.queue.map((item) => ({
            id: item.id,
            text: item.message.content,
            message: item.message,
          })),
        };
        if (!this.snapshot.messages.some((message) => message.id === submission.message.id))
          this.snapshot.messages = [...this.snapshot.messages, submission.message];
        this.snapshot.messages = [
          ...this.snapshot.messages,
          { id: this.snapshot.activeMessageId!, role: "assistant", content: "" },
        ];
        this.rawWidgetArgs.clear();
        this.publish();
        try {
          await this.checkpoint();
          this.runner = await this.options.createRunner(submission);
          if (!this.stopped) {
            const iterator = this.runner.run(submission.input);
            let next = iterator.next();
            for (const input of this.startingSteering.splice(0)) this.runner.steer(input);
            for (;;) {
              const item = await next;
              if (item.done) break;
              this.event(item.value);
              next = iterator.next();
            }
          }
          this.snapshot.outcome = this.stopped ? "aborted" : (this.snapshot.outcome ?? "completed");
        } catch (error) {
          this.snapshot.error = error instanceof Error ? error.message : String(error);
          this.snapshot.outcome = this.stopped ? "aborted" : "failed";
        } finally {
          // Steering accepted after the final input boundary becomes ordinary queued work.
          const remaining = [
            ...this.startingSteering.splice(0),
            ...(this.runner?.takeUnconsumedSteering() ?? []),
          ];
          this.queue.unshift(
            ...remaining.flatMap((input) => {
              const item = this.steering.get(input.id);
              return item ? [item] : [];
            }),
          );
          this.steering.clear();
          this.runner = undefined;
          this.updateAssistant((message) => ({
            ...message,
            thinkingSteps: this.snapshot.thinkingSteps.map((step) => ({ ...step, status: "done" })),
          }));
          this.snapshot.activeRunId = undefined;
          this.snapshot.activeMessageId = undefined;
          this.snapshot.approval = undefined;
          this.snapshot.status = { type: "idle" };
          this.syncPending();
          this.publish();
          await this.checkpoint();
        }
      }
    } catch (error) {
      this.storageError(error);
    } finally {
      this.draining = false;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
      if (last) this.options.onIdle?.(last);
    }
  }
}

export const emptySessionSnapshot = (
  sessionId: string,
  messages: ChatMessage[] = [],
): SessionSnapshot => ({
  sessionId,
  revision: 0,
  messages,
  pending: [],
  status: { type: "idle" },
  thinkingSteps: [],
  thinkingCollapsed: false,
});
