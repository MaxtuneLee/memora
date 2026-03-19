import { cat, file as opfsFile, grep, write as opfsWrite } from "@memora/fs";
import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import { fileTable } from "@/livestore/file";

import {
  EMPTY_REFERENCE_SCOPE,
  type CreateChatToolsOptions,
  type StoreQueryable,
} from "./shared";

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
        const referenceScope =
          options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
        if (referenceScope.isActive) {
          const allowedPaths = new Set(referenceScope.allowedPaths);
          if (!allowedPaths.has(payload.path)) {
            return {
              error:
                "Path is outside the currently referenced files. Add the target file to references first.",
            };
          }
        }

        const content = await cat(payload.path);
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
        const referenceScope =
          options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
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
        "Write or append UTF-8 text content to an OPFS path. Allowed paths must start with /chat/ or /files/.",
      parameters: v.object({
        path: v.string(),
        operation: v.picklist(["write", "append"]),
        content: v.string(),
        overwrite: v.optional(v.boolean(), true),
      }),
      execute: async (params: unknown) => {
        const payload = params as {
          path: string;
          operation: "write" | "append";
          content: string;
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

        const overwrite = payload.overwrite ?? true;
        const approval = await options.requestWriteApproval({
          path,
          operation: payload.operation,
          content: payload.content,
          contentLength: payload.content.length,
          overwrite,
        });
        if (approval === "deny") {
          return { error: "User denied file modification request." };
        }

        if (payload.operation === "write") {
          await opfsWrite(path, payload.content, { overwrite });
          return {
            path,
            operation: "write",
            bytesWritten: payload.content.length,
            overwrite,
          };
        }

        const targetFile = opfsFile(path);
        const existing = (await targetFile.exists()) ? await targetFile.text() : "";
        const nextContent = `${existing}${payload.content}`;
        await opfsWrite(path, nextContent, { overwrite: true });

        return {
          path,
          operation: "append",
          appendedBytes: payload.content.length,
          totalBytes: nextContent.length,
        };
      },
    },
  ];
};
