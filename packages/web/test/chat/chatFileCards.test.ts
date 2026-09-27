import { describe, expect, test } from "vite-plus/test";

import { fileCardFromToolResult } from "@/lib/chat/chatFileCards";

describe("fileCardFromToolResult", () => {
  test("reads created and edited library files", () => {
    expect(fileCardFromToolResult("create_document", { id: "d1", name: "Notes.md" })).toEqual({
      fileId: "d1",
      name: "Notes.md",
      action: "created",
    });
    expect(
      fileCardFromToolResult("modify_text_file", { fileId: "d1", name: "Notes.md", path: "/x" }),
    ).toEqual({ fileId: "d1", name: "Notes.md", action: "modified" });
  });

  test("skips failures, scratch files, and other tools", () => {
    expect(fileCardFromToolResult("create_document", { error: "denied" })).toBeNull();
    expect(fileCardFromToolResult("modify_text_file", { path: "/chat/a.md" })).toBeNull();
    expect(fileCardFromToolResult("read_file", { id: "d1", name: "Notes.md" })).toBeNull();
  });
});
