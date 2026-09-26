import {
  COMPACTION_KEY,
  createAgent,
  createInMemoryAdapter,
  rebaseCompaction,
  type CompactionState,
  type PersistenceAdapter,
} from "@memora/ai-core";
import { createRemotePiRuntime } from "@memora/ai-provider-pi";
import * as v from "valibot";
import { createOpfsSessionPersistenceAdapter } from "@/lib/chat/opfsSessionPersistenceAdapter";
import {
  loadChatSession,
  updateChatSession,
  deleteChatSession,
} from "@/lib/chat/chatSessionStorage";
import { historyBeforeReplay } from "@/lib/agent-runtime/replayHistory";
import { SessionRuntime, emptySessionSnapshot } from "@/lib/agent-runtime/sessionRuntime";
import type {
  AgentRequest,
  AgentResponse,
  AgentSubmission,
  SessionSnapshot,
} from "@/lib/agent-runtime/protocol";
import type { WriteApprovalDecision } from "@/lib/chat/tools/shared";

const ports = new Map<MessagePort, Set<string>>();
const hosts = new Set<MessagePort>();
const transientAdapters = new Map<string, PersistenceAdapter>();
const sessions = new Map<string, Promise<SessionRuntime>>();
const toolCalls = new Map<
  string,
  {
    port: MessagePort;
    sessionId: string;
    runId: string;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const deletedSessions = new Set<string>();
const commands = new Map<string, Promise<void>>();
const approvals = new Map<string, { callId: string; sessionId: string }>();
const allowedSessions = new Set<string>();
const post = (port: MessagePort, message: AgentResponse): void => port.postMessage(message);
const running = new Set<string>();
const postRunning = (port: MessagePort): void =>
  post(port, { type: "running", sessionIds: [...running] });
const publish = (snapshot: SessionSnapshot): void => {
  const isRunning = Boolean(snapshot.activeRunId || snapshot.pending.length);
  if (isRunning !== running.has(snapshot.sessionId)) {
    if (isRunning) running.add(snapshot.sessionId);
    else running.delete(snapshot.sessionId);
    for (const port of ports.keys()) postRunning(port);
    if (
      !isRunning &&
      snapshot.outcome === "completed" &&
      !transientAdapters.has(snapshot.sessionId)
    )
      void loadChatSession(snapshot.sessionId)
        .then((record) => {
          if (!record) return;
          for (const port of ports.keys())
            post(port, { type: "finished", sessionId: snapshot.sessionId, title: record.title });
        })
        .catch(console.error);
  }
  for (const [port, subscriptions] of ports) {
    if (subscriptions.has(snapshot.sessionId)) post(port, { type: "snapshot", snapshot });
  }
};
const checkpointSessions = async (): Promise<void> => {
  await Promise.all([...sessions.values()].map(async (session) => (await session).checkpoint()));
};

const finishTool = (callId: string, result?: unknown, error?: string): void => {
  const call = toolCalls.get(callId);
  if (!call) return;
  clearTimeout(call.timer);
  toolCalls.delete(callId);
  for (const [id, approval] of approvals) if (approval.callId === callId) approvals.delete(id);
  if (error) call.reject(new Error(error));
  else call.resolve(result);
};

const invokeTool = (
  sessionId: string,
  submission: AgentSubmission,
  name: string,
  args: unknown,
): Promise<unknown> => {
  const port = hosts.values().next().value as MessagePort | undefined;
  if (!port)
    return Promise.reject(
      new Error("No connected workspace can execute tools. Reopen Memora and retry."),
    );
  const callId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      post(port, { type: "cancel-tool", callId });
      finishTool(callId, undefined, "Tool connection timed out; its outcome may be unknown.");
    }, 300_000);
    toolCalls.set(callId, { port, sessionId, runId: submission.id, resolve, reject, timer });
    post(port, {
      type: "tool",
      callId,
      runId: submission.id,
      sessionId,
      name,
      args: args as Record<string, unknown>,
      scope: submission.scope,
    });
  });
};

const getSession = (sessionId: string, storage?: "memory"): Promise<SessionRuntime> => {
  let promise = sessions.get(sessionId);
  if (promise) return promise;
  promise = (async () => {
    const memoryAdapter = storage === "memory" ? createInMemoryAdapter() : undefined;
    if (memoryAdapter) transientAdapters.set(sessionId, memoryAdapter);
    const record = memoryAdapter ? null : await loadChatSession(sessionId);
    const stored = record?.agentStore["runtime"]?.snapshot as SessionSnapshot | undefined;
    const snapshot = stored
      ? { ...stored, sessionId, messages: record?.messages ?? stored.messages }
      : emptySessionSnapshot(sessionId, record?.messages ?? []);
    if (snapshot.activeRunId || snapshot.pending.length) {
      for (const item of snapshot.pending) {
        if (!snapshot.messages.some((message) => message.id === item.message.id))
          snapshot.messages.push(item.message);
      }
      snapshot.pending = [];
      snapshot.outcome = "interrupted";
      snapshot.error =
        "Execution was interrupted. Retry the message to continue. Queued messages were not executed.";
      snapshot.activeRunId = undefined;
      snapshot.activeMessageId = undefined;
      snapshot.approval = undefined;
      snapshot.status = { type: "idle" };
    }
    const runtime = new SessionRuntime({
      snapshot,
      publish,
      save: async (next) => {
        if (memoryAdapter) return;
        await updateChatSession(sessionId, (session) => ({
          ...session,
          title:
            session.title === "New session"
              ? next.messages.find((message) => message.role === "user")?.content.slice(0, 80) ||
                session.title
              : session.title,
          messages: next.messages,
          agentStore: { ...session.agentStore, runtime: { snapshot: next } },
        }));
      },
      createRunner: async (submission) => {
        const adapter = memoryAdapter ?? createOpfsSessionPersistenceAdapter(sessionId);
        const memory = await adapter.load(`memora-chat:${sessionId}`, "memory");
        const persistence: PersistenceAdapter = {
          save: (agentId, key, value) => adapter.save(agentId, key, value),
          remove: (agentId, key) => adapter.remove(agentId, key),
          list: (agentId) => adapter.list(agentId),
          grep: (agentId, pattern) => adapter.grep(agentId, pattern),
          load: async <T>(agentId: string, key: string): Promise<T | null> =>
            key === "memory"
              ? (structuredClone(memory) as T | null)
              : adapter.load<T>(agentId, key),
        };
        const model = createRemotePiRuntime(submission.provider);
        const agent = createAgent({ config: submission.config, ...model, persistence });
        for (const prompt of submission.prompts) agent.addPromptSegment(prompt);
        for (const tool of submission.tools)
          agent.registerTool({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: v.unknown(),
            jsonSchema: tool.parameters,
            execute: (args) => invokeTool(sessionId, submission, tool.name, args),
          });
        await agent.init();
        return agent;
      },
    });
    if (snapshot.outcome === "interrupted") await runtime.checkpoint();
    return runtime;
  })();
  sessions.set(sessionId, promise);
  void promise.catch(() => sessions.delete(sessionId));
  return promise;
};

const cancelTools = (sessionId: string, runId?: string): void => {
  for (const [callId, call] of toolCalls) {
    if (call.sessionId === sessionId && (!runId || call.runId === runId)) {
      post(call.port, { type: "cancel-tool", callId });
      finishTool(
        callId,
        undefined,
        "Tool interrupted; any operation already started may have completed.",
      );
    }
  }
};

async function execute(port: MessagePort, request: AgentRequest): Promise<void> {
  if (request.type === "host-ready") {
    hosts.add(port);
    return;
  }
  if (request.type === "disconnect") {
    hosts.delete(port);
    ports.get(port)?.clear();
    for (const [id, call] of toolCalls)
      if (call.port === port)
        finishTool(id, undefined, "Workspace connection closed; tool outcome is unknown.");
    if (hosts.size === 0) await checkpointSessions();
    return;
  }
  if (request.type === "checkpoint") {
    await checkpointSessions();
    return;
  }
  if (request.type === "tool-result") {
    if (toolCalls.get(request.callId)?.port === port)
      finishTool(request.callId, request.result, request.error);
    return;
  }
  if (request.type === "memory-updated") {
    for (const [subscriber, subscriptions] of ports) {
      if (subscriptions.has(request.sessionId))
        post(subscriber, { type: "memory-updated", sessionId: request.sessionId });
    }
    return;
  }
  if (request.type === "request-approval") {
    const call = toolCalls.get(request.callId);
    if (!call || call.port !== port) return;
    if (allowedSessions.has(call.sessionId)) {
      post(port, { type: "approval-result", callId: request.callId, decision: "allow_session" });
      return;
    }
    const runtime = await getSession(call.sessionId);
    if (!toolCalls.has(request.callId)) return;
    const id = crypto.randomUUID();
    approvals.set(id, { callId: request.callId, sessionId: call.sessionId });
    runtime.snapshot = {
      ...runtime.snapshot,
      approval: { id, request: request.request },
      revision: runtime.snapshot.revision + 1,
    };
    publish(runtime.snapshot);
    return;
  }
  if (request.type === "unsubscribe") {
    ports.get(port)?.delete(request.sessionId);
    return;
  }
  if (deletedSessions.has(request.sessionId)) throw new Error("This session has been deleted.");
  const runtime = await getSession(
    request.sessionId,
    "storage" in request ? request.storage : undefined,
  );
  switch (request.type) {
    case "subscribe":
      ports.get(port)?.add(request.sessionId);
      post(port, { type: "snapshot", snapshot: runtime.snapshot });
      break;
    case "submit":
      await runtime.submit(request.submission);
      break;
    case "abort":
      runtime.abort(request.runId);
      cancelTools(request.sessionId, request.runId);
      break;
    case "approval": {
      const approval = approvals.get(request.approvalId);
      if (!approval || approval.sessionId !== request.sessionId) break;
      approvals.delete(request.approvalId);
      const call = toolCalls.get(approval.callId);
      if (request.decision === "allow_session") allowedSessions.add(request.sessionId);
      if (call)
        post(call.port, {
          type: "approval-result",
          callId: approval.callId,
          decision: request.decision as WriteApprovalDecision,
        });
      runtime.snapshot = {
        ...runtime.snapshot,
        approval: undefined,
        revision: runtime.snapshot.revision + 1,
      };
      publish(runtime.snapshot);
      break;
    }
    case "steer-pending":
      await runtime.steerPending(request.submissionId);
      break;
    case "patch-message":
      runtime.patchMessage(request.message);
      break;
    case "reset": {
      if (runtime.snapshot.activeRunId || runtime.snapshot.pending.length)
        throw new Error("Stop the session and let queued messages finish before editing history.");
      const agentKey = `memora-chat:${request.sessionId}`;
      const transient = transientAdapters.get(request.sessionId);
      if (transient) {
        const history = historyBeforeReplay(await transient.load(agentKey, "history"), request);
        await transient.save(agentKey, "history", history);
        await transient.save(
          agentKey,
          COMPACTION_KEY,
          rebaseCompaction(
            await transient.load<CompactionState>(agentKey, COMPACTION_KEY),
            history,
          ),
        );
      } else
        await updateChatSession(request.sessionId, (session) => {
          const store = session.agentStore[agentKey];
          const history = historyBeforeReplay(store?.history, request);
          return {
            ...session,
            messages: request.messages,
            agentStore: {
              ...session.agentStore,
              [agentKey]: {
                ...store,
                history,
                [COMPACTION_KEY]: rebaseCompaction(
                  store?.[COMPACTION_KEY] as CompactionState | undefined,
                  history,
                ),
              },
            },
          };
        });
      runtime.replaceSnapshot({
        ...emptySessionSnapshot(request.sessionId, request.messages),
        revision: runtime.snapshot.revision + 1,
      });
      await runtime.checkpoint();
      break;
    }
    case "delete":
      deletedSessions.add(request.sessionId);
      cancelTools(request.sessionId);
      await runtime.stopAll();
      if (transientAdapters.has(request.sessionId)) transientAdapters.delete(request.sessionId);
      else await deleteChatSession(request.sessionId);
      allowedSessions.delete(request.sessionId);
      sessions.delete(request.sessionId);
      if (running.delete(request.sessionId)) for (const port of ports.keys()) postRunning(port);
      break;
  }
}

const scope = self as unknown as { onconnect: (event: MessageEvent) => void };
scope.onconnect = (event) => {
  const port = event.ports[0];
  if (!port) return;
  ports.set(port, new Set());
  postRunning(port);
  port.onmessage = (message: MessageEvent<AgentRequest>) => {
    const request = message.data;
    const sessionId = "sessionId" in request ? request.sessionId : undefined;
    const previous = sessionId ? (commands.get(sessionId) ?? Promise.resolve()) : Promise.resolve();
    const operation = previous.catch(() => {}).then(() => execute(port, request));
    if (sessionId) commands.set(sessionId, operation);
    void operation.then(
      () => post(port, { type: "reply", requestId: request.requestId }),
      (error: unknown) =>
        post(port, {
          type: "reply",
          requestId: request.requestId,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
  };
  port.start();
};
