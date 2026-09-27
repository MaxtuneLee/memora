import { cat, file as opfsFile, grep, ls, write as opfsWrite } from "@memora/fs";
import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import { fileEvents, fileTable } from "@/livestore/file";
import { readExtractedContent } from "@/lib/content/artifactStorage";
import { modelWorkerFactory } from "@/lib/model-worker";
import { searchContent } from "@/lib/search/contentSearchService";
import { readEmbeddingRuntime } from "@/lib/models/readEmbeddingRuntime";
import { normalizeSettingsValue } from "@/livestore/setting";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { saveTextDocument, type TextDocumentFileLike } from "@/lib/editor/documentPersistence";
import { normalizeLogicalName, type WorkspaceFolderLike } from "@/lib/editor/logicalPaths";
import { createNewMarkdownNote } from "@/lib/editor/noteCreation";

import { EMPTY_REFERENCE_SCOPE, type CreateChatToolsOptions, type StoreQueryable } from "./shared";

const WRITABLE_PATH_PREFIXES = ["/chat/", "/files/"] as const;

const normalizeWritablePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const isWritablePath = (path: string): boolean => {
  return WRITABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
};

interface TextEdit {
  old_text: string;
  new_text: string;
}

/**
 * Applies exact-text edits, each matched against the original content, so the
 * model can change several places in one call without offsets shifting.
 */
export const applyTextEdits = (
  content: string,
  edits: readonly TextEdit[],
): { content: string } | { error: string } => {
  if (edits.length === 0) {
    return { error: "replace needs edits: at least one { old_text, new_text }." };
  }

  const matches: { index: number; edit: TextEdit; editIndex: number }[] = [];
  for (const [editIndex, edit] of edits.entries()) {
    if (!edit.old_text) {
      return { error: `edits[${editIndex}].old_text is empty.` };
    }
    const index = content.indexOf(edit.old_text);
    if (index === -1) {
      return {
        error: `edits[${editIndex}].old_text was not found in the file. Read the file and copy the text exactly.`,
      };
    }
    if (content.indexOf(edit.old_text, index + 1) !== -1) {
      return {
        error: `edits[${editIndex}].old_text matches more than one place. Include more surrounding text.`,
      };
    }
    matches.push({ index, edit, editIndex });
  }

  matches.sort((a, b) => a.index - b.index);
  for (let i = 1; i < matches.length; i++) {
    const previous = matches[i - 1];
    if (previous.index + previous.edit.old_text.length > matches[i].index) {
      return {
        error: `edits[${previous.editIndex}] and edits[${matches[i].editIndex}] overlap. Merge them into one edit.`,
      };
    }
  }

  let next = content;
  for (const { index, edit } of matches.slice().reverse()) {
    next = next.slice(0, index) + edit.new_text + next.slice(index + edit.old_text.length);
  }
  if (next === content) {
    return { error: "The edits do not change the file." };
  }
  return { content: next };
};

export const createFileTools = (
  store: StoreQueryable,
  options: CreateChatToolsOptions,
): ToolDefinition[] => {
  return [
    {
      type: "function",
      name: "read_file",
      description:
        "Read the text content of a file at the given OPFS path. Use storagePath or transcriptPath from query_db results. Supports optional offset (0-based character index to start from) and limit (number of characters to read).",
      parameters: v.object({
        path: v.string(),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          path: string;
          offset?: number;
          limit?: number;
        };
        const referenceScope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
        if (referenceScope.isActive) {
          const allowedPaths = new Set(referenceScope.allowedPaths);
          if (!allowedPaths.has(payload.path)) {
            return {
              error:
                "Path is outside the currently referenced files. Add the target file to references first.",
            };
          }
        }

        let content: string;
        try {
          content = await cat(payload.path);
        } catch (error) {
          const missing =
            error instanceof DOMException &&
            (error.name === "NotFoundError" || error.name === "TypeMismatchError");
          if (!missing) throw error;
          // Show what the folder does hold, so a guessed file name can be corrected.
          const folder = payload.path.slice(0, payload.path.lastIndexOf("/")) || "/";
          const filesInFolder = await ls(folder, { includeDirs: false }).catch(() => null);
          return {
            error: `No file at ${payload.path}. Use a storagePath or transcriptPath from query_db.`,
            ...(filesInFolder ? { filesInFolder } : { folderExists: false }),
          };
        }
        if (payload.offset == null && payload.limit == null) {
          return content;
        }

        const start = payload.offset ?? 0;
        const end = payload.limit != null ? start + payload.limit : undefined;
        return content.slice(start, end);
      },
    },
    {
      type: "function",
      name: "grep_files",
      description:
        "Search for a text pattern across file contents in OPFS storage. Only returns results from active (non-deleted) files. Returns path, offset (character index), and length for each match. Use read_file with offset/limit to get surrounding context.",
      parameters: v.object({
        pattern: v.string(),
        cwd: v.optional(v.string(), "/files"),
        ignore_case: v.optional(v.boolean(), true),
        max_matches: v.optional(v.number(), 20),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          pattern: string;
          cwd?: string;
          ignore_case?: boolean;
          max_matches?: number;
        };
        const referenceScope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
        const scopedIds = new Set(referenceScope.fileIds);
        const activeRows = store.query(
          fileTable.where({ deletedAt: null, purgedAt: null }),
        ) as ReadonlyArray<{ id: string }>;
        const activeIds = new Set(
          activeRows
            .map((row) => row.id)
            .filter((id) => !referenceScope.isActive || scopedIds.has(id)),
        );
        const matches = await grep(payload.pattern, {
          cwd: payload.cwd ?? "/files",
          ignoreCase: payload.ignore_case ?? true,
          maxMatches: payload.max_matches ?? 20,
        });

        return matches
          .filter((match) => {
            const idMatch = match.path.match(/\/files\/([^/]+)/);
            if (!idMatch) {
              return !referenceScope.isActive;
            }
            return activeIds.has(idMatch[1]);
          })
          .map((match) => ({
            path: match.path,
            offset: match.offset,
            length: match.length,
          }));
      },
    },
    {
      type: "function",
      name: "modify_text_file",
      description:
        'Write, append, or edit UTF-8 text content at an OPFS path. Allowed paths must start with /chat/ or /files/. write and append take content. To change parts of an existing file, use operation "replace" with edits: each old_text must match exactly one place in the original file (include surrounding lines to make it unique) and must not overlap another edit; new_text replaces it. Put every change to one file in a single call; merge nearby changes into one edit.',
      parameters: v.object({
        path: v.string(),
        operation: v.picklist(["write", "append", "replace"]),
        content: v.optional(v.string()),
        edits: v.optional(v.array(v.object({ old_text: v.string(), new_text: v.string() }))),
        overwrite: v.optional(v.boolean(), true),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          path: string;
          operation: "write" | "append" | "replace";
          content?: string;
          edits?: TextEdit[];
          overwrite?: boolean;
        };
        const path = normalizeWritablePath(payload.path);
        if (!isWritablePath(path)) {
          return {
            error: "Writes are only allowed for paths under /chat/ or /files/.",
          };
        }

        if (!options.requestWriteApproval) {
          return {
            error:
              "File modification requires user approval, but no approval handler is configured.",
          };
        }

        const targetFile = opfsFile(path);
        const exists = await targetFile.exists();
        // Library files need a database record, which only create_document adds.
        if (!exists && path.startsWith("/files/")) {
          return {
            error: `No file at ${path}. To add a new document to the library, use create_document.`,
          };
        }
        const libraryFile = (
          store.query(
            fileTable.where({ storagePath: path, deletedAt: null, purgedAt: null }),
          ) as TextDocumentFileLike[]
        )[0];
        if (libraryFile && !store.commit) {
          return { error: "Library files cannot be changed here." };
        }

        // Work out the new content before asking the user to approve it.
        const overwrite = payload.overwrite ?? true;
        let nextContent: string;
        if (payload.operation === "replace") {
          if (!exists) {
            return { error: `No file at ${path}.` };
          }
          const result = applyTextEdits(await targetFile.text(), payload.edits ?? []);
          if ("error" in result) {
            return result;
          }
          nextContent = result.content;
        } else if (payload.content == null) {
          return { error: `${payload.operation} needs content.` };
        } else if (payload.operation === "write") {
          if (exists && !overwrite) {
            return { error: `${path} already exists. Set overwrite to replace it.` };
          }
          nextContent = payload.content;
        } else {
          nextContent = (exists ? await targetFile.text() : "") + payload.content;
        }
        const content = payload.content ?? "";
        const edits = (payload.edits ?? []).map((edit) => ({
          oldText: edit.old_text,
          newText: edit.new_text,
        }));

        const approval = await options.requestWriteApproval({
          path,
          operation: payload.operation,
          content,
          contentLength:
            payload.operation === "replace"
              ? edits.reduce((total, edit) => total + edit.newText.length, 0)
              : content.length,
          overwrite,
          ...(payload.operation === "replace" && { edits }),
        });
        if (approval === "deny") {
          return { error: "User denied file modification request." };
        }

        if (libraryFile) {
          const saved = await saveTextDocument({ file: libraryFile, text: nextContent });
          store.commit?.(fileEvents.fileUpdated(saved.updatedEvent));
        } else {
          await opfsWrite(path, nextContent, { overwrite: true });
        }

        return {
          path,
          operation: payload.operation,
          totalBytes: nextContent.length,
          ...(payload.operation === "replace" && { editsApplied: edits.length }),
        };
      },
    },
    {
      type: "function",
      name: "create_document",
      description:
        "Create a new Markdown document in the user's library, where it shows up alongside their other files. Use this, not modify_text_file, whenever the user asks you to create a document or note. folder_id is optional; without it the document goes to the user's default note location. Returns the new file's id and storagePath; use modify_text_file on that storagePath for later changes.",
      parameters: v.object({
        name: v.pipe(v.string(), v.minLength(1)),
        content: v.string(),
        folder_id: v.optional(v.string()),
      }),
      execute: async (params: unknown) => {
        const payload = params as { name: string; content: string; folder_id?: string };
        if (!options.requestWriteApproval) {
          return {
            error:
              "Creating a document requires user approval, but no approval handler is configured.",
          };
        }
        if (!store.commit) {
          return { error: "Documents cannot be created here." };
        }

        const files = store.query(desktopFilesQuery$) as TextDocumentFileLike[];
        const folders = store.query(desktopFoldersQuery$) as WorkspaceFolderLike[];
        if (payload.folder_id && !folders.some((folder) => folder.id === payload.folder_id)) {
          return { error: `No folder with id ${payload.folder_id}.` };
        }
        const name = normalizeLogicalName(payload.name, "Untitled note");

        const approval = await options.requestWriteApproval({
          path: name,
          operation: "create",
          content: payload.content,
          contentLength: payload.content.length,
          overwrite: false,
        });
        if (approval === "deny") {
          return { error: "User denied creating the document." };
        }

        const settings = normalizeSettingsValue(store.query(settingsDocumentQuery$));
        const result = await createNewMarkdownNote({
          settings: payload.folder_id
            ? { defaultNoteLocationMode: "folder", defaultNoteFolderId: payload.folder_id }
            : settings,
          files,
          folders,
          initialContent: payload.content,
          name,
        });
        store.commit(fileEvents.fileCreated(result.createdEvent));

        return {
          id: result.id,
          name: result.meta.name,
          storagePath: result.meta.storagePath,
          folderId: result.meta.parentId ?? null,
        };
      },
    },
    {
      type: "function",
      name: "search_files",
      description:
        "Search extracted document, OCR, and transcript content. Returns matching passages with the file name and page or image location when available.",
      parameters: v.object({
        query: v.string(),
        top_k: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 8),
        file_ids: v.optional(v.array(v.string())),
      }),
      execute: async (params: unknown) => {
        const payload = params as { query: string; top_k?: number; file_ids?: string[] };
        const referenceScope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
        const requestedIds = payload.file_ids ?? referenceScope.fileIds;
        if (
          referenceScope.isActive &&
          requestedIds.some((id) => !referenceScope.fileIds.includes(id))
        ) {
          return { error: "Search is limited to the currently referenced files." };
        }
        const files = store.query(fileTable.where({ deletedAt: null, purgedAt: null }));
        const results = await searchContent({
          query: payload.query,
          topK: payload.top_k,
          fileIds: referenceScope.isActive || requestedIds.length > 0 ? requestedIds : undefined,
          files,
          vectorDb: modelWorkerFactory.vectorDb,
          semantic: readEmbeddingRuntime(store),
          semanticMode: normalizeSettingsValue(store.query(settingsDocumentQuery$))
            .semanticSearchMode,
        });
        return results.map((result) => ({
          fileId: result.fileId,
          fileName: result.fileName,
          content: result.content,
          locator: result.locator,
          score: result.score,
        }));
      },
    },
    {
      type: "function",
      name: "read_extracted_content",
      description: "Read extracted text or OCR content for a file by character offset.",
      parameters: v.object({
        file_id: v.string(),
        offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
        limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 12000),
      }),
      execute: async (params: unknown) => {
        const payload = params as { file_id: string; offset?: number; limit?: number };
        const referenceScope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
        if (referenceScope.isActive && !referenceScope.fileIds.includes(payload.file_id)) {
          return { error: "This file is outside the currently referenced files." };
        }
        const rows = store.query(
          fileTable.where({ id: payload.file_id, deletedAt: null, purgedAt: null }),
        );
        const row = rows[0] as { id: string; name: string } | undefined;
        if (!row) return { error: "File not found." };
        const content = await readExtractedContent(payload.file_id);
        if (content == null)
          return { error: "No extracted content is available for this file yet." };
        const offset = payload.offset ?? 0;
        return {
          fileId: row.id,
          fileName: row.name,
          offset,
          content: content.slice(offset, offset + (payload.limit ?? 12000)),
        };
      },
    },
  ];
};
