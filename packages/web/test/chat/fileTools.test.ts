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
  write: async (path: string, content: string) => {
    files.set(path, content);
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
