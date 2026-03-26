import type { PersistenceAdapter } from "@memora/ai-core";
import {
  ensureChatSession,
  loadChatSession,
  updateChatSession,
} from "@/lib/chat/chatSessionStorage";
import {
  clearGlobalMemory,
  loadGlobalMemory,
  loadGlobalMemoryData,
  loadPersonalityDoc,
  normalizePersonalityText,
  saveGlobalMemory,
} from "@/lib/settings/personalityStorage";

const cloneData = <T>(value: T): T => {
  return structuredClone(value);
};

const MEMORY_KEY = "memory";
const PERSONALITY_KEY = "personality";

export const createOpfsSessionPersistenceAdapter = (sessionId: string): PersistenceAdapter => {
  return {
    save: async (agentId, key, data) => {
      if (key === MEMORY_KEY) {
        const nextMemory =
          typeof data === "object" && data !== null ? { ...(data as Record<string, unknown>) } : {};
        await saveGlobalMemory(nextMemory);
        return;
      }

      await updateChatSession(sessionId, (session) => {
        const nextStore = { ...session.agentStore };
        const agentData = { ...nextStore[agentId] };
        agentData[key] = cloneData(data);
        nextStore[agentId] = agentData;
        return {
          ...session,
          agentStore: nextStore,
        };
      });
    },

    load: async <T = unknown>(agentId: string, key: string): Promise<T | null> => {
      if (key === MEMORY_KEY) {
        const globalMemory = await loadGlobalMemory();
        if (globalMemory) {
          return cloneData(globalMemory) as T;
        }
        const personalityDoc = await loadPersonalityDoc();
        const personalityText = normalizePersonalityText(personalityDoc);
        if (!personalityText) {
          return null;
        }
        const derivedMemory: Record<string, unknown> = {
          [PERSONALITY_KEY]: personalityText,
          notices: [],
        };
        await saveGlobalMemory(derivedMemory);
        return cloneData(derivedMemory) as T;
      }

      const session = await loadChatSession(sessionId);
      if (!session) return null;
      const value = session.agentStore[agentId]?.[key];
      if (value === undefined) return null;
      return cloneData(value) as T;
    },

    remove: async (agentId, key) => {
      if (key === MEMORY_KEY) {
        await clearGlobalMemory();
        return;
      }

      await updateChatSession(sessionId, (session) => {
        const nextStore = { ...session.agentStore };
        const agentData = { ...nextStore[agentId] };
        delete agentData[key];
        nextStore[agentId] = agentData;
        return {
          ...session,
          agentStore: nextStore,
        };
      });
    },

    list: async (agentId) => {
      const session = await loadChatSession(sessionId);
      const sessionKeys = session ? Object.keys(session.agentStore[agentId] ?? {}) : [];
      const globalMemory = await loadGlobalMemoryData();
      const personalityDoc = await loadPersonalityDoc();
      const hasGlobalMemory = !!globalMemory || normalizePersonalityText(personalityDoc).length > 0;

      if (!hasGlobalMemory) {
        return sessionKeys;
      }

      return sessionKeys.includes(MEMORY_KEY) ? sessionKeys : [...sessionKeys, MEMORY_KEY];
    },

    grep: async (agentId, pattern) => {
      await ensureChatSession(sessionId);
      const session = await loadChatSession(sessionId);
      const regex = new RegExp(pattern, "gi");
      const entries = session?.agentStore[agentId] ?? {};
      const results: Array<{ key: string; matches: string[] }> = [];

      for (const [key, value] of Object.entries(entries)) {
        const text = JSON.stringify(value);
        const matches: string[] = [];
        regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          matches.push(match[0]);
        }

        if (matches.length > 0) {
          results.push({ key, matches });
        }
      }

      const globalMemory = await loadGlobalMemory();
      const personalityDoc = await loadPersonalityDoc();
      const fallbackPersonality = normalizePersonalityText(personalityDoc);
      const derivedMemory =
        globalMemory ??
        (fallbackPersonality ? { [PERSONALITY_KEY]: fallbackPersonality, notices: [] } : null);

      if (derivedMemory) {
        const serialized = JSON.stringify(derivedMemory);
        const matches: string[] = [];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(serialized)) !== null) {
          matches.push(match[0]);
        }
        if (matches.length > 0) {
          results.push({ key: MEMORY_KEY, matches });
        }
      }

      return results;
    },
  };
};
