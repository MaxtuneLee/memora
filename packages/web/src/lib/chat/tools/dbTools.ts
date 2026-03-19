import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import {
  EMPTY_REFERENCE_SCOPE,
  type CreateChatToolsOptions,
  type StoreQueryable,
} from "./shared";

const ALLOWED_TABLES = new Set(["files", "folders", "collections"]);
const FORBIDDEN_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|GRANT|REVOKE)\b/i;
const MAX_QUERY_ROWS = 100;
const FILES_TABLE_USAGE_PATTERN = /\b(?:FROM|JOIN)\s+files\b/i;

const TABLE_SCHEMAS: Record<
  string,
  {
    description: string;
    columns: Array<{ name: string; type: string; description: string }>;
  }
> = {
  files: {
    description: "User's multimedia files (audio, video, images, documents)",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY", description: "unique identifier" },
      { name: "name", type: "TEXT", description: "display name" },
      { name: "type", type: "TEXT", description: "'audio' | 'video' | 'image' | 'document'" },
      { name: "mimeType", type: "TEXT", description: "MIME type" },
      { name: "sizeBytes", type: "INTEGER", description: "file size in bytes" },
      { name: "storagePath", type: "TEXT", description: "OPFS path to the actual file" },
      { name: "transcriptPath", type: "TEXT", description: "OPFS path to transcript JSON (nullable)" },
      { name: "parentId", type: "TEXT", description: "parent folder ID (nullable)" },
      { name: "collectionId", type: "TEXT", description: "collection ID (nullable)" },
      { name: "durationSec", type: "REAL", description: "media duration in seconds (nullable)" },
      { name: "indexSummary", type: "TEXT", description: "AI-generated summary (nullable)" },
      { name: "createdAt", type: "INTEGER", description: "creation timestamp (unix ms)" },
      { name: "updatedAt", type: "INTEGER", description: "last update timestamp (unix ms)" },
      { name: "deletedAt", type: "INTEGER", description: "soft-delete timestamp, non-null = in trash (nullable)" },
      { name: "purgedAt", type: "INTEGER", description: "permanent delete timestamp (nullable)" },
    ],
  },
  folders: {
    description: "Organizational folders for grouping files",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY", description: "unique identifier" },
      { name: "name", type: "TEXT", description: "folder name" },
      { name: "parentId", type: "TEXT", description: "parent folder ID (nullable)" },
      { name: "createdAt", type: "INTEGER", description: "creation timestamp (unix ms)" },
      { name: "updatedAt", type: "INTEGER", description: "last update timestamp (unix ms)" },
      { name: "deletedAt", type: "INTEGER", description: "soft-delete timestamp (nullable)" },
      { name: "purgedAt", type: "INTEGER", description: "permanent delete timestamp (nullable)" },
    ],
  },
  collections: {
    description: "Tagged groups / collections",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY", description: "unique identifier" },
      { name: "name", type: "TEXT", description: "collection name" },
      { name: "parentId", type: "TEXT", description: "parent collection ID (nullable)" },
      { name: "color", type: "TEXT", description: "display color (nullable)" },
      { name: "createdAt", type: "INTEGER", description: "creation timestamp (unix ms)" },
      { name: "updatedAt", type: "INTEGER", description: "last update timestamp (unix ms)" },
      { name: "deletedAt", type: "INTEGER", description: "soft-delete timestamp (nullable)" },
    ],
  },
};

const validateSql = (sql: string): string | null => {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!trimmed.toUpperCase().startsWith("SELECT")) {
    return "Only SELECT queries are allowed";
  }
  if (FORBIDDEN_PATTERN.test(trimmed)) {
    return "Query contains forbidden keywords";
  }
  if (trimmed.includes(";")) {
    return "Multiple statements are not allowed";
  }
  const fromMatch = trimmed.match(
    /\bFROM\s+([\w,\s]+?)(?:\s+WHERE|\s+ORDER|\s+GROUP|\s+LIMIT|\s+JOIN|\s+LEFT|\s+INNER|\s+OUTER|$)/i,
  );
  if (!fromMatch) {
    return null;
  }

  const tables = fromMatch[1]
    .split(",")
    .map((table) => table.trim().split(/\s+/)[0].toLowerCase());
  for (const table of tables) {
    if (!ALLOWED_TABLES.has(table)) {
      return `Access to table '${table}' is not allowed. Allowed tables: ${[...ALLOWED_TABLES].join(", ")}`;
    }
  }

  return null;
};

export const createDatabaseTools = (
  store: StoreQueryable,
  options: CreateChatToolsOptions,
): ToolDefinition[] => {
  return [
    {
      type: "function",
      name: "describe_table",
      description:
        "Get the schema (columns, types, descriptions) of a database table. Available tables: files, folders, collections.",
      parameters: v.object({
        table: v.string(),
      }),
      execute: async (params: unknown) => {
        const payload = params as { table: string };
        const schema = TABLE_SCHEMAS[payload.table];
        if (schema) {
          return schema;
        }

        return {
          error: `Unknown table '${payload.table}'. Available: ${Object.keys(TABLE_SCHEMAS).join(", ")}`,
        };
      },
    },
    {
      type: "function",
      name: "query_db",
      description:
        "Run a read-only SQL SELECT query on the metadata database. Only SELECT on tables: files, folders, collections. Max 100 rows returned.",
      parameters: v.object({
        sql: v.string(),
      }),
      execute: async (params: unknown) => {
        const payload = params as { sql: string };
        const error = validateSql(payload.sql);
        if (error) {
          return { error };
        }

        try {
          let sql = payload.sql.trim().replace(/;+$/, "");
          if (!/\bLIMIT\b/i.test(sql)) {
            sql += ` LIMIT ${MAX_QUERY_ROWS}`;
          }

          const rows = store.query({ query: sql, bindValues: {} });
          const referenceScope =
            options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
          if (!referenceScope.isActive || !FILES_TABLE_USAGE_PATTERN.test(sql)) {
            return { rows, count: (rows as unknown[]).length };
          }

          const scopedIds = new Set(referenceScope.fileIds);
          const rowList = rows as unknown[];
          if (
            rowList.length > 0 &&
            rowList.some(
              (row) =>
                typeof row !== "object" ||
                row === null ||
                typeof (row as { id?: unknown }).id !== "string",
            )
          ) {
            return {
              error:
                "Reference scope is active. Include files.id in SELECT columns so results can be constrained to referenced files.",
            };
          }

          const filteredRows = (
            rowList as Array<{
              id: string;
              [key: string]: unknown;
            }>
          ).filter((row) => scopedIds.has(row.id));

          return {
            rows: filteredRows,
            count: filteredRows.length,
            scoped: true,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
};
