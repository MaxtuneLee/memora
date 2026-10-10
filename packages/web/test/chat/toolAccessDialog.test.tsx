import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

import { ToolAccessDialog } from "@/components/chat/ToolAccessDialog";
import type { AccessRequest } from "@/lib/chat/permissions";

const text = (request: AccessRequest): string =>
  renderToStaticMarkup(<ToolAccessDialog request={request} onDecide={() => {}} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

test("shows what the call does, what it searches for, and where, without tool ids or storage paths", () => {
  const search = text({
    tool: "search_files",
    summary: "search your documents, images, and transcripts",
    access: "read",
    search: true,
    query: "gradient descent",
    target: {
      kind: "files",
      files: [{ id: "a", name: "Lecture 3.mp4", type: "video", folderId: "f", folderName: "ML" }],
    },
  });
  expect(search).toContain("Memora wants to search your documents, images, and transcripts.");
  expect(search).toContain('Search for: "gradient descent"');
  expect(search).toContain('Search in: "Lecture 3.mp4" in "ML"');
  expect(search).not.toContain("search_files");

  const write = text({
    tool: "modify_text_file",
    summary: "add text to the end of a file",
    access: "write",
    target: { kind: "path", path: "/chat/notes/plan.md" },
    write: { operation: "append", contentLength: 1200, overwrite: true },
  });
  expect(write).toContain('Change: Chat working file "notes/plan.md"');
  expect(write).toContain("Size: 1,200 characters");
  expect(write).not.toContain("/chat/");
  expect(write).not.toContain("modify_text_file");
});
