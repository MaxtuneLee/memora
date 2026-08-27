import { FileDocIcon, FileMdIcon, FilePdfIcon, FilePptIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";
import { getFileIcon } from "@/lib/library/fileIcon";

describe("getFileIcon", () => {
  it("uses distinct icons for Markdown, Word, PowerPoint, and PDF files", () => {
    expect(getFileIcon({ type: "document", mimeType: "text/markdown", name: "notes.md" })).toBe(
      FileMdIcon,
    );
    expect(
      getFileIcon({
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "brief.docx",
      }),
    ).toBe(FileDocIcon);
    expect(getFileIcon({ type: "document", mimeType: "application/pdf", name: "paper.pdf" })).toBe(
      FilePdfIcon,
    );
    expect(
      getFileIcon({
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        name: "review.pptx",
      }),
    ).toBe(FilePptIcon);
  });
});
