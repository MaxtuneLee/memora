import type { PromptSegment, ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

// The document open next to an editor chat. Tools reach it through the chat session id because
// tool calls run in the app-wide tool host, not in the editor page.
export interface DocumentToolTarget {
  fileName: string;
  getText: () => string;
  applyText: (nextText: string) => void;
  // Why Preview could not show the document as written, one message per spot; empty when it can.
  getPreviewIssues?: () => readonly string[];
}

const targets = new Map<string, DocumentToolTarget>();

export const registerDocumentToolTarget = (
  sessionId: string,
  target: DocumentToolTarget,
): (() => void) => {
  targets.set(sessionId, target);
  return () => {
    if (targets.get(sessionId) === target) {
      targets.delete(sessionId);
    }
  };
};

export const getDocumentToolTarget = (sessionId: string): DocumentToolTarget | undefined => {
  return targets.get(sessionId);
};

const MAX_READ_CHARACTERS = 60_000;

const countOccurrences = (text: string, search: string): number => {
  let count = 0;
  let index = text.indexOf(search);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(search, index + search.length);
  }
  return count;
};

export interface DocumentEdit {
  new_text: string;
  old_text: string;
}

type DocumentEditResult = { text: string } | { error: string };

// Applies all edits or none. Each old_text must match exactly once in the current text.
export const applyDocumentEdits = (
  text: string,
  edits: readonly DocumentEdit[],
): DocumentEditResult => {
  let nextText = text;
  for (const [index, edit] of edits.entries()) {
    if (!edit.old_text) {
      return {
        error: `Edit ${index + 1}: old_text is empty. Use write_document to fill an empty document.`,
      };
    }

    const count = countOccurrences(nextText, edit.old_text);
    if (count === 0) {
      return {
        error: `Edit ${index + 1}: old_text was not found. Call read_document and copy the text exactly, including line breaks and Markdown markers.`,
      };
    }
    if (count > 1) {
      return {
        error: `Edit ${index + 1}: old_text matches ${count} places. Include more surrounding text so it matches once.`,
      };
    }

    nextText = nextText.replace(edit.old_text, () => edit.new_text);
  }

  return { text: nextText };
};

export const DOCUMENT_TOOL_NAMES = ["read_document", "edit_document", "write_document"] as const;

export const createDocumentTools = (target: DocumentToolTarget): ToolDefinition[] => {
  return [
    {
      type: "function",
      name: "read_document",
      description:
        "Read the Markdown of the document open in the editor next to this chat. Optional start_line and end_line (1-based, inclusive) read part of a long document.",
      parameters: v.object({
        start_line: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
        end_line: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      }),
      execute: async (params: unknown) => {
        const payload = params as { start_line?: number; end_line?: number };
        const text = target.getText();
        const lines = text.split("\n");
        const startLine = payload.start_line ?? 1;
        const endLine = Math.min(payload.end_line ?? lines.length, lines.length);
        const content = lines.slice(startLine - 1, endLine).join("\n");
        const truncated = content.length > MAX_READ_CHARACTERS;
        const previewIssues = target.getPreviewIssues?.() ?? [];
        return {
          fileName: target.fileName,
          totalLines: lines.length,
          startLine,
          endLine,
          content: truncated ? content.slice(0, MAX_READ_CHARACTERS) : content,
          ...(truncated
            ? { truncated: true, note: "Read the rest with start_line/end_line." }
            : {}),
          ...(previewIssues.length > 0 ? { previewIssues } : {}),
        };
      },
    },
    {
      type: "function",
      name: "edit_document",
      description:
        "Change parts of the open document. Each edit replaces old_text, copied exactly from read_document and matching one place only, with new_text. Edits apply in order, and none apply if any fails. Use an empty new_text to delete.",
      parameters: v.object({
        edits: v.pipe(
          v.array(v.object({ old_text: v.string(), new_text: v.string() })),
          v.minLength(1),
        ),
      }),
      execute: async (params: unknown) => {
        const payload = params as { edits: DocumentEdit[] };
        const result = applyDocumentEdits(target.getText(), payload.edits);
        if ("error" in result) {
          return result;
        }

        target.applyText(result.text);
        return { fileName: target.fileName, appliedEdits: payload.edits.length };
      },
    },
    {
      type: "function",
      name: "write_document",
      description:
        "Replace the whole open document with new Markdown. Use it only for an empty document or a full rewrite the user asked for; prefer edit_document for changes.",
      parameters: v.object({
        content: v.string(),
      }),
      execute: async (params: unknown) => {
        const payload = params as { content: string };
        target.applyText(payload.content);
        return { fileName: target.fileName, totalLines: payload.content.split("\n").length };
      },
    },
  ];
};

export const createDocumentPromptSegment = (fileName: string): PromptSegment => ({
  id: "current-document",
  priority: 90,
  content: `
## Current document
The user is editing the Markdown document "${fileName}" in the editor next to this chat. Requests like "this note", "the document", or "here" mean this document.
- Call read_document before answering questions about the document or changing it.
- To change it, call edit_document with old_text copied exactly from read_document. Use write_document only for an empty document or a full rewrite.
- Keep the document's existing Markdown style, headings, and language unless the user asks otherwise.
- Edits are shown to the user as suggestions they accept or reject. read_document returns the document with your pending suggestions applied. After editing, say briefly what changed instead of repeating the document.
- A message may start with <quoted_text> the user selected in the note; "this" or "here" refers to it.
- Only edit when the user asks for a change. For questions, answer in the chat.
- When read_document returns previewIssues, Preview mode cannot show the document without changing its Markdown at those lines. If the user asks about Preview, formatting errors, or why the note opened as code, explain them and offer to fix them with edit_document.`,
});
