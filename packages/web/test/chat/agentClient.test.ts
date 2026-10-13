import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AgentRequest } from "@/lib/agent-runtime/protocol";

const posted: AgentRequest[] = [];
const windowEvents = new Map<string, () => void>();

beforeEach(() => {
  posted.length = 0;
  windowEvents.clear();
  vi.resetModules();
  vi.stubGlobal(
    "SharedWorker",
    class {
      port = { postMessage: (message: AgentRequest) => posted.push(message), start() {} };
    },
  );
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: () => void) => windowEvents.set(type, listener),
  });
  vi.stubGlobal("document", { addEventListener() {} });
});

describe("agent client", () => {
  it("keeps an in-memory session's storage kind on every command, including after page restore", async () => {
    const { command, subscribe } = await import("@/lib/agent-runtime/client");
    subscribe("attempt", () => {}, "memory");
    subscribe("chat", () => {});
    windowEvents.get("pageshow")?.();
    void command({ type: "delete", sessionId: "attempt" }).catch(() => {});
    void command({ type: "delete", sessionId: "chat" }).catch(() => {});

    const storage = (type: string, sessionId: string) =>
      posted
        .filter(
          (message) =>
            message.type === type && "sessionId" in message && message.sessionId === sessionId,
        )
        .map((message) => ("storage" in message ? message.storage : undefined));
    expect(storage("subscribe", "attempt")).toEqual(["memory", "memory"]);
    expect(storage("delete", "attempt")).toEqual(["memory"]);
    expect(storage("subscribe", "chat")).toEqual([undefined, undefined]);
    expect(storage("delete", "chat")).toEqual([undefined]);
  });
});
