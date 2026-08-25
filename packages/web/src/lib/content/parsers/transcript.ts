import type { RecordingTranscript } from "@/types/library";

import type { ContentParser } from "../types";

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
        ? [
            {
              kind: "transcript" as const,
              text,
              headingPath: [],
              locator: {
                kind: "transcript" as const,
                startSeconds: words[0]?.timestamp[0] ?? 0,
                endSeconds: words[words.length - 1]?.timestamp[1] ?? 0,
              },
              searchable: Boolean(text),
            },
          ]
        : [];
    return { title: "Transcript", markdown: text, plainText: text, segments };
  },
};
