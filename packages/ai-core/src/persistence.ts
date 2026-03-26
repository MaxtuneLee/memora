import type { PersistenceAdapter } from "./types";

export class InMemoryAdapter implements PersistenceAdapter {
  private store = new Map<string, Map<string, unknown>>();

  private getAgentStore(agentId: string): Map<string, unknown> {
    let agentStore = this.store.get(agentId);
    if (!agentStore) {
      agentStore = new Map();
      this.store.set(agentId, agentStore);
    }
    return agentStore;
  }

  async save(agentId: string, key: string, data: unknown): Promise<void> {
    this.getAgentStore(agentId).set(key, structuredClone(data));
  }

  async load<T = unknown>(agentId: string, key: string): Promise<T | null> {
    const value = this.getAgentStore(agentId).get(key);
    if (value === undefined) return null;
    return structuredClone(value) as T;
  }

  async remove(agentId: string, key: string): Promise<void> {
    this.getAgentStore(agentId).delete(key);
  }

  async list(agentId: string): Promise<string[]> {
    return Array.from(this.getAgentStore(agentId).keys());
  }

  async grep(agentId: string, pattern: string): Promise<Array<{ key: string; matches: string[] }>> {
    const results: Array<{ key: string; matches: string[] }> = [];
    const regex = new RegExp(pattern, "gi");
    const agentStore = this.getAgentStore(agentId);

    for (const [key, value] of agentStore) {
      const serialized = JSON.stringify(value);
      const matches: string[] = [];
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(serialized)) !== null) {
        matches.push(match[0]);
      }
      if (matches.length > 0) {
        results.push({ key, matches });
      }
    }

    return results;
  }
}

export const createInMemoryAdapter = (): PersistenceAdapter => {
  return new InMemoryAdapter();
};
