import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { createFileTools } from "@/lib/chat/tools/fileTools";

const files = new Map<string, string>();

const notFound = () => new DOMException("A requested file could not be found.", "NotFoundError");

vi.mock("@memora/fs", () => ({
  cat: async () => {
    throw notFound();
  },
  ls: async (path: string) => {
    if (path === "/files/f1") return ["/files/f1/f1.transcript.json", "/files/f1/f1.content.md"];
    throw notFound();
  },
  file: (path: string) => ({
    exists: async () => files.has(path),
    text: async () => files.get(path) ?? "",
  }),
  grep: async () => [],
  write: async (path: string, content: string | Uint8Array) => {
    files.set(path, typeof content === "string" ? content : new TextDecoder().decode(content));
  },
}));

vi.mock("@/lib/library/fileStorage", () => ({
  saveFileToOpfs: async (input: { name: string; parentId: string | null; blob: Blob }) => {
    const storagePath = "/files/new/new.md";
    files.set(storagePath, await input.blob.text());
    return {
      id: "new",
      meta: {
        id: "new",
        name: input.name,
        type: "document",
        mimeType: "text/markdown",
        sizeBytes: input.blob.size,
        storageType: "opfs",
        storagePath,
        parentId: input.parentId,
        createdAt: 0,
      },
    };
  },
}));

const readFile = () => {
  const tool = createFileTools({ query: () => [] }, {}).find(({ name }) => name === "read_file");
  if (!tool) throw new Error("read_file is missing.");
  return (path: string) => tool.execute(v.parse(tool.parameters, { path }));
};

describe("read_file", () => {
  test("lists the folder's files when the requested file does not exist", async () => {
    expect(await readFile()("/files/f1/transcript.json")).toEqual({
      error:
        "No file at /files/f1/transcript.json. Use a storagePath or transcriptPath from query_db.",
      filesInFolder: ["/files/f1/f1.transcript.json", "/files/f1/f1.content.md"],
    });
  });

  test("says when the folder does not exist either", async () => {
    expect(await readFile()("/files/missing/transcript.json")).toMatchObject({
      folderExists: false,
    });
  });
});

describe("modify_text_file replace", () => {
  const replace = (edits: { old_text: string; new_text: string }[]) => {
    const tool = createFileTools(
      { query: () => [] },
      { requestWriteApproval: async () => "allow_once" as const },
    ).find(({ name }) => name === "modify_text_file");
    if (!tool) throw new Error("modify_text_file is missing.");
    return tool.execute(
      v.parse(tool.parameters, { path: "/chat/a.md", operation: "replace", edits }),
    );
  };

  test("applies several edits against the original file", async () => {
    files.set("/chat/a.md", "one\ntwo\nthree\n");
    await replace([
      { old_text: "three", new_text: "3" },
      { old_text: "one", new_text: "one\ntwo" },
    ]);
    expect(files.get("/chat/a.md")).toBe("one\ntwo\ntwo\n3\n");
  });

  test("refuses missing, ambiguous, or overlapping edits without writing", async () => {
    files.set("/chat/a.md", "x x yz");
    expect(await replace([{ old_text: "q", new_text: "z" }])).toHaveProperty("error");
    expect(await replace([{ old_text: "x", new_text: "z" }])).toHaveProperty("error");
    expect(
      await replace([
        { old_text: "x y", new_text: "a" },
        { old_text: "yz", new_text: "b" },
      ]),
    ).toHaveProperty("error");
    expect(files.get("/chat/a.md")).toBe("x x yz");
  });
});

describe("library documents", () => {
  const libraryRow = {
    id: "doc",
    name: "Notes.md",
    type: "document",
    mimeType: "text/markdown",
    sizeBytes: 5,
    storageType: "opfs",
    storagePath: "/files/doc/doc.md",
    metaPath: "/files/doc/doc.meta.json",
    createdAt: 0,
    updatedAt: 0,
  };
  const setup = (rows: unknown[]) => {
    const commit = vi.fn();
    const tools = createFileTools(
      { query: () => rows, commit },
      { requestWriteApproval: async () => "allow_once" as const },
    );
    const run = (name: string, args: unknown) => {
      const tool = tools.find((item) => item.name === name);
      if (!tool) throw new Error(`${name} is missing.`);
      return tool.execute(v.parse(tool.parameters, args));
    };
    return { commit, run };
  };

  test("create_document adds a library record", async () => {
    const { commit, run } = setup([]);
    expect(await run("create_document", { name: "HTTP notes", content: "# HTTP" })).toMatchObject({
      name: "HTTP notes.md",
      storagePath: "/files/new/new.md",
    });
    expect(files.get("/files/new/new.md")).toBe("# HTTP");
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "v1.FileCreated",
        args: expect.objectContaining({ id: "new" }),
      }),
    );
  });

  test("modify_text_file will not create a file under /files/ without a record", async () => {
    const { commit, run } = setup([]);
    expect(
      await run("modify_text_file", { path: "/files/loose.md", operation: "write", content: "x" }),
    ).toMatchObject({ error: expect.stringContaining("create_document") });
    expect(files.has("/files/loose.md")).toBe(false);
    expect(commit).not.toHaveBeenCalled();
  });

  test("editing a library document updates its record", async () => {
    files.set("/files/doc/doc.md", "hello");
    const { commit, run } = setup([libraryRow]);
    await run("modify_text_file", {
      path: "/files/doc/doc.md",
      operation: "append",
      content: " world",
    });
    expect(files.get("/files/doc/doc.md")).toBe("hello world");
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "v1.FileUpdated",
        args: expect.objectContaining({ id: "doc", sizeBytes: 11 }),
      }),
    );
  });
});
