import type { RecordingTranscript } from "@/types/library";
import type { TranscriptSegment } from "./types";

/** Keep untimed text; never manufacture seek positions for unsupported timestamps. */
export const toRecordingTranscript = (
  segments: readonly TranscriptSegment[],
): RecordingTranscript => {
  const finals = segments.filter((segment) => segment.isFinal);
  return {
    text: finals
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" "),
    words: finals.flatMap((segment) =>
      (segment.words ?? []).flatMap((word) => {
        const start = word.startSeconds;
        const end = word.endSeconds;
        if (
          start === undefined ||
          end === undefined ||
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end < start
        )
          return [];
        return [{ text: word.text, timestamp: [start, end] as [number, number] }];
      }),
    ),
  };
};
