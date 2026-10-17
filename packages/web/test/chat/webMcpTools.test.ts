import type { WebMCP } from "@mcp-b/global";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { registerWebMcpTools } from "@/lib/webmcp/tools";
import * as tabAccessRequests from "@/lib/chat/tabAccessRequests";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { defaultSettings, type setting } from "@/livestore/setting";

const state = vi.hoisted(() => ({
  createNote: vi.fn(),
  listChats: vi.fn(async () => [{ id: "session", title: "Private chat" }]),
}));
vi.mock("@/lib/editor/noteCreation", () => ({ createNewMarkdownNote: state.createNote }));
vi.mock("@/lib/chat/chatSessionStorage", () => ({
  listChatSessions: state.listChats,
  loadChatSession: vi.fn(),
}));
vi.mock("@/lib/search/contentSearchService", () => ({ searchContent: vi.fn() }));

let settings: setting;
const store = {
  query: (query: unknown) => (query === settingsDocumentQuery$ ? settings : []),
  commit: vi.fn(),
};
const navigate = vi.fn();

const setup = async () => {
  const lifetime = new AbortController();
  const tools = new Map<string, WebMCP.ModelContextTool>();
  const context = new EventTarget() as WebMCP.ModelContext;
  context.registerTool = vi.fn(
    async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true });
    },
  );
  await registerWebMcpTools(context, store, navigate, lifetime.signal);
  const run = (
    name: string,
    input: Record<string, unknown>,
    signal = new AbortController().signal,
  ) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`Missing tool: ${name}`);
    return Promise.resolve(tool.execute(input, { signal }));
  };
  return { tools, lifetime, run };
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  settings = { ...defaultSettings };
  state.createNote.mockResolvedValue({
    id: "new",
    meta: { name: "Note.md", storagePath: "/files/new/note.md" },
    createdEvent: {
      id: "new",
      name: "Note.md",
      type: "document",
      mimeType: "text/markdown",
      sizeBytes: 4,
      storageType: "opfs",
      storagePath: "/files/new/note.md",
      createdAt: new Date(),
    },
  });
});

describe("WebMCP permissions", () => {
  test("existing settings expose nothing until explicitly enabled", async () => {
    expect((await setup()).tools.size).toBe(0);
  });

  test("read and write exposure are independent, with navigation requiring changes", async () => {
    settings.webMcpEnabled = true;
    const read = await setup();
    expect(read.tools.has("read_file")).toBe(true);
    expect(read.tools.has("create_document")).toBe(false);
    expect(read.tools.has("open_page")).toBe(false);
    expect(read.tools.get("read_file")?.annotations?.readOnlyHint).toBe(true);
    await expect(read.run("list_chat_sessions", {})).resolves.toEqual([
      { id: "session", title: "Private chat" },
    ]);
    read.lifetime.abort();
    expect(read.tools.size).toBe(0);

    settings.webMcpReadEnabled = false;
    settings.webMcpWriteEnabled = true;
    const write = await setup();
    expect([...write.tools.keys()].sort()).toEqual([
      "create_document",
      "modify_text_file",
      "open_page",
    ]);
    expect(write.tools.get("create_document")?.annotations?.readOnlyHint).toBe(false);
    write.lifetime.abort();
  });

  test("cached read callbacks recheck permission and validate input", async () => {
    settings.webMcpEnabled = true;
    const { run, lifetime } = await setup();
    await expect(run("list_chat_sessions", { limit: "invalid" })).rejects.toThrow();
    settings.webMcpReadEnabled = false;
    await expect(run("list_chat_sessions", {})).rejects.toThrow("disabled");
    expect(state.listChats).not.toHaveBeenCalled();
    lifetime.abort();
  });

  test("a read in progress cannot return content after read access is revoked", async () => {
    settings.webMcpEnabled = true;
    const { run, lifetime } = await setup();
    let finish!: (value: { id: string; title: string }[]) => void;
    state.listChats.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = run("list_chat_sessions", {});
    settings.webMcpReadEnabled = false;
    finish([{ id: "session", title: "Private chat" }]);
    await expect(pending).rejects.toThrow("disabled");
    lifetime.abort();
  });

  test("revoking write access while the user approves prevents the write body", async () => {
    settings.webMcpEnabled = true;
    settings.webMcpWriteEnabled = true;
    vi.spyOn(tabAccessRequests, "requestTabAccess").mockImplementationOnce(async () => {
      settings.webMcpWriteEnabled = false;
      return "allow_once";
    });
    const { run, lifetime } = await setup();
    await expect(run("create_document", { name: "Note", content: "text" })).rejects.toThrow(
      "disabled",
    );
    expect(state.createNote).not.toHaveBeenCalled();
    lifetime.abort();
  });

  test("enabling changes still waits for approval, and cancellation prevents the write", async () => {
    settings.webMcpEnabled = true;
    settings.webMcpWriteEnabled = true;
    const { run, lifetime } = await setup();
    const controller = new AbortController();
    const pending = run("create_document", { name: "Note", content: "text" }, controller.signal);
    await Promise.resolve();
    expect(state.createNote).not.toHaveBeenCalled();
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(state.createNote).not.toHaveBeenCalled();
    expect(store.commit).not.toHaveBeenCalled();
    lifetime.abort();
  });

  test("saved write grants work, and disabling WebMCP overrides them", async () => {
    settings.webMcpEnabled = true;
    settings.webMcpWriteEnabled = true;
    settings.permissionGrants = [
      { id: "grant", access: "write", target: { kind: "library" }, createdAt: 0 },
    ];
    const { run, lifetime } = await setup();
    await expect(run("create_document", { name: "Note", content: "text" })).resolves.toMatchObject({
      id: "new",
    });
    expect(state.createNote).toHaveBeenCalledTimes(1);
    settings.webMcpEnabled = false;
    await expect(run("create_document", { name: "Note", content: "text" })).rejects.toThrow(
      "disabled",
    );
    expect(state.createNote).toHaveBeenCalledTimes(1);
    lifetime.abort();
  });

  test("revoking access cancels pending approvals and retained callbacks", async () => {
    settings.webMcpEnabled = true;
    settings.webMcpWriteEnabled = true;
    const { run, lifetime, tools } = await setup();
    const cached = tools.get("create_document");
    if (!cached) throw new Error("Missing create_document");
    const pending = run("create_document", { name: "Note", content: "text" });
    await Promise.resolve();
    lifetime.abort();
    await expect(pending).rejects.toThrow();
    await expect(
      cached.execute(
        { name: "Note", content: "text" },
        {
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow();
    expect(state.createNote).not.toHaveBeenCalled();
  });

  test("navigation accepts app paths and rejects external or backslash paths", async () => {
    settings.webMcpEnabled = true;
    settings.webMcpReadEnabled = false;
    settings.webMcpWriteEnabled = true;
    const { run, lifetime } = await setup();
    for (const path of [
      "https://example.com",
      "//example.com",
      String.raw`/\example.com`,
      "/\n/example.com",
    ]) {
      await expect(run("open_page", { path })).rejects.toThrow("app path");
    }
    expect(navigate).not.toHaveBeenCalled();
    await expect(run("open_page", { path: "/desktop" })).resolves.toEqual({ opened: "/desktop" });
    expect(navigate).toHaveBeenCalledWith("/desktop");
    lifetime.abort();
  });
});
