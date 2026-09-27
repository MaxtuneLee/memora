import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

import { createFileTools } from "@/lib/chat/tools/fileTools";

const notFound = () => new DOMException("A requested file could not be found.", "NotFoundError");

vi.mock("@memora/fs", () => ({
  cat: async () => {
    throw notFound();
  },
  ls: async (path: string) => {
    if (path === "/files/f1") return ["/files/f1/f1.transcript.json", "/files/f1/f1.content.md"];
    throw notFound();
  },
  file: () => ({}),
  grep: async () => [],
  write: async () => {},
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
