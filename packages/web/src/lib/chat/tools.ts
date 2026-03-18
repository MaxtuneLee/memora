import {
  createSkillTools,
  type PromptSegment,
  type ToolDefinition,
} from "@memora/ai-core";
import * as v from "valibot";
import { cat, file as opfsFile, grep, write as opfsWrite } from "@memora/fs";
import { listChatSessions, loadChatSession } from "@/lib/chat/chatSessionStorage";
import { extractNoticeCandidatesWithAI } from "@/lib/chat/noticeExtractor";
import {
  SHOW_WIDGET_SKILL_NAME,
  SHOW_WIDGET_TOOL_NAME,
  createShowWidgetSkillTracker,
  type ShowWidgetSkillTracker,
  validateShowWidgetCall,
} from "@/lib/chat/showWidget";
import { builtInSkillStore } from "@/lib/skills/builtInSkills";
import { upsertGlobalMemoryNotices } from "@/lib/settings/personalityStorage";
import { fileTable } from "@/livestore/file";

const ALLOWED_TABLES = new Set(["files", "folders", "collections"]);
const FORBIDDEN_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|GRANT|REVOKE)\b/i;
const MAX_QUERY_ROWS = 100;
const FILES_TABLE_USAGE_PATTERN = /\b(?:FROM|JOIN)\s+files\b/i;
const WRITABLE_PATH_PREFIXES = ["/chat/", "/files/"] as const;

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
  if (fromMatch) {
    const tables = fromMatch[1]
      .split(",")
      .map((t) => t.trim().split(/\s+/)[0].toLowerCase());
    for (const t of tables) {
      if (!ALLOWED_TABLES.has(t)) {
        return `Access to table '${t}' is not allowed. Allowed tables: ${[...ALLOWED_TABLES].join(", ")}`;
      }
    }
  }
  return null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreQueryable = { query: (...args: any[]) => any };

export interface ResolvedReferenceScope {
  isActive: boolean;
  fileIds: string[];
  allowedPaths: string[];
  referenceLabels: string[];
  totalResolvedFiles: number;
  truncated: boolean;
}

export const EMPTY_REFERENCE_SCOPE: ResolvedReferenceScope = {
  isActive: false,
  fileIds: [],
  allowedPaths: [],
  referenceLabels: [],
  totalResolvedFiles: 0,
  truncated: false,
};

export type WriteApprovalDecision = "allow_once" | "allow_session" | "deny";

export interface WriteApprovalRequest {
  path: string;
  operation: "write" | "append";
  content: string;
  contentLength: number;
  overwrite: boolean;
}

interface CreateChatToolsOptions {
  getReferenceScope?: () => ResolvedReferenceScope;
  showWidgetSkillTracker?: ShowWidgetSkillTracker;
  getMemoryExtractionConfig?: () => {
    apiFormat: "chat-completions" | "responses";
    endpoint: string;
    apiKey: string;
    model: string;
  } | null;
  onMemoryUpdated?: () => void;
  requestWriteApproval?: (
    request: WriteApprovalRequest,
  ) => Promise<WriteApprovalDecision> | WriteApprovalDecision;
}

interface ActiveFileRow {
  id: string;
  name: string;
  type: "audio" | "video" | "image" | "document";
  transcriptPath: string | null;
}

interface TranscriptWord {
  text: string;
  timestamp: [number, number];
}

interface TranscriptWordRange extends TranscriptWord {
  start: number;
  end: number;
}

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const parseTimestamp = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const start = value[0];
  const end = value[1];
  if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
    return null;
  }
  return [start, end];
};

const parseTranscriptWords = (content: string): TranscriptWord[] => {
  try {
    const parsed = JSON.parse(content) as { words?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.words)) {
      return [];
    }
    const words: TranscriptWord[] = [];
    for (const item of parsed.words) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const candidate = item as { text?: unknown; timestamp?: unknown };
      const timestamp = parseTimestamp(candidate.timestamp);
      if (typeof candidate.text !== "string" || timestamp === null) {
        continue;
      }
      words.push({ text: candidate.text, timestamp });
    }
    return words;
  } catch {
    return [];
  }
};

const buildWordRanges = (words: TranscriptWord[]): TranscriptWordRange[] => {
  const ranges: TranscriptWordRange[] = [];
  let cursor = 0;
  for (const word of words) {
    if (!word.text) {
      continue;
    }
    const start = cursor;
    cursor += word.text.length;
    ranges.push({
      ...word,
      start,
      end: cursor,
    });
  }
  return ranges;
};

const findRangeIndexAtOffset = (
  ranges: TranscriptWordRange[],
  offset: number,
): number => {
  for (let i = 0; i < ranges.length; i += 1) {
    if (offset < ranges[i].end) {
      return i;
    }
  }
  return ranges.length - 1;
};

const buildContextSnippet = (
  text: string,
  start: number,
  end: number,
  contextChars: number,
): string => {
  const left = Math.max(0, start - contextChars);
  const right = Math.min(text.length, end + contextChars);
  const snippet = text.slice(left, right).replace(/\s+/g, " ").trim();
  const prefix = left > 0 ? "..." : "";
  const suffix = right < text.length ? "..." : "";
  return `${prefix}${snippet}${suffix}`;
};

const normalizeWritablePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const isWritablePath = (path: string): boolean => {
  return WRITABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
};

export const createChatTools = (
  store: StoreQueryable,
  options: CreateChatToolsOptions = {},
): ToolDefinition[] => {
  const showWidgetSkillTracker =
    options.showWidgetSkillTracker ?? createShowWidgetSkillTracker();
  const trackedSkillStore = showWidgetSkillTracker.wrapStore(builtInSkillStore);

  return [
    ...createSkillTools(trackedSkillStore, {
      activateToolName: "activate_skill",
      readResourceToolName: "read_skill_resource",
      contextLabel: "Memora",
    }),
    {
      type: "function",
      name: SHOW_WIDGET_TOOL_NAME,
      description:
        `Stream an interactive chat widget after reading the ${SHOW_WIDGET_SKILL_NAME} skill README, one module guideline, and that module's required section files. widget_code must stream as <style>...</style>, then HTML, then <script>...</script>.`,
      parameters: v.object({
        i_have_seen_read_me: v.boolean(),
        title: v.string(),
        loading_messages: v.array(v.string()),
        widget_code: v.string(),
      }),
      execute: async (params: unknown) => {
        const p = params as {
          i_have_seen_read_me: boolean;
          title: string;
          loading_messages: string[];
          widget_code: string;
        };
        const validationError = validateShowWidgetCall({
          i_have_seen_read_me: p.i_have_seen_read_me,
          title: p.title,
          loading_messages: p.loading_messages,
          widget_code: p.widget_code,
        });

        if (validationError) {
          throw new Error(validationError);
        }

        return {
          ok: true,
          title: p.title.trim(),
        };
      },
    },
  {
    type: "function",
    name: "list_chat_sessions",
    description:
      "List recently updated chat sessions with titles, timestamps, message counts, and previews.",
    parameters: v.object({
      limit: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1)),
        10,
      ),
    }),
    execute: async (params: unknown) => {
      const p = params as { limit?: number };
      const sessions = await listChatSessions();
      const limit = Math.min(p.limit ?? 10, 50);
      return sessions.slice(0, limit);
    },
  },
  {
    type: "function",
    name: "read_chat_session",
    description:
      "Read historical messages from a specific chat session. Use list_chat_sessions first to get a session id.",
    parameters: v.object({
      session_id: v.string(),
      max_messages: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1)),
        50,
      ),
    }),
    execute: async (params: unknown) => {
      const p = params as { session_id: string; max_messages?: number };
      const session = await loadChatSession(p.session_id);
      if (!session) {
        return { error: `Session '${p.session_id}' was not found` };
      }
      const maxMessages = Math.min(p.max_messages ?? 50, 200);
      const messages = session.messages
        .filter((message) => {
          return (
            message.content.trim().length > 0 ||
            (message.widgets?.length ?? 0) > 0
          );
        })
        .slice(-maxMessages);
      return {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        totalMessages: session.messages.length,
        messages,
      };
    },
  },
  {
    type: "function",
    name: "describe_table",
    description:
      "Get the schema (columns, types, descriptions) of a database table. Available tables: files, folders, collections.",
    parameters: v.object({
      table: v.string(),
    }),
    execute: async (params: unknown) => {
      const p = params as { table: string };
      const schema = TABLE_SCHEMAS[p.table];
      if (!schema) {
        return {
          error: `Unknown table '${p.table}'. Available: ${Object.keys(TABLE_SCHEMAS).join(", ")}`,
        };
      }
      return schema;
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
      const p = params as { sql: string };
      const error = validateSql(p.sql);
      if (error) return { error };
      try {
        let sql = p.sql.trim().replace(/;+$/, "");
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
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
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
      const p = params as { path: string; offset?: number; limit?: number };
      const referenceScope =
        options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
      if (referenceScope.isActive) {
        const allowedPaths = new Set(referenceScope.allowedPaths);
        if (!allowedPaths.has(p.path)) {
          return {
            error:
              "Path is outside the currently referenced files. Add the target file to references first.",
          };
        }
      }

      const content = await cat(p.path);
      if (p.offset == null && p.limit == null) return content;
      const start = p.offset ?? 0;
      const end = p.limit != null ? start + p.limit : undefined;
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
      const p = params as {
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
      const matches = await grep(p.pattern, {
        cwd: p.cwd ?? "/files",
        ignoreCase: p.ignore_case ?? true,
        maxMatches: p.max_matches ?? 20,
      });
      return matches
        .filter((m) => {
          const idMatch = m.path.match(/\/files\/([^/]+)/);
          if (!idMatch) {
            return !referenceScope.isActive;
          }
          return activeIds.has(idMatch[1]);
        })
        .map((m) => ({
          path: m.path,
          offset: m.offset,
          length: m.length,
        }));
    },
  },
  {
    type: "function",
    name: "remember_user_preference",
    description:
      "Store a durable user communication preference in long-term memory. Use only for future-facing interaction preferences, not one-off task instructions.",
    parameters: v.object({
      user_request: v.string(),
      assistant_reply: v.string(),
      reason: v.string(),
    }),
    execute: async (params: unknown) => {
      const p = params as {
        user_request: string;
        assistant_reply: string;
        reason: string;
      };
      const extractionConfig = options.getMemoryExtractionConfig?.() ?? null;
      if (!extractionConfig?.endpoint || !extractionConfig.apiKey || !extractionConfig.model) {
        return {
          updated: false,
          noticeCount: 0,
          message: "Memory extraction is unavailable because AI settings are incomplete.",
        };
      }

      try {
        const notices = await extractNoticeCandidatesWithAI({
          ...extractionConfig,
          userMessage: p.user_request,
          assistantMessage: p.assistant_reply,
        });
        if (notices.length === 0) {
          return {
            updated: false,
            noticeCount: 0,
            message: "No durable preference found.",
          };
        }

        const result = await upsertGlobalMemoryNotices(notices);
        if (result.updated) {
          options.onMemoryUpdated?.();
        }

        return {
          updated: result.updated,
          noticeCount: result.memory.notices.length,
          message: p.reason,
        };
      } catch (error) {
        return {
          updated: false,
          noticeCount: 0,
          message: error instanceof Error ? error.message : String(error),
        };
      }
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
      const p = params as {
        path: string;
        operation: "write" | "append";
        content: string;
        overwrite?: boolean;
      };
      const path = normalizeWritablePath(p.path);
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

      const overwrite = p.overwrite ?? true;
      const approval = await options.requestWriteApproval({
        path,
        operation: p.operation,
        content: p.content,
        contentLength: p.content.length,
        overwrite,
      });

      if (approval === "deny") {
        return { error: "User denied file modification request." };
      }

      if (p.operation === "write") {
        await opfsWrite(path, p.content, { overwrite });
        return {
          path,
          operation: "write",
          bytesWritten: p.content.length,
          overwrite,
        };
      }

      const targetFile = opfsFile(path);
      const existing = (await targetFile.exists()) ? await targetFile.text() : "";
      const nextContent = `${existing}${p.content}`;
      await opfsWrite(path, nextContent, { overwrite: true });

      return {
        path,
        operation: "append",
        appendedBytes: p.content.length,
        totalBytes: nextContent.length,
      };
    },
  },
  {
    type: "function",
    name: "search_transcript",
    description:
      "Search transcript words by keyword and return direct timestamp ranges with context and media type. Supports filtering by file_id or transcript_path. If no filter is provided, searches all active transcripts.",
    parameters: v.object({
      keyword: v.string(),
      file_id: v.optional(v.string()),
      transcript_path: v.optional(v.string()),
      ignore_case: v.optional(v.boolean(), true),
      max_results: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
        20,
      ),
      context_chars: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(200)),
        48,
      ),
    }),
    execute: async (params: unknown) => {
      const p = params as {
        keyword: string;
        file_id?: string;
        transcript_path?: string;
        ignore_case?: boolean;
        max_results?: number;
        context_chars?: number;
      };
      const keyword = p.keyword.trim();
      if (!keyword) {
        return { error: "keyword cannot be empty" };
      }

      const referenceScope =
        options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
      const scopedIds = new Set(referenceScope.fileIds);
      const activeRows = store.query(
        fileTable.where({ deletedAt: null, purgedAt: null }),
      ) as ReadonlyArray<ActiveFileRow>;

      const targetFiles = activeRows.filter((row) => {
        if (!row.transcriptPath) return false;
        if (row.type !== "audio" && row.type !== "video") return false;
        if (p.file_id && row.id !== p.file_id) return false;
        if (p.transcript_path && row.transcriptPath !== p.transcript_path) {
          return false;
        }
        if (referenceScope.isActive && !scopedIds.has(row.id)) return false;
        return true;
      });

      if (targetFiles.length === 0) {
        return {
          matches: [],
          count: 0,
          searchedFiles: 0,
          error:
            "No matching active transcript files found for the provided filters.",
        };
      }

      const maxResults = p.max_results ?? 20;
      const contextChars = p.context_chars ?? 48;
      const flags = p.ignore_case === false ? "g" : "gi";
      const matches: Array<{
        fileId: string;
        fileName: string;
        mediaType: "video" | "audio";
        timestamp: [number, number];
        context: string;
        match: string;
      }> = [];

      for (const file of targetFiles) {
        if (matches.length >= maxResults || !file.transcriptPath) {
          break;
        }

        let content = "";
        try {
          content = await cat(file.transcriptPath);
        } catch {
          continue;
        }

        const words = parseTranscriptWords(content);
        const ranges = buildWordRanges(words);
        if (ranges.length === 0) {
          continue;
        }

        const transcriptText = ranges.map((word) => word.text).join("");
        const regex = new RegExp(escapeRegExp(keyword), flags);
        let result: RegExpExecArray | null = null;

        while ((result = regex.exec(transcriptText)) !== null) {
          const start = result.index;
          const end = start + result[0].length;
          const startIndex = findRangeIndexAtOffset(ranges, start);
          const endIndex = findRangeIndexAtOffset(ranges, Math.max(end - 1, start));
          const startTimestamp = ranges[startIndex].timestamp[0];
          const endTimestamp = ranges[endIndex].timestamp[1];

          matches.push({
            fileId: file.id,
            fileName: file.name,
            mediaType: file.type === "video" ? "video" : "audio",
            timestamp: [startTimestamp, endTimestamp],
            context: buildContextSnippet(
              transcriptText,
              start,
              end,
              contextChars,
            ),
            match: result[0],
          });

          if (matches.length >= maxResults) {
            break;
          }
        }
      }

      return {
        matches,
        count: matches.length,
        searchedFiles: targetFiles.length,
      };
    },
  },
];
};

export const SYSTEM_PROMPT: PromptSegment = {
  id: "system",
  priority: 100,
  content: `You are Memora's assistant. You help users manage their files, search through transcripts, summarize recordings, and create action items. Be concise and helpful.

## Important: User-facing responses
- NEVER expose internal implementation details to the user (file paths, storage paths, IDs, database columns, JSON structures, OPFS, etc.).
- When you find content in a transcript, tell the user which video/audio/document it belongs to (use the file's "name" column) and at what timestamp, NOT the transcript file path.
- When referencing files, always use the human-readable file name, NOT internal IDs or paths.
- Speak in terms the user understands: "在你的视频《xxx》的第30秒提到了MFCC" instead of "/files/uuid/uuid.transcript.json".
- The user cannot access internal storage directly. Your job is to translate internal data into meaningful, user-friendly answers.
- When your answer includes timestamped media moments, replace it with a code block with info string "memora-jumps" after the natural-language answer.
- The memora-jumps payload must be a JSON array. Each item must be: { "fileId": string, "fileName": string, "mediaType": "video" | "audio", "startSec": number, "endSec": number, "context": string }.

## Database
Available tables: files, folders, collections. Use describe_table to get column details before querying.
Active (non-deleted) rows have: deletedAt IS NULL AND purgedAt IS NULL.

## Cross-session history
- If the user asks about previous chats, earlier conclusions, or "what we discussed before", call list_chat_sessions and read_chat_session as needed.
- Summarize history in user-friendly language. Do not reveal internal IDs or storage details.

## Interactive widgets
- If the user asks for an inline chart, diagram, mockup, artwork, or interactive UI in chat, first activate the \`show-widget-skills\` skill.
- Read \`README.md\`, then the closest module guideline, then that module's required section files before calling \`show_widget\`.
- Keep explanatory prose in the normal assistant response. Use \`show_widget\` only for the rendered widget fragment.

## Transcript format (at transcriptPath)
{ "text": "full transcript", "words": [{ "text": "word", "timestamp": [startSec, endSec] }] }
Word-level timestamps live in the "words" array. Prefer search_transcript to get timestamps directly.

## Workflow
1. describe_table("files") to learn the schema
2. query_db to find relevant files first (always SELECT name and other user-friendly columns alongside paths)
3. use search_transcript with file_id or transcript_path to get direct timestamps and context
4. use read_file or grep_files only when raw file content or exact offsets are needed
5. if the user states a lasting preference for how you should communicate in future turns, call remember_user_preference with a concise summary
6. do NOT call remember_user_preference for one-off formatting requests, temporary constraints, factual profile details, or sensitive inferences
7. use modify_text_file only if the user explicitly asks to create or edit a text file
8. when presenting results, map internal data back to user-friendly file names, types, and timestamps`,
};
