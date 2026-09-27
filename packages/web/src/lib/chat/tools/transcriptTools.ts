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

const findRangeIndexAtOffset = (ranges: TranscriptWordRange[], offset: number): number => {
  for (let index = 0; index < ranges.length; index += 1) {
    if (offset < ranges[index].end) {
      return index;
    }
  }

  return ranges.length - 1;
};

const MAX_CONTEXT_CHARS = 200;
const MAX_READ_SECONDS = 300;
const DEFAULT_READ_SECONDS = 120;
const MAX_LINE_SECONDS = 20;
const SENTENCE_END_PATTERN = /[.?!。？！]["')\]」』]?$/;

const findTranscriptFiles = (
  store: StoreQueryable,
  options: CreateChatToolsOptions,
  filter: { file_id?: string; transcript_path?: string },
): ActiveFileRow[] => {
  const referenceScope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
  const scopedIds = new Set(referenceScope.fileIds);
  const activeRows = store.query(
    fileTable.where({ deletedAt: null, purgedAt: null }),
  ) as ReadonlyArray<ActiveFileRow>;
  return activeRows.filter((row) => {
    if (!row.transcriptPath) return false;
    if (row.type !== "audio" && row.type !== "video") return false;
    if (filter.file_id && row.id !== filter.file_id) return false;
    if (filter.transcript_path && row.transcriptPath !== filter.transcript_path) return false;
    if (referenceScope.isActive && !scopedIds.has(row.id)) return false;
    return true;
  });
};

const formatSeconds = (value: number): string => String(Math.round(value * 10) / 10);

// One line per sentence, or per 20 s of speech when there is no punctuation.
const buildTimedLines = (words: TranscriptWord[]): string[] => {
  const lines: string[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  for (const word of words) {
    if (!text) start = word.timestamp[0];
    text += word.text;
    end = word.timestamp[1];
    if (SENTENCE_END_PATTERN.test(text.trimEnd()) || end - start >= MAX_LINE_SECONDS) {
      lines.push(`[${formatSeconds(start)}-${formatSeconds(end)}] ${text.trim()}`);
      text = "";
    }
  }
  if (text.trim()) lines.push(`[${formatSeconds(start)}-${formatSeconds(end)}] ${text.trim()}`);
  return lines;
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
        "Search transcript words by keyword and return direct timestamp ranges with context and media type. Supports filtering by file_id or transcript_path. If no filter is provided, searches all active transcripts. context_chars is the text kept on each side of a match, at most 200; larger values are capped. To read more of the passage around a match, call read_transcript with its fileId and a time range.",
      parameters: v.object({
        keyword: v.string(),
        file_id: v.optional(v.string()),
        transcript_path: v.optional(v.string()),
        ignore_case: v.optional(v.boolean(), true),
        max_results: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
          20,
        ),
        // Capped in execute rather than rejected: models often ask for a little more.
        context_chars: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 48),
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

        const targetFiles = findTranscriptFiles(store, options, payload);

        if (targetFiles.length === 0) {
          return {
            matches: [],
            count: 0,
            searchedFiles: 0,
            error: "No matching active transcript files found for the provided filters.",
          };
        }

        const maxResults = payload.max_results ?? 20;
        const contextChars = Math.min(payload.context_chars ?? 48, MAX_CONTEXT_CHARS);
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
            const endIndex = findRangeIndexAtOffset(ranges, Math.max(end - 1, start));

            matches.push({
              fileId: file.id,
              fileName: file.name,
              mediaType: file.type === "video" ? "video" : "audio",
              timestamp: [ranges[startIndex].timestamp[0], ranges[endIndex].timestamp[1]],
              context: buildContextSnippet(transcriptText, start, end, contextChars),
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
    {
      type: "function",
      name: "read_transcript",
      description: `Read the transcript of a video or audio file between two times, one line per sentence as "[startSec-endSec] text". Use it to read the passage around a search_transcript match and to find where a point starts and ends before citing it. end_sec defaults to ${DEFAULT_READ_SECONDS} s after start_sec; at most ${MAX_READ_SECONDS} s are returned per call.`,
      parameters: v.object({
        file_id: v.string(),
        start_sec: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
        end_sec: v.optional(v.pipe(v.number(), v.minValue(0))),
      }),
      execute: async (params: unknown) => {
        const payload = params as { file_id: string; start_sec?: number; end_sec?: number };
        const file = findTranscriptFiles(store, options, { file_id: payload.file_id })[0];
        if (!file?.transcriptPath) {
          return { error: `No video or audio file with a transcript has id ${payload.file_id}.` };
        }

        let content = "";
        try {
          content = await cat(file.transcriptPath);
        } catch {
          return { error: "The transcript could not be read." };
        }
        const words = parseTranscriptWords(content);
        if (words.length === 0) {
          return { error: "The transcript is empty." };
        }

        const startSec = payload.start_sec ?? 0;
        const endSec = Math.min(
          payload.end_sec ?? startSec + DEFAULT_READ_SECONDS,
          startSec + MAX_READ_SECONDS,
        );
        const durationSec = words.at(-1)?.timestamp[1] ?? 0;
        const lines = buildTimedLines(
          words.filter((word) => word.timestamp[1] > startSec && word.timestamp[0] < endSec),
        );

        return {
          fileId: file.id,
          fileName: file.name,
          mediaType: file.type === "video" ? "video" : "audio",
          startSec,
          endSec,
          durationSec,
          lines,
          ...(endSec < durationSec && { nextStartSec: endSec }),
        };
      },
    },
  ];
};
