# Agent session runtime

The chat runtime is hosted by `src/workers/agent.shared-worker.ts`. Every connected page uses the same named worker. Each session has one `SessionRuntime`; sessions run concurrently, while a session runs one task at a time.

## Message delivery

Idle sessions start ordinary work. During execution, pending messages wait in receipt order and steer messages join the next model request in receipt order. Steer can pass an earlier pending message. The runtime decides delivery using its current state, so a late steer starts new work if the preceding task has already ended. Accepted steer messages that have not reached a model call when execution stops remain queued for execution.

Settings provides a global pending/steer default. The composer exposes a single-message override while execution is active. Changing the setting does not change messages already accepted. Stop targets a run ID, so a delayed stop cannot cancel its successor; after stopping or failure, pending work continues. Switching session or unsubscribing does not stop work. Deleting a session stops its current task, drops its queue, waits for execution to settle, and removes storage.

## Execution and data ownership

The worker creates remote model runtimes and executes `@memora/ai-core`. Inputs, model configuration, prompt segments, and reference scope cross the transport as data. Credential-bearing configuration remains in memory. Long-term preference input is captured when a task starts. Existing tools execute through an application-shell service using the existing LiveStore and model services, independent of the currently displayed chat. Tool arguments are validated at that service. A tool request is sent to one connected host and is never blindly retried on another host after an unknown outcome.

Write approval belongs to the worker session, can be viewed from another subscribed page, and accepts one decision. Allow-session applies only to that session. Stopping cancels outstanding approval requests. Tool execution already underway may have produced effects when interrupted; cancellation does not undo them.

The worker persists message projections and execution snapshots in the session’s existing OPFS record. Cross-context session mutations use a Web Lock. Stream snapshots are checkpointed periodically and task boundaries are explicitly saved. On a fresh worker, unfinished tasks are marked interrupted; queued message contents and attachments are retained for manual resend. No credentials or serialized provider configuration enter these snapshots. This is not yet a complete execution trace or automatic recovery system.

The page requests a checkpoint when it becomes hidden, and the worker checkpoints active sessions when the last connected application page reports that it is leaving. `extendedLifetime: true` asks the browser to keep the SharedWorker alive briefly after its last owner closes. Reopening while the same worker survives reattaches to the running session; after the worker is terminated, the fresh worker follows the interrupted behavior above. Page lifecycle signals may be missed, so periodic checkpoints remain necessary. This lifetime option does not keep work running indefinitely after all tabs close.

## Follow-up scope

Complete observability will record each effective model request, raw and truncated tool results, stable event sequences, attempts, and query/export APIs. Agent evaluation will use fixed versioned course transcripts, independent sessions and memory, and concurrent runs, scoring timestamp evidence, answer key points, and citation support; ASR quality is excluded from those scores.

The event contract, corpus format, scoring dimensions, and recovery boundary are specified in [Agent observability and evaluation, first version](agent-observability-evaluation.md).
