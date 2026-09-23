import { expect, it } from "vite-plus/test";
import type { AgentCommand, AgentResponse } from "@/lib/agent-runtime/protocol";

it("loads the real SharedWorker, shares state across ports, and persists an independent session", async () => {
  const sessionId = `worker-test-${crypto.randomUUID()}`;
  const url = new URL("../../src/workers/agent.shared-worker.ts", import.meta.url);
  const first = new SharedWorker(url, { type: "module", name: "memora-agent-browser-test" });
  const second = new SharedWorker(url, { type: "module", name: "memora-agent-browser-test" });
  const connect = (worker: SharedWorker) => {
    const snapshots: Extract<AgentResponse, { type: "snapshot" }>[] = [];
    const waiting = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    worker.onerror = (event) => {
      for (const request of waiting.values())
        request.reject(new Error(event.message || "Worker failed"));
    };
    worker.port.onmessage = (event: MessageEvent<AgentResponse>) => {
      const message = event.data;
      if (message.type === "snapshot") snapshots.push(message);
      if (message.type === "reply") {
        const request = waiting.get(message.requestId);
        waiting.delete(message.requestId);
        if (message.error) request?.reject(new Error(message.error));
        else request?.resolve();
      }
    };
    worker.port.start();
    return {
      snapshots,
      command: (command: AgentCommand) =>
        new Promise<void>((resolve, reject) => {
          const requestId = crypto.randomUUID();
          waiting.set(requestId, { resolve, reject });
          worker.port.postMessage({ ...command, requestId });
        }),
    };
  };
  const a = connect(first);
  const b = connect(second);
  try {
    await a.command({ type: "subscribe", sessionId });
    await a.command({
      type: "reset",
      sessionId,
      messages: [{ id: "user", role: "user", content: "Saved in the worker" }],
      history: [
        {
          id: "user",
          role: "user",
          content: [{ type: "text", text: "Saved in the worker" }],
          createdAt: 1,
        },
      ],
    });
    await b.command({ type: "subscribe", sessionId });
    expect(b.snapshots.at(-1)?.snapshot.messages[0].content).toBe("Saved in the worker");
    await a.command({ type: "unsubscribe", sessionId });
    await b.command({
      type: "reset",
      sessionId,
      messages: [{ id: "next", role: "user", content: "Still connected" }],
      history: [],
    });
    await a.command({ type: "subscribe", sessionId });
    expect(a.snapshots.at(-1)?.snapshot.messages[0].content).toBe("Still connected");
  } finally {
    await b.command({ type: "delete", sessionId });
    await a.command({ type: "disconnect" });
    await b.command({ type: "disconnect" });
    first.port.close();
    second.port.close();
  }
}, 30_000);
