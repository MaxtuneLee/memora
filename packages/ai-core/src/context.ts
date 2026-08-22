import type { AgentMessage, PersistenceAdapter } from "./types";
import { generateId, now } from "./utils";

const HISTORY_KEY = "history";
const MEMORY_KEY = "memory";

export class ContextManager {
  private messages: AgentMessage[] = [];
  private loaded = false;

  constructor(
    private agentId: string,
    private persistence: PersistenceAdapter,
  ) {}

  async load(): Promise<void> {
    const history = await this.persistence.load<AgentMessage[]>(this.agentId, HISTORY_KEY);
    this.messages = history ?? [];
    this.loaded = true;
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error("ContextManager not loaded. Call load() first.");
    }
  }

  async append(message: AgentMessage): Promise<void> {
    this.ensureLoaded();
    this.messages.push(message);
    await this.persistence.save(this.agentId, HISTORY_KEY, this.messages);
  }

  async replaceMessages(messages: AgentMessage[]): Promise<void> {
    this.ensureLoaded();
    this.messages = structuredClone(messages);
    await this.persistence.save(this.agentId, HISTORY_KEY, this.messages);
  }

  getMessages(): AgentMessage[] {
    this.ensureLoaded();
    return [...this.messages];
  }

  getLastN(n: number): AgentMessage[] {
    this.ensureLoaded();
    return this.messages.slice(-n);
  }

  async clear(): Promise<void> {
    this.messages = [];
    await this.persistence.save(this.agentId, HISTORY_KEY, this.messages);
  }

  async truncate(maxMessages: number): Promise<void> {
    this.ensureLoaded();
    if (this.messages.length > maxMessages) {
      this.messages = this.messages.slice(-maxMessages);
      await this.persistence.save(this.agentId, HISTORY_KEY, this.messages);
    }
  }

  // Memory (long-term facts)

  async saveMemory(key: string, data: unknown): Promise<void> {
    const memories =
      (await this.persistence.load<Record<string, unknown>>(this.agentId, MEMORY_KEY)) ?? {};
    memories[key] = data;
    await this.persistence.save(this.agentId, MEMORY_KEY, memories);
  }

  async loadMemory<T = unknown>(key: string): Promise<T | null> {
    const memories = await this.persistence.load<Record<string, unknown>>(this.agentId, MEMORY_KEY);
    if (!memories || !(key in memories)) return null;
    return memories[key] as T;
  }

  async listMemoryKeys(): Promise<string[]> {
    const memories = await this.persistence.load<Record<string, unknown>>(this.agentId, MEMORY_KEY);
    return memories ? Object.keys(memories) : [];
  }

  // Grep / Relevance

  async grep(pattern: string): Promise<Array<{ key: string; matches: string[] }>> {
    return this.persistence.grep(this.agentId, pattern);
  }

  async getRelevantContext(): Promise<string[]> {
    const keys = await this.persistence.list(this.agentId);
    const results: string[] = [];
    for (const key of keys) {
      if (key === HISTORY_KEY) continue;
      const data = await this.persistence.load(this.agentId, key);
      if (data !== null) {
        results.push(typeof data === "string" ? data : JSON.stringify(data));
      }
    }
    return results;
  }

  // Helpers

  createMessage(role: AgentMessage["role"], text: string): AgentMessage {
    return {
      id: generateId(),
      role,
      content: [{ type: "text", text }],
      createdAt: now(),
    };
  }
}

export const createContextManager = (
  agentId: string,
  persistence: PersistenceAdapter,
): ContextManager => {
  return new ContextManager(agentId, persistence);
};
