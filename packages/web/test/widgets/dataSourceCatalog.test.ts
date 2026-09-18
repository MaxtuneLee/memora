import { beforeEach, expect, test, vi } from "vite-plus/test";

const testState = vi.hoisted(() => {
  const fileTextByPath = new Map<string, string>();
  const file = vi.fn((path: string) => ({
    path,
    text: vi.fn(async () => {
      const text = fileTextByPath.get(path);
      if (text === undefined) {
        throw new Error(`Missing file content for ${path}`);
      }
      return text;
    }),
  }));
  const listChatSessions = vi.fn();

  return { file, fileTextByPath, listChatSessions };
});

vi.mock("@memora/fs", () => ({ file: testState.file }));
vi.mock("@/lib/chat/chatSessionStorage", () => ({ listChatSessions: testState.listChatSessions }));

import { desktopFilesQuery$ } from "@/lib/desktop/queries";
import { activeFilesQuery$ } from "@/lib/library/queries";
import { resolveDataSource } from "@/lib/widgets/dataSourceCatalog";

const buildFileRow = (overrides: Record<string, unknown> = {}) => ({
  id: "file-1",
  name: "Today Tasks",
  type: "document",
  mimeType: "text/markdown",
  sizeBytes: 10,
  storageType: "opfs",
  storagePath: "/files/file-1/file-1.md",
  parentId: null,
  positionX: null,
  positionY: null,
  transcriptPath: null,
  indexSummary: null,
  durationSec: null,
  createdAt: new Date(1_000),
  updatedAt: new Date(2_000),
  ...overrides,
});

beforeEach(() => {
  testState.fileTextByPath.clear();
  testState.file.mockClear();
  testState.listChatSessions.mockReset();
  vi.unstubAllGlobals();
});

test("throws for a data source name outside the catalog", async () => {
  const store = { query: vi.fn() };

  await expect(resolveDataSource("raw-sql" as never, store)).rejects.toThrow(/Unknown data source/);
});

test("recentFiles resolves the most recently updated active files by catalog name", async () => {
  const rows = [
    buildFileRow({ id: "a", name: "A", updatedAt: new Date(3_000) }),
    buildFileRow({ id: "b", name: "B", updatedAt: new Date(2_000) }),
  ];
  const store = { query: vi.fn((query: unknown) => (query === desktopFilesQuery$ ? rows : [])) };

  const data = await resolveDataSource("recentFiles", store, { limit: 1 });

  expect(data).toEqual({ files: [{ id: "a", name: "A", type: "document", updatedAt: 3_000 }] });
});

test("recentFiles defaults to a fixed limit when none is given", async () => {
  const rows = Array.from({ length: 8 }, (_, index) => buildFileRow({ id: `file-${index}` }));
  const store = { query: vi.fn((query: unknown) => (query === desktopFilesQuery$ ? rows : [])) };

  const data = (await resolveDataSource("recentFiles", store)) as { files: unknown[] };

  expect(data.files).toHaveLength(5);
});

test("recentFiles never resolves via a query other than the catalog's own", async () => {
  const store = { query: vi.fn((_query: unknown) => []) };

  await resolveDataSource("recentFiles", store);

  for (const call of store.query.mock.calls) {
    expect(call[0]).toBe(desktopFilesQuery$);
  }
});

test("todoProgress resolves counts from the todo document when one exists", async () => {
  const todoRow = buildFileRow({
    id: "todo-doc",
    storagePath: "/files/todo-doc/todo-doc.md",
    updatedAt: new Date(5_000),
  });
  testState.fileTextByPath.set(
    todoRow.storagePath as string,
    ["# Today Tasks", "", "## Open", "- [ ] one", "", "## Done", "- [x] two", ""].join("\n"),
  );
  const store = {
    query: vi.fn((query: unknown) => (query === activeFilesQuery$ ? [todoRow] : [])),
  };

  const data = await resolveDataSource("todoProgress", store);

  expect(data).toEqual({ total: 2, completed: 1 });
});

test("todoProgress resolves to zero counts when there is no todo document", async () => {
  const store = { query: vi.fn(() => []) };

  const data = await resolveDataSource("todoProgress", store);

  expect(data).toEqual({ total: 0, completed: 0 });
});

test("todoProgress never resolves via a query other than the catalog's own", async () => {
  const store = { query: vi.fn((_query: unknown) => []) };

  await resolveDataSource("todoProgress", store);

  for (const call of store.query.mock.calls) {
    expect(call[0]).toBe(activeFilesQuery$);
  }
});

test("chatSessionCount resolves the number of stored chat sessions", async () => {
  testState.listChatSessions.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
  const store = { query: vi.fn() };

  const data = await resolveDataSource("chatSessionCount", store);

  expect(data).toEqual({ count: 2 });
  expect(testState.listChatSessions).toHaveBeenCalledTimes(1);
});

test("chatSessionCount never touches the store's query surface", async () => {
  testState.listChatSessions.mockResolvedValue([]);
  const store = { query: vi.fn() };

  await resolveDataSource("chatSessionCount", store);

  expect(store.query).not.toHaveBeenCalled();
});

test("storageStats resolves usage from the storage manager", async () => {
  vi.stubGlobal("navigator", {
    storage: {
      estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1_000 }),
      persisted: vi.fn().mockResolvedValue(true),
    },
  });
  const store = { query: vi.fn() };

  const data = await resolveDataSource("storageStats", store);

  expect(data).toEqual({
    usedBytes: 100,
    quotaBytes: 1_000,
    isPersistent: true,
    isSupported: true,
  });
});

test("storageStats reports unsupported when the Storage API is unavailable", async () => {
  vi.stubGlobal("navigator", {});
  const store = { query: vi.fn() };

  const data = await resolveDataSource("storageStats", store);

  expect(data).toEqual({
    usedBytes: 0,
    quotaBytes: 0,
    isPersistent: false,
    isSupported: false,
  });
});

test("storageStats never touches the store's query surface", async () => {
  vi.stubGlobal("navigator", {
    storage: {
      estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
      persisted: vi.fn().mockResolvedValue(false),
    },
  });
  const store = { query: vi.fn() };

  await resolveDataSource("storageStats", store);

  expect(store.query).not.toHaveBeenCalled();
});
