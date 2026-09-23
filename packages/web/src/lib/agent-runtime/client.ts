import type { AgentCommand, AgentResponse, SessionSnapshot } from "./protocol";
import { emptySessionSnapshot } from "./sessionRuntime";

export type ToolHost = (
  request: Extract<AgentResponse, { type: "tool" }>,
  signal: AbortSignal,
) => Promise<unknown>;
let worker: SharedWorker | undefined;
let toolHost: ToolHost | undefined;
const snapshots = new Map<string, SessionSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const requests = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>();
const calls = new Map<string, AbortController>();
const approvals = new Map<string, (decision: "allow_once" | "allow_session" | "deny") => void>();

function connection(): MessagePort {
  if (worker) return worker.port;
  if (typeof SharedWorker === "undefined")
    throw new Error(
      "This browser does not support shared chat sessions. Use a browser with SharedWorker support.",
    );
  worker = new SharedWorker(new URL("../../workers/agent.shared-worker.ts", import.meta.url), {
    type: "module",
    name: "memora-agent-v2",
    extendedLifetime: true,
  });
  worker.port.onmessage = (event: MessageEvent<AgentResponse>) => {
    const message = event.data;
    if (message.type === "reply") {
      const request = requests.get(message.requestId);
      if (!request) return;
      requests.delete(message.requestId);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve();
    } else if (message.type === "snapshot") {
      const current = snapshots.get(message.snapshot.sessionId);
      if (current && current.revision > message.snapshot.revision) return;
      snapshots.set(message.snapshot.sessionId, message.snapshot);
      listeners.get(message.snapshot.sessionId)?.forEach((listener) => listener());
    } else if (message.type === "tool") {
      const controller = new AbortController();
      calls.set(message.callId, controller);
      void Promise.resolve()
        .then(() => {
          if (!toolHost) throw new Error("Workspace tool service is unavailable.");
          return toolHost(message, controller.signal);
        })
        .then(
          (result) => command({ type: "tool-result", callId: message.callId, result }),
          (error: unknown) =>
            command({
              type: "tool-result",
              callId: message.callId,
              error: error instanceof Error ? error.message : String(error),
            }),
        )
        .catch(console.error)
        .finally(() => calls.delete(message.callId));
    } else if (message.type === "cancel-tool") {
      calls.get(message.callId)?.abort();
      approvals.get(message.callId)?.("deny");
      approvals.delete(message.callId);
    } else if (message.type === "approval-result") {
      approvals.get(message.callId)?.(message.decision);
      approvals.delete(message.callId);
    } else if (message.type === "memory-updated") {
      window.dispatchEvent(
        new CustomEvent("memora-agent-memory-updated", { detail: message.sessionId }),
      );
    }
  };
  worker.onerror = () => {
    const error = new Error("The chat worker stopped. Reload Memora to reconnect.");
    for (const request of requests.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    requests.clear();
    for (const [id, snapshot] of snapshots) {
      snapshots.set(id, {
        ...snapshot,
        activeRunId: undefined,
        status: { type: "idle" },
        error: error.message,
        outcome: "interrupted",
      });
      listeners.get(id)?.forEach((listener) => listener());
    }
  };
  worker.port.start();
  window.addEventListener("pagehide", () => {
    worker?.port.postMessage({ type: "disconnect", requestId: crypto.randomUUID() });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
      worker?.port.postMessage({ type: "checkpoint", requestId: crypto.randomUUID() });
  });
  window.addEventListener("pageshow", () => {
    if (toolHost) void command({ type: "host-ready" }).catch(console.error);
    for (const sessionId of listeners.keys())
      void command({ type: "subscribe", sessionId }).catch(console.error);
  });
  return worker.port;
}

export function command(command: AgentCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = connection();
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      requests.delete(requestId);
      reject(new Error("Chat worker did not acknowledge the request. Reconnect before retrying."));
    }, 30_000);
    requests.set(requestId, { resolve, reject, timer });
    try {
      port.postMessage({ ...command, requestId });
    } catch (error) {
      clearTimeout(timer);
      requests.delete(requestId);
      reject(error);
    }
  });
}

export function getSnapshot(sessionId: string): SessionSnapshot {
  let snapshot = snapshots.get(sessionId);
  if (!snapshot) {
    snapshot = emptySessionSnapshot(sessionId);
    snapshots.set(sessionId, snapshot);
  }
  return snapshot;
}

export function subscribe(sessionId: string, listener: () => void, storage?: "memory"): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  void command({ type: "subscribe", sessionId, storage }).catch((error: unknown) => {
    snapshots.set(sessionId, {
      ...getSnapshot(sessionId),
      error: error instanceof Error ? error.message : String(error),
    });
    listeners.get(sessionId)?.forEach((notify) => notify());
  });
  return () => {
    set.delete(listener);
    if (!set.size) {
      listeners.delete(sessionId);
      void command({ type: "unsubscribe", sessionId }).catch(console.error);
    }
  };
}

export function registerToolHost(host: ToolHost): () => void {
  toolHost = host;
  void command({ type: "host-ready" }).catch(console.error);
  return () => {
    if (toolHost === host) toolHost = undefined;
  };
}

export function requestToolApproval(
  callId: string,
  request: import("@/lib/chat/tools/shared").WriteApprovalRequest,
  signal: AbortSignal,
): Promise<"allow_once" | "allow_session" | "deny"> {
  if (signal.aborted) return Promise.resolve("deny");
  return new Promise((resolve, reject) => {
    const abort = () => {
      approvals.delete(callId);
      resolve("deny");
    };
    signal.addEventListener("abort", abort, { once: true });
    approvals.set(callId, (decision) => {
      signal.removeEventListener("abort", abort);
      resolve(decision);
    });
    void command({ type: "request-approval", callId, request }).catch((error: unknown) => {
      approvals.delete(callId);
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}
