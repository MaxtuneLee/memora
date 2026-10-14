import * as v from "valibot";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type {
  AccessAnswer,
  AccessRequest,
  PermissionGrant,
  PermissionMode,
} from "@/lib/chat/permissions";
import { createChatTools } from "@/lib/chat/tools";
import {
  EMPTY_REFERENCE_SCOPE,
  type CreateChatToolsOptions,
  type ResolvedReferenceScope,
} from "@/lib/chat/tools/shared";
import { desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";

const fsFiles = new Map<string, string>();
const search = vi.hoisted(() => vi.fn(async () => []));
const tabAsk = vi.hoisted(() => vi.fn(async () => "allow_library"));
vi.mock("@/lib/chat/tabAccessRequests", () => ({ requestTabAccess: tabAsk }));

vi.mock("@memora/fs", () => ({
  cat: async (path: string) => {
    const text = fsFiles.get(path);
    if (text == null) throw new DOMException("Not found.", "NotFoundError");
    return text;
  },
  ls: async () => [],
  file: (path: string) => ({
    exists: async () => fsFiles.has(path),
    text: async () => fsFiles.get(path) ?? "",
  }),
  grep: async () => [],
  write: async (path: string, content: string) => {
    fsFiles.set(path, content);
  },
}));
vi.mock("@/lib/search/contentSearchService", () => ({ searchContent: search }));
vi.mock("@/lib/content/artifactStorage", () => ({ readExtractedContent: async () => "text" }));
vi.mock("@/lib/editor/noteCreation", () => ({
  createNewMarkdownNote: async () => ({
    id: "new",
    meta: { name: "N.md", storagePath: "/files/new/new.md", parentId: null },
    createdEvent: {},
  }),
}));

let files: Array<Record<string, unknown>> = [];
let settings: Record<string, unknown> = {};
let folders: Array<{ id: string; name: string; parentId: string | null }> = [];
// Table queries keep the rows holding every bound value, enough for lookups by id or path.
const store = {
  query: (query: unknown) => {
    if (query === desktopFoldersQuery$) return folders;
    if (query === settingsDocumentQuery$) return settings;
    const binds = (query as { asSql?: () => { bindValues: unknown[] } }).asSql?.().bindValues;
    if (!binds) return files;
    return files.filter((row) => binds.every((value) => Object.values(row).includes(value)));
  },
  commit: vi.fn(),
};

beforeEach(() => {
  search.mockClear();
  tabAsk.mockClear();
  store.commit.mockClear();
  settings = {};
  fsFiles.clear();
  fsFiles.set("/files/a/a.md", "alpha");
  fsFiles.set("/chat/notes/n.md", "note");
  fsFiles.set(
    "/files/b/b.transcript.json",
    JSON.stringify({ words: [{ text: "hi.", timestamp: [0, 1] }] }),
  );
  files = [
    {
      id: "a",
      name: "A.md",
      type: "document",
      parentId: "inner",
      storagePath: "/files/a/a.md",
      transcriptPath: null,
      indexSummary: "secret summary",
    },
    {
      id: "b",
      name: "B.mp4",
      type: "video",
      parentId: null,
      storagePath: "/files/b/b.mp4",
      transcriptPath: "/files/b/b.transcript.json",
      indexSummary: "other summary",
    },
  ];
  folders = [
    { id: "outer", name: "Outer", parentId: null },
    { id: "inner", name: "Inner", parentId: "outer" },
  ];
});

const A = { id: "a", name: "A.md", type: "document", folderId: "inner", folderName: "Inner" };
const B = { id: "b", name: "B.mp4", type: "video", folderId: null };

const setup = ({
  mode = { guard: "reads-and-writes", approver: "user" },
  scope = EMPTY_REFERENCE_SCOPE,
  grants: initialGrants = [],
  answer = { decision: "allow_once", source: "user" },
  handler = true,
}: {
  mode?: PermissionMode;
  scope?: ResolvedReferenceScope;
  grants?: PermissionGrant[];
  answer?: AccessAnswer;
  handler?: boolean;
} = {}) => {
  const asked: AccessRequest[] = [];
  const grants = [...initialGrants];
  const applied: string[] = [];
  const options: CreateChatToolsOptions = {
    getPermissionMode: () => mode,
    getPermissionGrants: () => grants,
    addPermissionGrants: (added) => grants.push(...added),
    getReferenceScope: () => scope,
    chatSessions: { list: async () => [], load: async () => null },
    documentTarget: {
      fileId: "a",
      fileName: "A.md",
      getText: () => "alpha",
      applyText: (text) => applied.push(text),
    },
    requestAccess: handler
      ? async (request: AccessRequest) => {
          asked.push(request);
          return answer;
        }
      : null,
  };
  const tools = createChatTools(store, options);
  const run = (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error(`${name} is missing.`);
    return tool.execute(v.parse(tool.parameters, args));
  };
  return { run, asked, grants, applied };
};

const scopeOf = (fileIds: string[]): ResolvedReferenceScope => ({
  ...EMPTY_REFERENCE_SCOPE,
  isActive: true,
  fileIds,
});

const grant = (access: "read" | "write", target: PermissionGrant["target"]): PermissionGrant => ({
  id: crypto.randomUUID(),
  access,
  target,
  createdAt: 0,
});

describe("Access requests", () => {
  test.each([
    [
      "read_file",
      { path: "/files/a/a.md" },
      { access: "read", target: { kind: "files", files: [A] } },
    ],
    ["grep_files", { pattern: "x" }, { access: "read", search: true, target: { kind: "library" } }],
    [
      "search_transcript",
      { keyword: "x" },
      { access: "read", search: true, target: { kind: "library" } },
    ],
    [
      "search_transcript",
      { keyword: "x", file_id: "b" },
      { access: "read", target: { kind: "files", files: [B] } },
    ],
    [
      "read_transcript",
      { file_id: "b" },
      { access: "read", target: { kind: "files", files: [B] } },
    ],
    ["search_files", { query: "x" }, { access: "read", search: true, target: { kind: "library" } }],
    [
      "search_files",
      { query: "x", file_ids: ["a", "b"] },
      { access: "read", target: { kind: "files", files: [A, B] } },
    ],
    [
      "read_extracted_content",
      { file_id: "a" },
      { access: "read", target: { kind: "files", files: [A] } },
    ],
    ["read_document", {}, { access: "read", target: { kind: "files", files: [A] } }],
    [
      "write_document",
      { content: "new" },
      {
        access: "write",
        target: { kind: "files", files: [A] },
        write: expect.objectContaining({ operation: "write", contentLength: 3 }),
      },
    ],
    [
      "edit_document",
      { edits: [{ old_text: "alpha", new_text: "beta" }] },
      {
        access: "write",
        target: { kind: "files", files: [A] },
        write: expect.objectContaining({ operation: "replace", contentLength: 4 }),
      },
    ],
    [
      "modify_text_file",
      { path: "/chat/notes/n.md", operation: "append", content: "!" },
      {
        access: "write",
        target: { kind: "path", path: "/chat/notes/n.md" },
        write: expect.objectContaining({ operation: "append", contentLength: 1 }),
      },
    ],
    [
      "create_document",
      { name: "N", content: "hey", folder_id: "inner" },
      {
        access: "write",
        target: { kind: "new-file", name: "N", folder: { id: "inner", name: "Inner" } },
        write: expect.objectContaining({ operation: "create" }),
      },
    ],
  ])(
    "%s declares its request, and a denial keeps the body from running",
    async (name, args, expected) => {
      const { run, asked, applied } = setup({ answer: { decision: "deny", source: "user" } });
      const result = await run(name, args);
      expect(asked).toEqual([expect.objectContaining({ tool: name, ...expected })]);
      expect(result).toEqual({ error: expect.any(String) });
      expect(search).not.toHaveBeenCalled();
      expect(applied).toEqual([]);
      expect(fsFiles.get("/chat/notes/n.md")).toBe("note");
    },
  );

  test.each([
    ["/files", { kind: "library" }],
    ["/files/", { kind: "library" }],
    ["/", { kind: "library" }],
    ["/files/a", { kind: "files", files: [A] }],
    ["/files/a/", { kind: "files", files: [A] }],
  ])("grep_files in %s reads %o and shows what it searches for", async (cwd, target) => {
    const { run, asked } = setup({ answer: { decision: "deny", source: "user" } });
    await run("grep_files", { pattern: "needle", cwd });
    expect(asked).toEqual([
      expect.objectContaining({ tool: "grep_files", search: true, query: "needle", target }),
    ]);
  });

  test("every request says what it does in words for the user", async () => {
    const { run, asked } = setup({ answer: { decision: "deny", source: "user" } });
    await run("search_files", { query: "x" });
    await run("modify_text_file", { path: "/chat/notes/n.md", operation: "append", content: "!" });
    expect(asked.map((request) => request.summary)).toEqual([
      "search your documents, images, and transcripts",
      "add text to the end of a file",
    ]);
  });

  test("chat working files and chat sessions are read without asking", async () => {
    const { run, asked } = setup();
    expect(await run("read_file", { path: "/chat/notes/n.md" })).toBe("note");
    await run("read_chat_session", { session_id: "s" });
    expect(asked).toEqual([]);
  });

  test("a path that does not exist skips the check and reports not found", async () => {
    const { run, asked } = setup();
    expect(await run("read_file", { path: "/nowhere/x.md" })).toHaveProperty("error");
    expect(asked).toEqual([]);
  });
});

describe("reference scope", () => {
  test.each(["writes", "reads-and-writes"] as const)(
    "with guard %s, reads inside pass and reads outside ask",
    async (guard) => {
      const { run, asked } = setup({ mode: { guard, approver: "user" }, scope: scopeOf(["a"]) });
      expect(await run("read_extracted_content", { file_id: "a" })).toMatchObject({ fileId: "a" });
      expect(asked).toEqual([]);
      await run("read_transcript", { file_id: "b" });
      expect(asked).toEqual([expect.objectContaining({ target: { kind: "files", files: [B] } })]);
    },
  );

  test("a search without file ids stays inside the scope", async () => {
    const { run, asked } = setup({ scope: scopeOf(["a"]) });
    await run("search_files", { query: "x" });
    expect(asked).toEqual([]);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ["a"] }));
  });

  test("referencing a file does not allow writing it", async () => {
    const { run, asked } = setup({ scope: scopeOf(["a"]) });
    await run("write_document", { content: "x" });
    expect(asked).toHaveLength(1);
  });

  test("only writes are guarded without a scope", async () => {
    const { run, asked } = setup({ mode: { guard: "writes", approver: "user" } });
    await run("search_files", { query: "x" });
    await run("read_file", { path: "/files/a/a.md" });
    expect(asked).toEqual([]);
  });
});

describe("Permission grants", () => {
  test.each([
    ["file", grant("read", { kind: "file", fileId: "a" })],
    ["parent folder", grant("read", { kind: "folder", folderId: "inner" })],
    ["ancestor folder", grant("read", { kind: "folder", folderId: "outer" })],
    ["library", grant("read", { kind: "library" })],
  ])("a %s grant allows the read", async (_label, readGrant) => {
    const { run, asked } = setup({ grants: [readGrant] });
    expect(await run("read_file", { path: "/files/a/a.md" })).toMatchObject({
      content: "al",
      totalChars: 5,
    });
    expect(asked).toEqual([]);
  });

  test("a folder grant follows a file moved out of it", async () => {
    const { run, asked } = setup({
      grants: [grant("read", { kind: "folder", folderId: "outer" })],
    });
    files[0] = { ...files[0], parentId: null };
    await run("read_file", { path: "/files/a/a.md" });
    expect(asked).toHaveLength(1);
  });

  test("a folder grant covers a folder moved into it", async () => {
    folders = [
      { id: "outer", name: "Outer", parentId: null },
      { id: "inner", name: "Inner", parentId: null },
    ];
    const { run, asked } = setup({
      grants: [grant("read", { kind: "folder", folderId: "outer" })],
    });
    folders[1] = { ...folders[1], parentId: "outer" };
    await run("read_file", { path: "/files/a/a.md" });
    expect(asked).toEqual([]);
  });

  test("read and write grants are separate", async () => {
    const { run, asked } = setup({ grants: [grant("read", { kind: "library" })] });
    await run("write_document", { content: "x" });
    expect(asked).toHaveLength(1);
  });

  test("a path-prefix grant allows writes under it", async () => {
    const { run, asked } = setup({
      grants: [grant("write", { kind: "path-prefix", prefix: "/chat/notes/" })],
    });
    await run("modify_text_file", { path: "/chat/notes/n.md", operation: "append", content: "!" });
    expect(asked).toEqual([]);
    expect(fsFiles.get("/chat/notes/n.md")).toBe("note!");
  });

  test("a library-wide search needs a library grant, not file grants", async () => {
    const { run, asked } = setup({ grants: [grant("read", { kind: "file", fileId: "a" })] });
    await run("search_files", { query: "x" });
    expect(asked).toHaveLength(1);
  });

  test("a file-limited search asks only about files not granted yet, in one prompt", async () => {
    const { run, asked } = setup({ grants: [grant("read", { kind: "file", fileId: "a" })] });
    await run("search_files", { query: "x", file_ids: ["a", "b"] });
    expect(asked).toEqual([expect.objectContaining({ target: { kind: "files", files: [B] } })]);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ["a", "b"] }));
  });

  test.each([
    ["allow_file", { kind: "file", fileId: "a" }],
    ["allow_folder", { kind: "folder", folderId: "inner" }],
    ["allow_library", { kind: "library" }],
  ] as const)("%s saves a grant that the next read uses", async (decision, target) => {
    const { run, asked, grants } = setup({ answer: { decision, source: "user" } });
    await run("read_file", { path: "/files/a/a.md" });
    await run("read_file", { path: "/files/a/a.md" });
    expect(asked).toHaveLength(1);
    expect(grants).toEqual([expect.objectContaining({ access: "read", target })]);
  });

  test("always allowing a folder for a non-library write saves its path prefix", async () => {
    const { run, grants } = setup({ answer: { decision: "allow_folder", source: "user" } });
    await run("modify_text_file", { path: "/chat/notes/n.md", operation: "append", content: "!" });
    expect(grants).toEqual([
      expect.objectContaining({
        access: "write",
        target: { kind: "path-prefix", prefix: "/chat/notes/" },
      }),
    ]);
  });

  test("allow once and Auto review approvals save nothing", async () => {
    const once = setup();
    await once.run("read_file", { path: "/files/a/a.md" });
    expect(once.grants).toEqual([]);
    const auto = setup({ answer: { decision: "allow_library", source: "auto" } });
    await auto.run("read_file", { path: "/files/a/a.md" });
    expect(auto.grants).toEqual([]);
  });
});

describe("query_db", () => {
  const query = (guard: PermissionMode["guard"]) =>
    setup({ mode: { guard, approver: "user" } }).run("query_db", {
      sql: "SELECT id, indexSummary FROM files",
    });

  test("leaves out indexSummary only while reads are guarded", async () => {
    expect(await query("reads-and-writes")).toMatchObject({ rows: [{ id: "a" }, { id: "b" }] });
    expect(((await query("reads-and-writes")) as { rows: object[] }).rows[0]).not.toHaveProperty(
      "indexSummary",
    );
    expect(((await query("writes")) as { rows: object[] }).rows[0]).toHaveProperty(
      "indexSummary",
      "secret summary",
    );
  });
});

describe("without an approval handler", () => {
  test("with only writes guarded, as in the evaluation playground, reads pass and writes are refused", async () => {
    const { run } = setup({ handler: false, mode: { guard: "writes", approver: "user" } });
    expect(await run("read_file", { path: "/files/a/a.md" })).toMatchObject({
      content: "al",
      totalChars: 5,
    });
    expect(
      await run("modify_text_file", {
        path: "/chat/notes/n.md",
        operation: "append",
        content: "!",
      }),
    ).toEqual({
      error: expect.stringContaining("requires user approval"),
    });
    expect(fsFiles.get("/chat/notes/n.md")).toBe("note");
  });

  test("guarded reads need a grant, so callers such as WebMCP cannot skip the guard", async () => {
    const { run } = setup({ handler: false });
    expect(await run("search_files", { query: "x" })).toEqual({
      error: expect.stringContaining("approval"),
    });
    expect(search).not.toHaveBeenCalled();
    const granted = setup({
      handler: false,
      grants: [grant("read", { kind: "file", fileId: "a" })],
    });
    expect(await granted.run("read_file", { path: "/files/a/a.md" })).toMatchObject({
      content: "al",
      totalChars: 5,
    });
  });
});

describe("callers that pass no permission options", () => {
  test("follow Settings, ask in this tab, and save always choices to Settings", async () => {
    settings = {
      permissionMode: { guard: "reads-and-writes", approver: "user" },
      permissionGrants: [grant("read", { kind: "file", fileId: "b" })],
    };
    const tools = createChatTools(store);
    const run = (name: string, args: Record<string, unknown>) => {
      const tool = tools.find((item) => item.name === name);
      if (!tool) throw new Error(`${name} is missing.`);
      return tool.execute(v.parse(tool.parameters, args));
    };

    await run("read_transcript", { file_id: "b" });
    expect(tabAsk).not.toHaveBeenCalled();

    await run("search_files", { query: "x" });
    expect(tabAsk).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "search_files", target: { kind: "library" } }),
    );
    expect(search).toHaveBeenCalled();
    expect(store.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({
          value: expect.objectContaining({
            permissionGrants: [
              expect.objectContaining({ target: { kind: "file", fileId: "b" } }),
              expect.objectContaining({ access: "read", target: { kind: "library" } }),
            ],
          }),
        }),
      }),
    );
  });
});
