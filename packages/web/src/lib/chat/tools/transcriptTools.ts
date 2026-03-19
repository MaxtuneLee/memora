import { cat } from "@memora/fs";
import type { ToolDefinition } from "@memora/ai-core";
import * as v from "valibot";

import { fileTable } from "@/livestore/file";

import {
  EMPTY_REFERENCE_SCOPE,
  type ActiveFileRow,
  type CreateChatToolsOptions,
  type StoreQueryable,
  type TranscriptWord,
  type TranscriptWordRange,
} from "./shared";

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
  for (let index = 0; index < ranges.length; index += 1) {
    if (offset < ranges[index].end) {
      return index;
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
  return `${left > 0 ? "..." : ""}${snippet}${right < text.length ? "..." : ""}`;
};

export const createTranscriptTools = (
  store: StoreQueryable,
  options: CreateChatToolsOptions,
): ToolDefinition[] => {
  return [
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
        const payload = params as {
          keyword: string;
          file_id?: string;
          transcript_path?: string;
          ignore_case?: boolean;
          max_results?: number;
          context_chars?: number;
        };
        const keyword = payload.keyword.trim();
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
          if (payload.file_id && row.id !== payload.file_id) return false;
          if (
            payload.transcript_path &&
            row.transcriptPath !== payload.transcript_path
          ) {
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

        const maxResults = payload.max_results ?? 20;
        const contextChars = payload.context_chars ?? 48;
        const flags = payload.ignore_case === false ? "g" : "gi";
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
            const endIndex = findRangeIndexAtOffset(
              ranges,
              Math.max(end - 1, start),
            );

            matches.push({
              fileId: file.id,
              fileName: file.name,
              mediaType: file.type === "video" ? "video" : "audio",
              timestamp: [
                ranges[startIndex].timestamp[0],
                ranges[endIndex].timestamp[1],
              ],
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
