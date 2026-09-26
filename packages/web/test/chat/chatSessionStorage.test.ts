import { expect, test, vi } from "vite-plus/test";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("@memora/fs", () => ({
  dir: () => ({ create: async () => undefined }),
  file: (path: string) => ({
    exists: async () => files.has(path),
    text: async () => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`missing ${path}`);
      return text;
    },
    remove: async () => {
      files.delete(path);
    },
  }),
  write: async (path: string, data: string) => {
    files.set(path, data);
  },
  glob: async () => [...files.keys()].filter((path) => path.endsWith(".json")),
}));
vi.mock("@/lib/chat/chatImageAttachments", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/chat/chatImageAttachments")>()),
  deleteChatSessionAssets: async () => undefined,
}));

import {
  createChatSession,
  deleteChatSession,
  ensureChatSession,
  listChatSessions,
  updateChatSession,
} from "@/lib/chat/chatSessionStorage";

test("a write that lands after deletion does not recreate the session", async () => {
  const session = await createChatSession();
  await deleteChatSession(session.id);

  // A title that finished generating after the user deleted the session.
  await expect(
    updateChatSession(session.id, (record) => ({ ...record, title: "Late title" })),
  ).rejects.toThrow("This session has been deleted.");
  await expect(ensureChatSession(session.id)).rejects.toThrow("This session has been deleted.");
  expect(await listChatSessions()).toEqual([]);
});

test("an unknown session is still created on first write", async () => {
  const record = await updateChatSession("fresh", (base) => ({ ...base, title: "Fresh" }));
  expect(record.title).toBe("Fresh");
});
