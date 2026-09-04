import type { RecordingTranscript, TranscriptWord } from "@/types/library";

import type { ContentParser } from "../types";

// Groups words into segments so search hits carry the timestamp of the
// matching passage instead of the whole recording's start/end.
const WORDS_PER_SEGMENT = 50;

const groupWords = (words: TranscriptWord[]): TranscriptWord[][] => {
  const groups: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
    groups.push(words.slice(i, i + WORDS_PER_SEGMENT));
  }
  return groups;
};

export const transcriptContentParser: ContentParser = {
  name: "transcript",
  version: "transcript-v1",
  supports: (file) => file.name.endsWith(".transcript.json"),
  parse: async ({ file }) => {
    const transcript = JSON.parse(await file.text()) as RecordingTranscript;
    const words = transcript.words ?? [];
    const text = transcript.text.trim();
    const segments =
      words.length > 0
        ? groupWords(words).map((group) => {
            const groupText = group
              .map((word) => word.text)
              .join(" ")
              .trim();
            return {
              kind: "transcript" as const,
              text: groupText,
              headingPath: [],
              locator: {
                kind: "transcript" as const,
                startSeconds: group[0]?.timestamp[0] ?? 0,
                endSeconds: group[group.length - 1]?.timestamp[1] ?? 0,
              },
              searchable: Boolean(groupText),
            };
          })
        : text.length > 0
          ? [
              {
                kind: "text" as const,
                text,
                headingPath: [],
                locator: {
                  kind: "text" as const,
                  startOffset: 0,
                  endOffset: text.length,
                },
                searchable: true,
              },
            ]
          : [];
    return { title: "Transcript", markdown: text, plainText: text, segments };
  },
};
